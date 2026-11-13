[CmdletBinding()]
param(
	[Parameter(Mandatory)]
	[ValidatePattern('^[A-Za-z0-9][A-Za-z0-9.-]*$')]
	[string]$HostName,

	[ValidatePattern('^[A-Za-z0-9._-]+$')]
	[string]$User = 'zhidublog-deploy',

	[ValidateRange(1, 65535)]
	[int]$Port = 22,

	[string]$SshKey = '',

	[Parameter(Mandatory)]
	[string]$SiteUrl,

	[ValidatePattern('^/[A-Za-z0-9._/-]+$')]
	[string]$RemoteRoot = '/var/www/zhidublog',

	[switch]$InstallDependencies,

	[switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$DistPath = Join-Path $ProjectRoot 'dist'
$WorkPath = Join-Path $ProjectRoot 'work\deploy'
$ReleaseId = Get-Date -Format 'yyyyMMdd-HHmmss'
$ArchiveName = "zhidublog-$ReleaseId.tar.gz"
$ArchivePath = Join-Path $WorkPath $ArchiveName
$RemoteTarget = "$User@$HostName"
$Uri = $null

if (
	$RemoteRoot -eq '/' -or
	-not $RemoteRoot.StartsWith('/var/www/') -and
	-not $RemoteRoot.StartsWith('/home/')
) {
	throw 'RemoteRoot 必须位于 /var/www/ 或 /home/ 下，避免误删服务器文件。'
}

if ($User -eq 'root') {
	throw '为降低风险，不允许使用 root 发布。请改用在 setup-server.sh 中创建的 zhidublog-deploy 用户。'
}

if (-not [Uri]::TryCreate($SiteUrl, [UriKind]::Absolute, [ref]$Uri) -or $Uri.Scheme -notin @('http', 'https')) {
	throw 'SiteUrl 必须是完整的 http:// 或 https:// 地址。'
}

foreach ($Command in @('node.exe', 'npm.cmd', 'ssh.exe', 'scp.exe', 'tar.exe')) {
	if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
		throw "找不到命令: $Command"
	}
}

$SshArguments = @(
	'-p', "$Port",
	'-o', 'ServerAliveInterval=30',
	'-o', 'ServerAliveCountMax=4',
	'-o', 'StrictHostKeyChecking=accept-new'
)
$ScpArguments = @(
	'-P', "$Port",
	'-o', 'ServerAliveInterval=30',
	'-o', 'ServerAliveCountMax=4',
	'-o', 'StrictHostKeyChecking=accept-new'
)

if ($SshKey) {
	$ResolvedKey = (Resolve-Path -LiteralPath $SshKey).Path
	$SshArguments += @('-i', $ResolvedKey)
	$ScpArguments += @('-i', $ResolvedKey)
}

if ($InstallDependencies) {
	Write-Host '正在安装锁定版本的依赖...'
	Push-Location $ProjectRoot
	try {
		& npm.cmd ci
		if ($LASTEXITCODE -ne 0) {
			throw '依赖安装失败。'
		}
	} finally {
		Pop-Location
	}
}

if (-not $SkipBuild) {
	Write-Host "正在生成站点: $SiteUrl"
	$PreviousSiteUrl = $env:SITE_URL
	$env:SITE_URL = $SiteUrl
	Push-Location $ProjectRoot
	try {
		& npm.cmd run build
		if ($LASTEXITCODE -ne 0) {
			throw 'Astro 构建失败，已停止部署。'
		}
	} finally {
		Pop-Location
		if ($null -eq $PreviousSiteUrl) {
			Remove-Item Env:SITE_URL -ErrorAction SilentlyContinue
		} else {
			$env:SITE_URL = $PreviousSiteUrl
		}
	}
}

Write-Host '正在检查页面链接和基础 SEO...'
& node.exe (Join-Path $ProjectRoot 'scripts\check-site.mjs')
if ($LASTEXITCODE -ne 0) {
	throw '站点检查未通过，已停止部署。'
}

if (-not (Test-Path -LiteralPath (Join-Path $DistPath 'index.html'))) {
	throw '没有找到 dist/index.html，请先完成构建。'
}

New-Item -ItemType Directory -Force -Path $WorkPath | Out-Null

Write-Host '正在打包静态文件...'
& tar.exe -czf $ArchivePath -C $DistPath .
if ($LASTEXITCODE -ne 0) {
	throw '站点打包失败。'
}

Write-Host '正在准备服务器目录...'
$RemotePrepareCommand = @'
set -euo pipefail
umask 077
mkdir -p '__REMOTE_ROOT__/releases'
upload_dir="$HOME/.cache/zhidublog-deploy"
mkdir -p "$upload_dir"
chmod 700 "$upload_dir"
printf '%s' "$upload_dir"
'@
$RemotePrepareCommand = $RemotePrepareCommand.Replace('__REMOTE_ROOT__', $RemoteRoot)
$RemotePrepareOutput = & ssh.exe @SshArguments $RemoteTarget $RemotePrepareCommand
if ($LASTEXITCODE -ne 0) {
	throw "无法连接服务器 $RemoteTarget，请检查 IP、SSH 密钥和安全组 22 端口。"
}

$RemoteUploadDir = (($RemotePrepareOutput -join "`n").Trim().Split("`n")[-1]).Trim()
if ($RemoteUploadDir -notmatch '^/[A-Za-z0-9._/-]+$') {
	throw '服务器返回的上传目录不安全，已停止部署。'
}

Write-Host "正在上传版本 $ReleaseId ..."
& scp.exe @ScpArguments $ArchivePath "${RemoteTarget}:$RemoteUploadDir/$ArchiveName"
if ($LASTEXITCODE -ne 0) {
	throw '上传失败，线上版本没有发生变化。'
}

$RemoteCommand = @'
set -euo pipefail
umask 022

root='__REMOTE_ROOT__'
release_id='__RELEASE_ID__'
archive='__REMOTE_ARCHIVE__'
release_dir="$root/releases/$release_id"

if [[ "$root" != /var/www/* && "$root" != /home/* ]]; then
	printf '拒绝使用不安全的发布目录: %s\n' "$root" >&2
	exit 1
fi

if [[ ! "$release_id" =~ ^[0-9]{8}-[0-9]{6}$ ]]; then
	printf '发布版本号不合法。\n' >&2
	exit 1
fi

if [[ ! -f "$archive" ]]; then
	printf '服务器上找不到上传包。\n' >&2
	exit 1
fi

mkdir -p "$release_dir"
tar -xzf "$archive" -C "$release_dir"
test -f "$release_dir/index.html"

ln -sfn "releases/$release_id" "$root/current.next"
mv -Tf "$root/current.next" "$root/current"
rm -f "$archive"

find "$root/releases" \
	-mindepth 1 \
	-maxdepth 1 \
	-type d \
	-printf '%T@ %f\n' |
	sort -nr |
	tail -n +6 |
	cut -d' ' -f2- |
	while IFS= read -r old_release; do
		if [[ "$old_release" =~ ^[0-9]{8}-[0-9]{6}$ ]]; then
			rm -rf -- "$root/releases/$old_release"
		fi
	done

printf '线上版本已切换为 %s\n' "$release_id"
'@

$RemoteCommand = $RemoteCommand.
	Replace('__REMOTE_ROOT__', $RemoteRoot).
	Replace('__RELEASE_ID__', $ReleaseId).
	Replace('__REMOTE_ARCHIVE__', "$RemoteUploadDir/$ArchiveName")

Write-Host '正在切换线上版本...'
& ssh.exe @SshArguments $RemoteTarget $RemoteCommand
if ($LASTEXITCODE -ne 0) {
	throw '服务器切换版本失败，旧版本仍然保留。'
}

Write-Host '正在检查网站响应...'
try {
	$Response = Invoke-WebRequest -Uri $SiteUrl -UseBasicParsing -TimeoutSec 15
	if ($Response.StatusCode -ge 200 -and $Response.StatusCode -lt 400) {
		Write-Host "部署完成: $SiteUrl (HTTP $($Response.StatusCode))" -ForegroundColor Green
	} else {
		Write-Warning "文件已发布，但网站返回 HTTP $($Response.StatusCode)，请检查 Nginx。"
	}
} catch {
	Write-Warning "文件已发布，但本地检查失败: $($_.Exception.Message)"
	Write-Warning '请确认 DNS、HTTPS 证书和云服务器安全组是否已经配置。'
}
