import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const distDir = path.resolve('dist');
const errors = [];
const htmlFiles = [];
let checkedLinks = 0;
let checkedJsonLd = 0;
const canonicalOrigins = new Set();

if (!existsSync(path.join(distDir, 'index.html'))) {
	console.error('找不到 dist/index.html，请先运行 npm run build。');
	process.exit(1);
}

const walk = async (directory) => {
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const fullPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			await walk(fullPath);
		} else if (entry.name.endsWith('.html')) {
			htmlFiles.push(fullPath);
		}
	}
};

await walk(distDir);

for (const file of htmlFiles) {
	const html = await readFile(file, 'utf8');
	const relativeFile = path.relative(distDir, file);

	for (const [name, pattern] of [
		['title', /<title>[^<]+<\/title>/g],
		['description', /<meta name="description" content="[^"]+"/g],
		['canonical', /<link rel="canonical" href="[^"]+"/g],
		['h1', /<h1\b/g],
		['robots', /<meta name="robots" content="[^"]+"/g],
		['author', /<meta name="author" content="[^"]+"/g],
		['og:url', /<meta property="og:url" content="[^"]+"/g],
		['language', /<html lang="zh-CN">/g],
	]) {
		const count = html.match(pattern)?.length ?? 0;
		if (count !== 1) {
			errors.push(`${relativeFile}: ${name} 数量应为 1，实际为 ${count}`);
		}
	}

	const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
	const ogURL = html.match(/<meta property="og:url" content="([^"]+)"/)?.[1];

	if (canonical) {
		try {
			const canonicalURL = new URL(canonical);
			canonicalOrigins.add(canonicalURL.origin);
			if (canonicalURL.hostname === 'localhost' || canonicalURL.hostname === '127.0.0.1') {
				errors.push(`${relativeFile}: canonical 使用了本地地址 ${canonical}`);
			}
		} catch {
			errors.push(`${relativeFile}: canonical 不是有效的绝对地址 ${canonical}`);
		}
	}

	if (canonical && ogURL && canonical !== ogURL) {
		errors.push(`${relativeFile}: og:url 与 canonical 不一致`);
	}

	const jsonLdBlocks = [
		...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
	];
	const structuredTypes = new Set();

	for (const block of jsonLdBlocks) {
		checkedJsonLd += 1;
		try {
			const data = JSON.parse(block[1]);
			const entries = Array.isArray(data) ? data : [data];
			for (const entry of entries) {
				if (typeof entry?.['@type'] === 'string') structuredTypes.add(entry['@type']);
			}
		} catch {
			errors.push(`${relativeFile}: JSON-LD 无法解析`);
		}
	}

	if (relativeFile === 'index.html' && !structuredTypes.has('WebSite')) {
		errors.push(`${relativeFile}: 缺少 WebSite 结构化数据`);
	}

	const normalizedRelativeFile = relativeFile.replaceAll('\\', '/');
	if (normalizedRelativeFile === 'about/index.html' && !structuredTypes.has('ProfilePage')) {
		errors.push(`${relativeFile}: 缺少 ProfilePage 结构化数据`);
	}

	if (
		normalizedRelativeFile.startsWith('blog/') &&
		normalizedRelativeFile !== 'blog/index.html' &&
		(!structuredTypes.has('BlogPosting') || !structuredTypes.has('BreadcrumbList'))
	) {
		errors.push(`${relativeFile}: 文章页缺少 BlogPosting 或 BreadcrumbList 结构化数据`);
	}

	for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
		const rawURL = match[1];
		if (!rawURL.startsWith('/') || rawURL.startsWith('//')) continue;

		checkedLinks += 1;

		let pathname;
		try {
			pathname = decodeURIComponent(rawURL.split(/[?#]/)[0]);
		} catch {
			errors.push(`${relativeFile}: 无法解析链接 ${rawURL}`);
			continue;
		}

		if (!pathname) continue;

		const normalPath = path.normalize(pathname).replace(/^([/\\])+/, '');
		const candidates = pathname.includes('.')
			? [path.join(distDir, normalPath)]
			: [
					path.join(distDir, normalPath),
					path.join(distDir, normalPath, 'index.html'),
					path.join(distDir, `${normalPath}.html`),
				];

		if (!candidates.some((candidate) => existsSync(candidate))) {
			errors.push(`${relativeFile}: 内部链接不存在 ${rawURL}`);
		}
	}
}

if (canonicalOrigins.size !== 1) {
	errors.push(`canonical 域名应保持一致，实际发现 ${canonicalOrigins.size} 个`);
}

const sitemapPath = path.join(distDir, 'sitemap-index.xml');
if (existsSync(sitemapPath)) {
	const sitemap = await readFile(sitemapPath, 'utf8');
	const sitemapURL = sitemap.match(/<loc>(https?:\/\/[^<]+)<\/loc>/)?.[1];
	if (sitemapURL && canonicalOrigins.size === 1) {
		const sitemapOrigin = new URL(sitemapURL).origin;
		const [canonicalOrigin] = canonicalOrigins;
		if (sitemapOrigin !== canonicalOrigin) {
			errors.push(`站点地图域名 ${sitemapOrigin} 与 canonical 域名 ${canonicalOrigin} 不一致`);
		}
	}
}

if (errors.length > 0) {
	console.error(`站点检查失败，共发现 ${errors.length} 个问题：`);
	for (const error of errors) console.error(`- ${error}`);
	process.exit(1);
}

console.log(
	`站点检查通过：${htmlFiles.length} 个页面，${checkedLinks} 个内部资源链接，${checkedJsonLd} 组 JSON-LD。`,
);
