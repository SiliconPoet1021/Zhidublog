#!/usr/bin/env bash
set -Eeuo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
APP_ROOT="${APP_ROOT:-/var/www/zhidublog}"
DEPLOY_USER="${DEPLOY_USER:-zhidublog-deploy}"
DEPLOY_PUBLIC_KEY="${3:-${DEPLOY_PUBLIC_KEY:-}}"

if [[ $EUID -ne 0 ]]; then
	printf '请使用 sudo 运行此脚本。\n' >&2
	exit 1
fi

if [[ ! "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]]; then
	printf '用法: sudo bash setup-server.sh 你的域名 你的邮箱\n' >&2
	exit 1
fi

if [[ ! "$EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+$ ]]; then
	printf '请提供有效的证书通知邮箱。\n' >&2
	exit 1
fi

if [[ ! "$APP_ROOT" =~ ^/[A-Za-z0-9._/-]+$ || "$APP_ROOT" == "/" ]]; then
	printf 'APP_ROOT 必须是安全的绝对路径。\n' >&2
	exit 1
fi

if [[ "$DEPLOY_USER" == "root" || ! "$DEPLOY_USER" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]]; then
	printf '部署用户不能是 root，请使用小写用户名。\n' >&2
	exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
	printf '此脚本面向 Ubuntu / Debian 系统。\n' >&2
	exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y nginx certbot python3-certbot-nginx ca-certificates curl unattended-upgrades
systemctl enable --now unattended-upgrades >/dev/null 2>&1 ||
	printf '提示：自动安全更新服务未能启动，请稍后手动检查。\n' >&2

if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
	useradd --create-home --shell /bin/bash "$DEPLOY_USER"
	passwd -l "$DEPLOY_USER" >/dev/null
fi

DEPLOY_HOME="$(getent passwd "$DEPLOY_USER" | cut -d: -f6)"
DEPLOY_GROUP="$(id -gn "$DEPLOY_USER")"

if [[ -z "$DEPLOY_HOME" || "$DEPLOY_HOME" == "/" ]]; then
	printf '无法确定部署用户的主目录。\n' >&2
	exit 1
fi

install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_GROUP" "$DEPLOY_HOME/.ssh"

if [[ -n "$DEPLOY_PUBLIC_KEY" ]]; then
	if [[ "$DEPLOY_PUBLIC_KEY" == *$'\n'* || "$DEPLOY_PUBLIC_KEY" == *$'\r'* ]] ||
		[[ ! "$DEPLOY_PUBLIC_KEY" =~ ^(ssh-ed25519|ssh-rsa|ecdsa-sha2-[^[:space:]]+)[[:space:]]+[A-Za-z0-9+/=]+ ]]; then
		printf 'DEPLOY_PUBLIC_KEY 不是有效的 SSH 公钥。\n' >&2
		exit 1
	fi
	printf '%s\n' "$DEPLOY_PUBLIC_KEY" >"$DEPLOY_HOME/.ssh/authorized_keys"
elif [[ ! -s "$DEPLOY_HOME/.ssh/authorized_keys" && -s /root/.ssh/authorized_keys ]]; then
	install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_GROUP" \
		/root/.ssh/authorized_keys \
		"$DEPLOY_HOME/.ssh/authorized_keys"
else
	printf '提示：部署用户 %s 还没有 SSH 公钥。\n' "$DEPLOY_USER" >&2
	printf '请先把公钥追加到 %s/.ssh/authorized_keys。\n' "$DEPLOY_HOME" >&2
fi

install -d -m 755 -o "$DEPLOY_USER" -g "$DEPLOY_GROUP" "$APP_ROOT"
install -d -m 755 -o "$DEPLOY_USER" -g "$DEPLOY_GROUP" "$APP_ROOT/releases"

cat >/etc/nginx/sites-available/zhidublog <<'NGINX'
map $uri $zhidublog_cache_control {
	default "no-cache";
	~^/_astro/ "public, max-age=31536000, immutable";
	~*\.(?:css|js|mjs|svg|png|jpe?g|webp|avif|gif|ico|woff2?|ttf)$ "public, max-age=604800";
}

server {
	listen 80;
	listen [::]:80;
	server_name __DOMAIN__;

	root __APP_ROOT__/current;
	index index.html;
	charset utf-8;
	autoindex off;
	server_tokens off;

	access_log /var/log/nginx/zhidublog.access.log;
	error_log /var/log/nginx/zhidublog.error.log warn;

	add_header X-Content-Type-Options "nosniff" always;
	add_header X-Frame-Options "DENY" always;
	add_header Referrer-Policy "strict-origin-when-cross-origin" always;
	add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
	add_header Strict-Transport-Security "max-age=31536000" always;
	add_header Cross-Origin-Opener-Policy "same-origin" always;
	add_header Cross-Origin-Resource-Policy "same-origin" always;
	add_header Cache-Control $zhidublog_cache_control always;
	add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline' https://hm.baidu.com https://*.baidu.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.baidu.com https://cloudflareinsights.com; media-src 'self' https:; manifest-src 'self'; upgrade-insecure-requests" always;

	location / {
		try_files $uri $uri/ $uri.html =404;
	}

	error_page 404 /404.html;

	location = /404.html {
		internal;
	}

	location = /_headers {
		return 404;
	}

	location ^~ /_astro/ {
		try_files $uri =404;
	}

	location ~* \.(?:css|js|mjs|svg|png|jpe?g|webp|avif|gif|ico|woff2?|ttf)$ {
		try_files $uri =404;
	}

	location ~ /\.(?!well-known) {
		deny all;
	}

	gzip on;
	gzip_vary on;
	gzip_min_length 1024;
	gzip_comp_level 5;
	gzip_types
		text/plain
		text/css
		text/xml
		application/javascript
		application/json
		application/xml
		application/rss+xml
		image/svg+xml;
}
NGINX

sed -i \
	-e "s|__DOMAIN__|$DOMAIN|g" \
	-e "s|__APP_ROOT__|$APP_ROOT|g" \
	/etc/nginx/sites-available/zhidublog

ln -sfn /etc/nginx/sites-available/zhidublog /etc/nginx/sites-enabled/zhidublog
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable --now nginx
systemctl reload nginx

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q '^Status: active'; then
	ufw allow 'Nginx Full'
fi

printf '\nNginx 已配置完成，网站目录: %s/current\n' "$APP_ROOT"

if [[ "${SKIP_SSL:-0}" == "1" ]]; then
	printf '已跳过 HTTPS。稍后可运行: certbot --nginx -d %s\n' "$DOMAIN"
	exit 0
fi

if ! certbot --nginx \
	-d "$DOMAIN" \
	--non-interactive \
	--agree-tos \
	--redirect \
	--keep-until-expiring \
	-m "$EMAIL"; then
	printf '\nHTTPS 申请失败。请确认域名已备案、DNS 已解析到本机，且安全组已放行 80/443 端口。\n' >&2
	printf '排查后可以重新运行: certbot --nginx -d %s\n' "$DOMAIN" >&2
	exit 1
fi

printf '\n服务器初始化完成: https://%s\n' "$DOMAIN"
printf '部署用户: %s\n' "$DEPLOY_USER"
printf '下一步请在本地项目运行 deploy/deploy-domestic.ps1 发布网站。\n'
