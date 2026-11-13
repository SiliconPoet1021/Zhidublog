# 安全说明

## 已有防护

- 公网只暴露静态文件和 Nginx，不暴露写作后台、数据库或 Node.js 服务
- 写作台只监听 `127.0.0.1`
- 写作台修改类接口要求本地来源、JSON 类型和专用安全请求头
- 写作台预览使用沙箱 iframe，文章中的脚本不能在写作台中执行
- 服务器发布使用独立的 `zhidublog-deploy` 用户，不直接使用 root
- SSH 上传包放在部署用户自己的私有缓存目录，不使用共享 `/tmp`
- Nginx 开启 HSTS、CSP、安全响应头、HTTPS 跳转和静态资源缓存
- `.env`、SSH 私钥和本地临时文件不进入 Git
- 发布目录采用版本切换，失败时保留旧版本

## SSH 安全

首次连接服务器前，在云厂商控制台核对服务器 SSH 主机指纹。不要忽略主机指纹变化。

测试可以使用非 root 用户登录后，再关闭 SSH 密码登录：

```bash
sudo tee /etc/ssh/sshd_config.d/99-zhidublog-hardening.conf >/dev/null <<'EOF'
PermitRootLogin prohibit-password
PasswordAuthentication no
KbdInteractiveAuthentication no
EOF
sudo sshd -t
sudo systemctl reload ssh
```

修改前必须确认 SSH 密钥已经可以登录，否则可能把自己锁在服务器外。

云服务器安全组中的 `22` 端口只允许自己的固定 IP 访问。更换网络或 IP 后需要及时调整。

## 密钥规则

- 为博客部署单独创建一把 SSH 密钥，不要复用 Git、云账号或其他服务器的私钥
- SSH 私钥只保存在本机，不粘贴到文章、聊天记录、GitHub 或 `.env` 之外的位置
- `DEPLOY_SSH_KEY` 填写的是私钥文件路径，不是私钥内容
- 如果电脑或私钥泄露，立即从服务器 `authorized_keys` 删除对应公钥并重新生成密钥
- 不要为了方便把写作台端口转发到公网

检查 `.env` 是否被 Git 忽略：

```powershell
git check-ignore .env
```

只有输出 `.env` 才表示保护生效。

## 内容安全

当前没有评论、用户投稿或公开上传功能，文章作者可信。仍然不要直接粘贴来源不明的 HTML、`<script>`、内嵌页面或远程脚本。

如果以后开放评论、登录或投稿，必须先重新做输入校验、内容清洗、权限控制和独立后台，不能直接复用本机写作台。

## 第三方统计

百度统计和 Cloudflare Web Analytics 都不会默认加载，只有填写编号后才启用。启用前应在关于页面说明统计用途，并避免采集与博客运营无关的个人信息。

## 日常维护

Linux 安全更新由 `unattended-upgrades` 自动处理。每月可以手动检查一次：

```bash
sudo apt update
sudo apt upgrade
sudo systemctl status nginx
sudo systemctl status unattended-upgrades
```

检查依赖漏洞：

```powershell
npm audit --omit=dev --registry=https://registry.npmjs.org
```

检查页面和链接：

```powershell
npm run check
```

## 备份与恢复

- 文章源码以 GitHub 仓库和本地项目为备份
- 云服务器建议开启定期磁盘快照
- `/var/www/zhidublog/releases` 保留最近 5 个静态版本
- 如新版本异常，重新发布上一个正常版本即可完成回滚

## 仍需注意的风险

- 本机任何能访问 `127.0.0.1:4322` 的程序都可能使用写作台，因此不要把电脑借给不可信用户
- 如果部署私钥被窃取，攻击者可以向网站发布内容，但非 root 用户限制了服务器层面的破坏范围
- 单台服务器仍然是单点故障，云服务商故障时网站会离线
- 公网 DDoS 防护主要依赖云厂商，Nginx 本身不承担大流量清洗
- CSP 为兼容 Astro 内联脚本保留了 `'unsafe-inline'`，后续可以升级为构建期 nonce 或 hash
