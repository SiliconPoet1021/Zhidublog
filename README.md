# 知渡博客

一个基于 Astro 的个人经验分享站，用来记录技术实践、项目复盘和成长经验。

## 已包含

- 响应式首页、文章列表与文章详情
- 文章关键词搜索、相关推荐和上一篇/下一篇
- 技术实践、成长记录、项目复盘三个分类
- 按年份整理的归档页、标签索引和独立标签页
- 项目作品页、关于页和 404 页面
- Markdown / MDX 文章工作流
- 移动端文章目录、作者卡片、代码复制、章节锚点与文章链接分享
- SEO、结构化数据、社交分享图、站点地图和 RSS
- Cloudflare Pages 自动部署、安全响应头和静态资源缓存
- Cloudflare Web Analytics 访问统计（可选），并保留百度统计接入

## 本地开发

需要 Node.js 22.23.4 或更高版本。

```bash
npm install
npm run dev
```

本地地址为 `http://localhost:4321`。

生产构建：

```bash
npm run build
```

构建结果输出到 `dist/`。

## 编写文章

文章位于 `src/content/blog/`，支持 `.md` 和 `.mdx`。

```yaml
---
title: '文章标题'
description: '用于列表和搜索结果的文章摘要'
pubDate: 2026-11-11
category: tech
tags:
  - Astro
  - 工程化
featured: false
draft: false
---
```

可选字段：

- `updatedDate`：最后更新时间
- `heroImage`：文章封面图片
- `heroImageAlt`：封面图片说明
- `featured`：是否作为首页精选
- `draft`：草稿文章不会出现在生产构建中

`category` 可选值：

- `tech`：技术实践
- `growth`：成长记录
- `project`：项目复盘

## 代码块和数学公式

代码块使用三个反引号，并在开头标注语言，构建时会自动生成语法高亮：

````markdown
```python
def greet(name):
    return f"Hello, {name}"
```
````

数学公式使用 LaTeX 语法：

```markdown
行内公式：$E = mc^2$

$$
\int_0^1 x^2 \, dx = \frac{1}{3}
$$
```

文章正文支持公式。如果正文确实需要显示美元符号，请写成 `\$`，避免被识别为公式。完整示例见 `src/content/blog/latex-math-guide.md`。

Markdown、代码高亮和数学公式都在构建阶段解析。Cloudflare Pages 只发布已经生成的 HTML、CSS、字体和图片，不会在每次访问时重新解析文章，也不需要数据库或长期运行的 Node.js 服务。

文章文件名为 URL 的一部分。例如 `why-astro-static-first.md` 会生成：

```text
/blog/why-astro-static-first/
```

## 访问统计

第一版可以使用 Cloudflare Web Analytics 查看访问人数、浏览量、热门页面和来源趋势。面向中国大陆读者时，也可以同时接入百度统计。没有填写对应编号或令牌时，不会加载任何统计脚本。

1. 在百度统计中新增网站并获取统计代码编号。
2. 在百度搜索资源平台完成站点验证并提交 `sitemap-index.xml`。
3. 复制 `.env.example` 为 `.env`，填写编号。

```env
PUBLIC_BAIDU_ANALYTICS_ID=你的百度统计编号
PUBLIC_BAIDU_SITE_VERIFICATION=你的站点验证代码
PUBLIC_CF_WEB_ANALYTICS_TOKEN=你的统计令牌
```

百度统计适合补充中国大陆的访问数据。后续需要更完整的自有管理看板时，可以再接入 Umami 或 Cloudflare 的自定义分析方案。

## 部署

### Cloudflare Pages（推荐）

Cloudflare Pages 直接连接 GitHub 仓库，不需要购买服务器或配置 Nginx。以后把文章推送到 GitHub，Pages 会自动重新构建上线。

在 Cloudflare 控制台进入 **Workers & Pages → Create → Pages → Connect to Git**，选择 `SiliconPoet1021/Zhidublog`，使用以下配置：

| 配置项 | 值 |
| --- | --- |
| Project name | `zhidublog` |
| Production branch | `main` |
| Framework preset | Astro |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` |

建议添加以下环境变量：

```env
SITE_URL=https://你的域名
NODE_VERSION=22.23.4
PUBLIC_BAIDU_ANALYTICS_ID=
PUBLIC_BAIDU_SITE_VERIFICATION=
PUBLIC_CF_WEB_ANALYTICS_TOKEN=
```

尚未绑定自定义域名时，`SITE_URL` 可以先填写 Pages 分配的 `https://项目名.pages.dev`。绑定域名后再改成正式地址并重新部署。

完整上线步骤见 [deploy/CLOUDFLARE.md](deploy/CLOUDFLARE.md)。

### 国内服务器（可选备用）

项目仍然保留 Nginx 初始化脚本和 Windows 一键发布能力：

```text
deploy/setup-server.sh
deploy/deploy-domestic.ps1
deploy/README.md
```

国内服务器需要已备案域名，并需要在 `.env` 中额外填写服务器信息。完整步骤见 [deploy/README.md](deploy/README.md)，上线和安全检查分别见 [deploy/LAUNCH.md](deploy/LAUNCH.md) 与 [deploy/SECURITY.md](deploy/SECURITY.md)。

Cloudflare Pages 不需要配置 `DEPLOY_HOST` 和 SSH 密钥。

## 项目结构

```text
src/
├── components/       公共组件
├── content/blog/     Markdown / MDX 文章
├── layouts/          页面布局
├── lib/              文章读取与工具函数
├── pages/            路由页面
└── styles/           全局样式
scripts/check-site.mjs 上线前页面检查
deploy/                Cloudflare 指南与可选国内部署脚本
```

## 上线前检查

- 修改 `src/consts.ts` 中的站点名称和 GitHub 地址
- 修改 `src/pages/about.astro` 中的个人介绍
- 添加或替换 `src/content/blog/` 中的示例文章
- 在 Cloudflare Pages 中配置 `SITE_URL` 和 `NODE_VERSION`
- 配置访问统计令牌
- 运行 `npm run check` 检查页面链接和基础 SEO
- 用手机和桌面浏览器分别检查文章阅读体验
