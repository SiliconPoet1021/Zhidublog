import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import matter from 'gray-matter';
import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const studioDir = path.join(rootDir, 'studio');
const katexDistDir = path.join(rootDir, 'node_modules', 'katex', 'dist');

try {
	process.loadEnvFile(path.join(rootDir, '.env'));
} catch (error) {
	if (error?.code !== 'ENOENT') throw error;
}

const contentDir = process.env.STUDIO_CONTENT_DIR
	? path.resolve(process.env.STUDIO_CONTENT_DIR)
	: path.join(rootDir, 'src', 'content', 'blog');
const host = '127.0.0.1';
const port = Number(process.env.STUDIO_PORT || 4322);
const maxBodySize = 2 * 1024 * 1024;
const categories = new Set(['tech', 'growth', 'project']);
const staticFiles = new Map([
	['/', 'index.html'],
	['/index.html', 'index.html'],
	['/app.js', 'app.js'],
	['/styles.css', 'styles.css'],
]);

marked.setOptions({
	gfm: true,
	breaks: false,
});
marked.use(
	markedKatex({
		throwOnError: false,
		errorColor: '#cf5c3e',
	}),
);

class HttpError extends Error {
	constructor(status, message) {
		super(message);
		this.status = status;
	}
}

const sendJson = (response, status, data) => {
	response.writeHead(status, {
		'Content-Type': 'application/json; charset=utf-8',
		'Cache-Control': 'no-store',
	});
	response.end(JSON.stringify(data));
};

const readRequestBody = (request) =>
	new Promise((resolve, reject) => {
		let body = '';
		let size = 0;

		request.on('data', (chunk) => {
			size += chunk.length;
			if (size > maxBodySize) {
				reject(new HttpError(413, '内容超过 2MB 限制。'));
				request.destroy();
				return;
			}
			body += chunk;
		});

		request.on('end', () => resolve(body));
		request.on('error', reject);
	});

const readJsonBody = async (request) => {
	const raw = await readRequestBody(request);
	if (!raw) return {};

	try {
		return JSON.parse(raw);
	} catch {
		throw new HttpError(400, '请求内容不是有效的 JSON。');
	}
};

const assertAllowedOrigin = (request, { required = false } = {}) => {
	const origin = request.headers.origin;
	if (!origin) {
		if (required) throw new HttpError(403, '缺少本地写作台请求来源。');
		return;
	}

	const allowedOrigins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
	if (!allowedOrigins.has(origin)) {
		throw new HttpError(403, '只允许从本地写作台发起请求。');
	}
};

const assertTrustedMutation = (request) => {
	assertAllowedOrigin(request, { required: true });

	if (request.headers['x-zhidublog-studio'] !== '1') {
		throw new HttpError(403, '请求缺少写作台安全标记。');
	}

	const contentType = String(request.headers['content-type'] || '').toLowerCase();
	if (!contentType.startsWith('application/json')) {
		throw new HttpError(415, '写作台只接受 JSON 请求。');
	}
};

const assertSlug = (value) => {
	const slug = String(value || '').trim();
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) {
		throw new HttpError(400, 'URL 名称只能使用小写字母、数字和短横线，最长 80 个字符。');
	}
	return slug;
};

const toDateOnly = (value) => {
	if (!value) return '';
	if (value instanceof Date && !Number.isNaN(value.valueOf())) {
		return value.toISOString().slice(0, 10);
	}

	const parsed = new Date(value);
	if (!Number.isNaN(parsed.valueOf())) {
		return parsed.toISOString().slice(0, 10);
	}

	return String(value).slice(0, 10);
};

const normalizeDate = (value, fallback = new Date().toISOString().slice(0, 10)) => {
	const date = String(value || fallback).trim();
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
		throw new HttpError(400, '发布日期格式应为 YYYY-MM-DD。');
	}
	return date;
};

const normalizeTags = (value) => {
	const tags = Array.isArray(value) ? value : String(value || '').split(',');

	return tags
		.map((tag) => String(tag).trim())
		.filter(Boolean)
		.slice(0, 12)
		.map((tag) => tag.slice(0, 30));
};

const stripMarkdown = (content) =>
	content
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/[#>*_`~-]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

const toPostSummary = (slug, parsed) => ({
	slug,
	title: String(parsed.data.title || '未命名文章'),
	description: String(parsed.data.description || ''),
	pubDate: toDateOnly(parsed.data.pubDate),
	updatedDate: toDateOnly(parsed.data.updatedDate),
	category: categories.has(parsed.data.category) ? parsed.data.category : 'tech',
	tags: Array.isArray(parsed.data.tags) ? parsed.data.tags.map(String) : [],
	featured: Boolean(parsed.data.featured),
	draft: Boolean(parsed.data.draft),
});

const postPath = (slug) => path.join(contentDir, `${assertSlug(slug)}.md`);

const fileExists = async (filePath) => {
	try {
		await stat(filePath);
		return true;
	} catch {
		return false;
	}
};

const listPosts = async () => {
	await mkdir(contentDir, { recursive: true });
	const files = (await readdir(contentDir)).filter((file) => file.endsWith('.md'));
	const posts = [];

	for (const file of files) {
		const raw = await readFile(path.join(contentDir, file), 'utf8');
		const parsed = matter(raw);
		posts.push(toPostSummary(path.basename(file, '.md'), parsed));
	}

	return posts.sort((a, b) => b.pubDate.localeCompare(a.pubDate));
};

const getPost = async (slug) => {
	const filePath = postPath(slug);
	const raw = await readFile(filePath, 'utf8');
	const parsed = matter(raw);

	return {
		...toPostSummary(slug, parsed),
		content: parsed.content.trim(),
	};
};

const defaultSlug = () => {
	const now = new Date();
	const date = now.toISOString().slice(0, 10).replaceAll('-', '');
	const time = now.toTimeString().slice(0, 8).replaceAll(':', '');
	return `post-${date}-${time}`;
};

const savePost = async (input) => {
	await mkdir(contentDir, { recursive: true });

	const title = String(input.title || '').trim();
	if (!title) throw new HttpError(400, '请先填写文章标题。');
	if (title.length > 120) throw new HttpError(400, '文章标题不能超过 120 个字符。');

	const slug = assertSlug(input.slug || defaultSlug());
	const originalSlug = input.originalSlug ? assertSlug(input.originalSlug) : '';
	const category = categories.has(input.category) ? input.category : 'tech';
	const content = String(input.content || '').trim();
	if (!content) throw new HttpError(400, '文章正文不能为空。');

	const description =
		String(input.description || '').trim().slice(0, 300) || stripMarkdown(content).slice(0, 150);
	const pubDate = normalizeDate(input.pubDate);
	const tags = normalizeTags(input.tags);
	const targetFile = postPath(slug);
	const originalFile = originalSlug ? postPath(originalSlug) : '';
	const isEditing = originalFile ? await fileExists(originalFile) : false;

	if (originalFile && originalFile !== targetFile && (await fileExists(targetFile))) {
		throw new HttpError(409, `URL 名称“${slug}”已经被另一篇文章使用。`);
	}

	let previousData = {};
	if (isEditing) {
		const previous = matter(await readFile(originalFile, 'utf8'));
		previousData = previous.data;
	}

	const nextData = {
		...previousData,
		title,
		description,
		pubDate,
		category,
		tags,
		featured: Boolean(input.featured),
		draft: Boolean(input.draft),
	};

	if (isEditing) {
		nextData.updatedDate = new Date().toISOString().slice(0, 10);
	} else {
		delete nextData.updatedDate;
	}

	const output = matter.stringify(`${content}\n`, nextData);
	await writeFile(targetFile, output, 'utf8');

	if (isEditing && originalFile !== targetFile) {
		await unlink(originalFile);
	}

	return getPost(slug);
};

const importMarkdown = (raw) => {
	const parsed = matter(String(raw || ''));
	const title = String(parsed.data.title || '').trim();
	const suggestedSlug = title
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);

	return {
		title,
		slug: suggestedSlug,
		description: String(parsed.data.description || stripMarkdown(parsed.content).slice(0, 150)),
		pubDate: toDateOnly(parsed.data.pubDate) || new Date().toISOString().slice(0, 10),
		category: categories.has(parsed.data.category) ? parsed.data.category : 'growth',
		tags: Array.isArray(parsed.data.tags) ? parsed.data.tags.map(String).join(', ') : '',
		featured: Boolean(parsed.data.featured),
		draft: Boolean(parsed.data.draft),
		content: parsed.content.trim(),
	};
};

const runGit = async (args, options = {}) => {
	try {
		const result = await execFileAsync('git', args, {
			cwd: rootDir,
			windowsHide: true,
			maxBuffer: 2 * 1024 * 1024,
		});
		return { code: 0, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
	} catch (error) {
		if (options.allowExitCodes?.includes(error.code)) {
			return {
				code: error.code,
				stdout: String(error.stdout || '').trim(),
				stderr: String(error.stderr || '').trim(),
			};
		}
		throw new HttpError(500, String(error.stderr || error.message).trim());
	}
};

const deployToDomesticServer = async () => {
	const deployHost = String(process.env.DEPLOY_HOST || '').trim();
	if (!deployHost) return null;

	if (process.platform !== 'win32') {
		throw new HttpError(500, '自动部署脚本目前只支持 Windows 本地写作台。');
	}

	const siteUrl = String(process.env.SITE_URL || '').trim();
	if (!siteUrl) {
		throw new HttpError(500, '自动部署需要先在 .env 中填写 SITE_URL。');
	}

	const powershell = 'powershell.exe';
	const scriptPath = path.join(rootDir, 'deploy', 'deploy-domestic.ps1');
	const args = [
		'-NoProfile',
		'-ExecutionPolicy',
		'Bypass',
		'-File',
		scriptPath,
		'-HostName',
		deployHost,
		'-SiteUrl',
		siteUrl,
	];
	const deployUser = String(process.env.DEPLOY_USER || '').trim();
	const deployPort = String(process.env.DEPLOY_PORT || '').trim();
	const sshKey = String(process.env.DEPLOY_SSH_KEY || '').trim();

	if (deployUser) args.push('-User', deployUser);
	if (deployPort) args.push('-Port', deployPort);
	if (sshKey) args.push('-SshKey', sshKey);

	try {
		const result = await execFileAsync(powershell, args, {
			cwd: rootDir,
			windowsHide: true,
			maxBuffer: 8 * 1024 * 1024,
		});
		return [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
	} catch (error) {
		const detail = String(error.stderr || error.stdout || error.message).trim();
		throw new HttpError(500, detail);
	}
};

const publishPost = async (slug) => {
	const filePath = postPath(slug);
	if (!(await fileExists(filePath))) {
		throw new HttpError(404, '找不到这篇文章，请先保存。');
	}

	const relativePath = path.relative(rootDir, filePath).replaceAll('\\', '/');
	const parsed = matter(await readFile(filePath, 'utf8'));
	const title = String(parsed.data.title || slug).replace(/[\r\n]+/g, ' ').slice(0, 100);

	await runGit(['add', '--', relativePath]);
	const diff = await runGit(['diff', '--cached', '--quiet', '--', relativePath], {
		allowExitCodes: [1],
	});

	const hasChanges = diff.code === 1;
	if (hasChanges) {
		await runGit(['commit', '--only', '-m', `content: publish ${title}`, '--', relativePath]);
	}

	const branch = (await runGit(['branch', '--show-current'])).stdout;
	if (!branch) throw new HttpError(500, '当前 Git 仓库不在任何分支上。');

	const upstream = await runGit(
		['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'],
		{ allowExitCodes: [128] },
	);

	const push =
		upstream.code === 0
			? await runGit(['push'])
			: await runGit(['push', '-u', 'origin', branch]);

	let deployOutput = null;
	try {
		deployOutput = await deployToDomesticServer();
	} catch (error) {
		throw new HttpError(
			500,
			`文章已提交并推送到 GitHub，但国内服务器没有更新。${error.message}`,
		);
	}

	return {
		pushed: true,
		deployed: Boolean(deployOutput),
		message: deployOutput
			? '文章已同步到 GitHub，并发布到国内服务器。'
			: hasChanges
				? '文章已提交并推送到 GitHub，Cloudflare Pages 将自动重新部署。'
				: '没有新的文件改动，已同步现有提交到 GitHub。',
		output: [push.stdout, push.stderr, deployOutput].filter(Boolean).join('\n'),
	};
};

const handleApi = async (request, response, pathname) => {
	if (request.method !== 'GET' && request.method !== 'HEAD') {
		assertTrustedMutation(request);
	} else {
		assertAllowedOrigin(request);
	}

	if (request.method === 'GET' && pathname === '/api/posts') {
		sendJson(response, 200, { posts: await listPosts() });
		return;
	}

	if (request.method === 'GET' && pathname.startsWith('/api/posts/')) {
		const slug = decodeURIComponent(pathname.slice('/api/posts/'.length));
		sendJson(response, 200, { post: await getPost(assertSlug(slug)) });
		return;
	}

	if (request.method === 'POST' && pathname === '/api/preview') {
		const input = await readJsonBody(request);
		const html = await marked.parse(String(input.content || ''));
		sendJson(response, 200, { html });
		return;
	}

	if (request.method === 'POST' && pathname === '/api/import') {
		const input = await readJsonBody(request);
		sendJson(response, 200, { post: importMarkdown(input.raw) });
		return;
	}

	if (request.method === 'POST' && pathname === '/api/posts') {
		const input = await readJsonBody(request);
		const post = await savePost(input);
		sendJson(response, 200, { post });
		return;
	}

	if (request.method === 'POST' && pathname === '/api/publish') {
		const input = await readJsonBody(request);
		const result = await publishPost(assertSlug(input.slug));
		sendJson(response, 200, result);
		return;
	}

	throw new HttpError(404, '接口不存在。');
};

const serveStatic = async (response, pathname) => {
	const fileName = staticFiles.get(pathname);
	if (!fileName) return false;

	const filePath = path.join(studioDir, fileName);
	const content = await readFile(filePath);
	const contentTypes = {
		'.html': 'text/html; charset=utf-8',
		'.js': 'text/javascript; charset=utf-8',
		'.css': 'text/css; charset=utf-8',
	};

	response.writeHead(200, {
		'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream',
		'Cache-Control': 'no-store',
		'X-Content-Type-Options': 'nosniff',
		'X-Frame-Options': 'DENY',
		'Referrer-Policy': 'no-referrer',
		'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
	});
	response.end(content);
	return true;
};

const serveKatex = async (response, pathname) => {
	const prefix = '/katex/';
	if (!pathname.startsWith(prefix)) return false;

	const relativePath = decodeURIComponent(pathname.slice(prefix.length));
	if (!/^(?:katex\.min\.css|fonts\/[A-Za-z0-9_-]+\.(?:woff2|woff|ttf))$/.test(relativePath)) {
		return false;
	}

	const filePath = path.resolve(katexDistDir, relativePath);
	if (!filePath.startsWith(`${katexDistDir}${path.sep}`)) return false;

	const contentTypes = {
		'.css': 'text/css; charset=utf-8',
		'.woff2': 'font/woff2',
		'.woff': 'font/woff',
		'.ttf': 'font/ttf',
	};
	const content = await readFile(filePath);

	response.writeHead(200, {
		'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream',
		'Cache-Control': 'public, max-age=3600',
		'X-Content-Type-Options': 'nosniff',
		'Access-Control-Allow-Origin': '*',
	});
	response.end(content);
	return true;
};

const server = createServer(async (request, response) => {
	const url = new URL(request.url || '/', `http://${host}:${port}`);

	try {
		if (url.pathname.startsWith('/api/')) {
			await handleApi(request, response, url.pathname);
			return;
		}

		if (request.method === 'GET') {
			if (await serveStatic(response, url.pathname)) return;
			if (await serveKatex(response, url.pathname)) return;
		}

		throw new HttpError(404, '页面不存在。');
	} catch (error) {
		const status = error instanceof HttpError ? error.status : 500;
		const message = error instanceof Error ? error.message : '未知错误。';
		if (!response.headersSent) sendJson(response, status, { error: message });
		else response.end();

		if (status >= 500) console.error(error);
	}
});

server.listen(port, host, () => {
	const studioURL = `http://${host}:${port}`;
	console.log(`知渡写作台：http://${host}:${port}`);
	console.log(`文章目录：${contentDir}`);
	console.log('按 Ctrl+C 停止写作台。');

	if (process.env.STUDIO_NO_OPEN !== '1') {
		const opener =
			process.platform === 'win32'
				? { command: 'cmd.exe', args: ['/c', 'start', '', studioURL] }
				: process.platform === 'darwin'
					? { command: 'open', args: [studioURL] }
					: { command: 'xdg-open', args: [studioURL] };

		execFile(opener.command, opener.args, { windowsHide: true }, () => {});
	}
});
