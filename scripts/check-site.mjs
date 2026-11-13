import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const distDir = path.resolve('dist');
const errors = [];
const htmlFiles = [];
let checkedLinks = 0;

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
	]) {
		const count = html.match(pattern)?.length ?? 0;
		if (count !== 1) {
			errors.push(`${relativeFile}: ${name} 数量应为 1，实际为 ${count}`);
		}
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

if (errors.length > 0) {
	console.error(`站点检查失败，共发现 ${errors.length} 个问题：`);
	for (const error of errors) console.error(`- ${error}`);
	process.exit(1);
}

console.log(`站点检查通过：${htmlFiles.length} 个页面，${checkedLinks} 个内部资源链接。`);
