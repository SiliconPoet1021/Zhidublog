# 国内服务器上线清单（可选）

## 1. 域名和备案

- 域名实名认证已通过
- 域名已在服务器所在云厂商完成 ICP 备案
- `@` 和 `www` 的 A 记录已指向服务器公网 IP
- 云服务器安全组已放行 `22`、`80`、`443`

检查解析：

```powershell
Resolve-DnsName 你的域名
```

## 2. 配置 `.env`

```env
SITE_URL=https://你的域名
DEPLOY_HOST=你的服务器IP
DEPLOY_USER=zhidublog-deploy
DEPLOY_PORT=22
DEPLOY_SSH_KEY=C:\Users\你的用户名\.ssh\zhidublog
PUBLIC_BAIDU_ANALYTICS_ID=
PUBLIC_BAIDU_SITE_VERIFICATION=
```

不要把 `.env` 或 SSH 私钥提交到 GitHub。

## 3. 初始化服务器

```powershell
scp .\deploy\setup-server.sh root@你的服务器IP:/root/
ssh root@你的服务器IP "bash /root/setup-server.sh 你的域名 你的邮箱"
```

看到 `https://你的域名` 且证书申请成功后，再继续发布。

确认非 root 发布用户已经可以使用密钥登录：

```powershell
ssh -i "$HOME\.ssh\zhidublog" zhidublog-deploy@你的服务器IP "whoami"
```

应输出 `zhidublog-deploy`。更完整的安全加固步骤见 [SECURITY.md](SECURITY.md)。

## 4. 本地检查

```powershell
npm run check
```

必须看到：

```text
站点检查通过
```

## 5. 发布

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\deploy-domestic.ps1 `
  -HostName "你的服务器IP" `
  -SiteUrl "https://你的域名" `
  -SshKey "$HOME\.ssh\zhidublog"
```

部署脚本会先检查页面链接和基础 SEO，检查失败时不会覆盖线上版本。

## 6. 百度收录

1. 登录百度搜索资源平台。
2. 添加 `https://你的域名`。
3. 使用 `.env` 中的验证代码完成验证。
4. 提交 `https://你的域名/sitemap-index.xml`。
5. 在百度统计中添加同一网站并填写统计编号。

## 7. 上线后检查

- 首页、文章、关于、项目页面可以打开
- 手机端顶部导航和文章正文正常
- 代码块可以横向滚动并复制
- 数学公式和公式字体正常
- `/rss.xml`、`/sitemap-index.xml`、`/robots.txt` 可以访问
- `http://你的域名` 会自动跳转到 HTTPS
- 百度统计后台能够看到实时访问
