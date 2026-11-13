# Cloudflare Pages 上线指南

## 1. 推送 GitHub

确认 `.env`、SSH 私钥和 `work/` 没有被 Git 跟踪：

```powershell
git status
```

提交并推送当前项目：

```powershell
git add .
git commit -m "feat: prepare Cloudflare Pages deployment"
git push origin main
```

不要提交 `.env`、服务器密码或 SSH 私钥。

## 2. 创建 Pages 项目

1. 登录 Cloudflare 控制台。
2. 进入 **Workers & Pages → Create → Pages → Connect to Git**。
3. 授权 GitHub 并选择 `SiliconPoet1021/Zhidublog`。
4. 项目名填写 `zhidublog`。
5. 生产分支选择 `main`。
6. Framework preset 选择 `Astro`。
7. Build command 填写 `npm run build`。
8. Build output directory 填写 `dist`。
9. Root directory 保持 `/`。

## 3. 环境变量

在 Pages 项目的 **Settings → Variables and Secrets** 中添加：

```env
NODE_VERSION=22.23.4
SITE_URL=https://项目名.pages.dev
PUBLIC_BAIDU_ANALYTICS_ID=
PUBLIC_BAIDU_SITE_VERIFICATION=
PUBLIC_CF_WEB_ANALYTICS_TOKEN=
```

没有的统计编号可以留空。不要填写 SSH 私钥。

## 4. 首次部署

保存配置并点击 **Save and Deploy**。观察构建日志，成功后会得到：

```text
https://项目名.pages.dev
```

把实际地址更新到 `SITE_URL` 后重新部署一次，确保 canonical、RSS、站点地图和 robots.txt 使用正确域名。

## 5. 绑定域名

在 Pages 项目的 **Custom domains** 中绑定正式域名：

1. 添加根域名和 `www`。
2. 按 Cloudflare 提示修改 DNS。
3. 将 `SITE_URL` 改为 `https://正式域名`。
4. 重新部署并检查 HTTPS。

Cloudflare 托管不要求中国大陆 ICP 备案，但域名实名认证仍按注册商要求办理。

## 6. 写作与自动发布

文章仍然使用 Markdown 编写。发布流程：

1. 在 `src/content/blog/` 新建或修改 Markdown 文件。
2. 运行 `npm run check` 检查构建和页面链接。
3. 提交并推送到 GitHub。
4. Cloudflare Pages 自动检测 `main` 分支更新、构建并发布新版网站。

Cloudflare Pages 不需要配置 `DEPLOY_HOST`，也不需要服务器 SSH 密钥。

## 7. 上线后检查

- 首页、文章、关于、项目页面能够打开
- 手机端导航和文章阅读正常
- 代码高亮和数学公式正常
- `/rss.xml`、`/sitemap-index.xml`、`/robots.txt` 可以访问
- `http://` 自动跳转到 HTTPS
- Cloudflare 的 Security Headers 中可以看到 `_headers` 已生效
- 百度统计后台能看到访问数据

## 8. 回滚

在 Cloudflare Pages 的 **Deployments** 中选择上一个正常版本，点击 **Rollback**。

## 注意事项

- `.pages.dev` 在中国大陆部分网络下可能不稳定，正式使用建议绑定自己的域名并实测
- 开启 Cloudflare 账号的两步验证
- 不要创建权限过大的 API Token，也不要把它写入仓库
- 免费套餐有构建次数和流量限制，以 Cloudflare 当前控制台说明为准
