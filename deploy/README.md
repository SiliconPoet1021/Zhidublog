# 国内服务器部署（可选）

项目采用 Astro 静态构建，服务器只需要 Nginx，不需要一直运行 Node.js。发布通过项目中的命令行脚本完成。

## 方案

- 本地 Windows 构建 `dist/`
- 通过 SSH 上传到国内 Linux 服务器
- 每次发布保存为独立版本，切换成功后自动清理旧版本
- Nginx + HTTPS 提供公网访问
- 服务器保留最近 5 个版本，切换失败时旧版本不受影响

## 上线前准备

1. 准备一台 Ubuntu 22.04 或 24.04 云服务器。
2. 如果使用域名，确认域名已完成工信部 ICP 备案。
3. 在域名服务商处添加 `A` 记录，指向服务器公网 IP。
4. 在云服务器安全组中放行 `22`、`80`、`443` 端口。
5. 建议仅允许自己的 IP 访问 SSH 的 `22` 端口。

建议先配置 SSH 密钥，后续命令行发布时才能在不输入密码的情况下上传：

```powershell
ssh-keygen -t ed25519 -f "$HOME\.ssh\zhidublog" -C "zhidublog-deploy"
Get-Content "$HOME\.ssh\zhidublog.pub" | ssh root@你的服务器IP "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

## 第一次配置服务器

把初始化脚本上传到服务器：

```powershell
scp .\deploy\setup-server.sh root@你的服务器IP:/root/
```

然后运行：

```powershell
ssh root@你的服务器IP "bash /root/setup-server.sh 你的域名 你的邮箱"
```

脚本会完成：

- 安装 Nginx 和 Certbot
- 创建没有 root 权限的 `zhidublog-deploy` 发布用户
- 将 root 已配置的 SSH 公钥复制给发布用户
- 创建 `/var/www/zhidublog/releases/`
- 写入站点专用 Nginx 配置
- 申请并启用 HTTPS
- 配置静态资源缓存和安全响应头

如果 DNS 还没有解析，可以先跳过 HTTPS：

```powershell
ssh root@你的服务器IP "SKIP_SSL=1 bash /root/setup-server.sh 你的域名 你的邮箱"
```

之后运行 `certbot --nginx -d 你的域名` 补上证书。

## 发布网站

首次发布：

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\deploy-domestic.ps1 `
  -HostName "你的服务器IP" `
  -User "zhidublog-deploy" `
  -SiteUrl "https://你的域名" `
  -SshKey "$HOME\.ssh\zhidublog"
```

以后更新文章时，可以省略依赖安装：

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\deploy-domestic.ps1 `
  -HostName "你的服务器IP" `
  -SiteUrl "https://你的域名" `
  -SshKey "$HOME\.ssh\zhidublog"
```

`zhidublog-deploy` 默认是锁定密码的发布用户，需要使用 SSH 密钥。不要为了自动发布而给这个用户设置简单密码。

## 常用检查

安全规则、SSH 加固、依赖检查和密钥泄露后的处理方式见 [SECURITY.md](SECURITY.md)。

查看 Nginx 状态：

```bash
sudo systemctl status nginx
```

检查配置文件：

```bash
sudo nginx -t
```

查看访问日志：

```bash
sudo tail -f /var/log/nginx/zhidublog.access.log
```

查看已保留的线上版本：

```bash
ls -lah /var/www/zhidublog/releases
readlink -f /var/www/zhidublog/current
```

## 访问统计

使用国内服务器时，不建议依赖 Cloudflare 的统计和防护功能。下一版可以接入：

- 百度统计：已经预留接入，适合第一版
- 自建 Umami：数据掌握在自己手里，可提供独立管理看板
- 自建 Plausible：界面简洁，但资源和配置要求更高

在 `.env` 中填写：

```env
PUBLIC_BAIDU_ANALYTICS_ID=你的百度统计编号
PUBLIC_BAIDU_SITE_VERIFICATION=你的百度站点验证代码
```

百度搜索资源平台中的站点地址应与 `SITE_URL` 完全一致，并提交 `https://你的域名/sitemap-index.xml`。

写作后台保持本机访问即可，公网只开放静态博客和统计脚本，避免后台登录入口暴露在互联网。
