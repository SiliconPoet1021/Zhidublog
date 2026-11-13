const elements = {
	postCount: document.querySelector('#postCount'),
	postList: document.querySelector('#postList'),
	searchInput: document.querySelector('#searchInput'),
	newPostButton: document.querySelector('#newPostButton'),
	emptyNewButton: document.querySelector('#emptyNewButton'),
	importButton: document.querySelector('#importButton'),
	importInput: document.querySelector('#importInput'),
	emptyState: document.querySelector('#emptyState'),
	editorPanel: document.querySelector('#editorPanel'),
	editorForm: document.querySelector('#editorForm'),
	editorMode: document.querySelector('#editorMode'),
	editorHeading: document.querySelector('#editorHeading'),
	titleInput: document.querySelector('#titleInput'),
	descriptionInput: document.querySelector('#descriptionInput'),
	slugInput: document.querySelector('#slugInput'),
	pubDateInput: document.querySelector('#pubDateInput'),
	categoryInput: document.querySelector('#categoryInput'),
	tagsInput: document.querySelector('#tagsInput'),
	featuredInput: document.querySelector('#featuredInput'),
	draftInput: document.querySelector('#draftInput'),
	contentInput: document.querySelector('#contentInput'),
	characterCount: document.querySelector('#characterCount'),
	saveState: document.querySelector('#saveState'),
	saveButton: document.querySelector('#saveButton'),
	publishButton: document.querySelector('#publishButton'),
	insertHeadingButton: document.querySelector('#insertHeadingButton'),
	insertInlineMathButton: document.querySelector('#insertInlineMathButton'),
	insertBlockMathButton: document.querySelector('#insertBlockMathButton'),
	insertCodeBlockButton: document.querySelector('#insertCodeBlockButton'),
	previewFrame: document.querySelector('#previewFrame'),
	previewSiteLink: document.querySelector('#previewSiteLink'),
	publishDialog: document.querySelector('#publishDialog'),
	confirmPublishButton: document.querySelector('#confirmPublishButton'),
	toast: document.querySelector('#toast'),
};

const state = {
	posts: [],
	currentSlug: '',
	dirty: false,
	saving: false,
	publishing: false,
	previewTimer: null,
	previewRequest: 0,
	toastTimer: null,
};

const categoryLabels = {
	tech: '技术实践',
	growth: '成长记录',
	project: '项目复盘',
};

const siteURL = 'http://localhost:4321';

const getToday = () => {
	const now = new Date();
	const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
	return local.toISOString().slice(0, 10);
};

const escapeHTML = (value) =>
	String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#039;');

const formatDate = (value) => {
	if (!value) return '无日期';
	const date = new Date(`${value}T00:00:00`);
	return new Intl.DateTimeFormat('zh-CN', {
		month: 'short',
		day: 'numeric',
	}).format(date);
};

const api = async (url, options = {}) => {
	const response = await fetch(url, {
		...options,
		headers: {
			'Content-Type': 'application/json',
			'X-Zhidublog-Studio': '1',
			...(options.headers || {}),
		},
	});
	const data = await response.json().catch(() => ({}));

	if (!response.ok) {
		throw new Error(data.error || `请求失败（${response.status}）`);
	}

	return data;
};

const showToast = (message, type = 'success') => {
	window.clearTimeout(state.toastTimer);
	elements.toast.textContent = message;
	elements.toast.classList.toggle('is-error', type === 'error');
	elements.toast.classList.add('is-visible');
	state.toastTimer = window.setTimeout(() => {
		elements.toast.classList.remove('is-visible');
	}, 4200);
};

const setSavedState = (text, type = '') => {
	elements.saveState.textContent = text;
	elements.saveState.classList.toggle('is-dirty', type === 'dirty');
	elements.saveState.classList.toggle('is-saved', type === 'saved');
};

const setDirty = () => {
	state.dirty = true;
	setSavedState('有未保存的改动', 'dirty');
};

const markSaved = () => {
	state.dirty = false;
	setSavedState('已保存', 'saved');
};

const setPreviewLink = () => {
	if (!state.currentSlug) {
		elements.previewSiteLink.href = '#';
		elements.previewSiteLink.setAttribute('aria-disabled', 'true');
		return;
	}

	elements.previewSiteLink.href = `${siteURL}/blog/${state.currentSlug}/`;
	elements.previewSiteLink.removeAttribute('aria-disabled');
};

const showEditor = () => {
	elements.emptyState.hidden = true;
	elements.editorPanel.hidden = false;
};

const renderPostList = () => {
	const query = elements.searchInput.value.trim().toLowerCase();
	const posts = state.posts.filter((post) => {
		if (!query) return true;
		return `${post.title} ${post.description} ${post.tags.join(' ')}`.toLowerCase().includes(query);
	});

	elements.postCount.textContent = String(state.posts.length);

	if (posts.length === 0) {
		elements.postList.innerHTML = `<div class="list-empty">${
			state.posts.length === 0 ? '还没有文章，从一篇新记录开始吧。' : '没有找到匹配的文章。'
		}</div>`;
		return;
	}

	elements.postList.innerHTML = posts
		.map(
			(post) => `
				<button
					class="post-item${post.slug === state.currentSlug ? ' is-active' : ''}"
					type="button"
					data-slug="${escapeHTML(post.slug)}"
				>
					<span class="post-item-top">
						<strong>${escapeHTML(post.title)}</strong>
						<span class="post-status${post.draft ? ' is-draft' : ''}" title="${post.draft ? '草稿' : '已发布'}"></span>
					</span>
					<span class="post-item-meta">
						<span class="post-item-category">${categoryLabels[post.category] || '未分类'}</span>
						<span>${formatDate(post.pubDate)}</span>
					</span>
				</button>
			`,
		)
		.join('');
};

const loadPosts = async () => {
	try {
		const data = await api('/api/posts');
		state.posts = data.posts;
		renderPostList();
	} catch (error) {
		elements.postList.innerHTML = `<div class="list-empty">${escapeHTML(error.message)}</div>`;
		showToast(error.message, 'error');
	}
};

const updateCharacterCount = () => {
	elements.characterCount.textContent = `${elements.contentInput.value.length.toLocaleString('zh-CN')} 字`;
};

const buildPreviewDocument = (html) => `
	<!doctype html>
	<html lang="zh-CN">
		<head>
			<meta charset="utf-8" />
			<link rel="stylesheet" href="/katex/katex.min.css" />
			<style>
				* { box-sizing: border-box; }
				body {
					margin: 0;
					padding: 26px 30px 60px;
					background: #fbf9f3;
					color: #34463d;
					font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
					font-size: 14px;
					line-height: 1.9;
				}
				article { max-width: 760px; margin: 0 auto; }
				h1, h2, h3, h4 {
					color: #17221c;
					font-family: "Songti SC", "STSong", Georgia, serif;
					line-height: 1.3;
				}
				h1 { font-size: 30px; }
				h2 {
					margin-top: 2.2em;
					padding-top: .3em;
					font-size: 24px;
				}
				h2::before {
					display: block;
					width: 28px;
					height: 3px;
					margin-bottom: 16px;
					border-radius: 99px;
					background: #cf5c3e;
					content: "";
				}
				h3 { margin-top: 1.8em; font-size: 19px; }
				p { margin: 1.2em 0; }
				a { color: #cf5c3e; }
				strong { color: #17221c; }
				blockquote {
					margin: 1.5em 0;
					padding: 14px 18px;
					border-left: 3px solid #e5b657;
					background: #fffdf7;
				}
				code {
					padding: 2px 5px;
					border-radius: 5px;
					background: #e8e2d4;
					font-family: Consolas, monospace;
					font-size: .9em;
				}
				pre {
					overflow-x: auto;
					padding: 18px;
					border-radius: 12px;
					background: #13241e;
					color: #f0eee5;
				}
				pre code { padding: 0; background: transparent; }
				img { max-width: 100%; height: auto; border-radius: 10px; }
				table { width: 100%; border-collapse: collapse; }
				th, td { padding: 8px 10px; border-bottom: 1px solid #ded8ca; text-align: left; }
				hr { margin: 2.5em 0; border: 0; border-top: 1px solid #ded8ca; }
				.katex { font-size: 1.04em; }
				.katex-display { overflow-x: auto; overflow-y: hidden; padding: 14px 0 18px; }
				.katex-display > .katex { min-width: max-content; }
				.katex-error { color: #cf5c3e !important; }
			</style>
		</head>
		<body><article>${html}</article></body>
	</html>
`;

const renderPreview = async () => {
	const content = elements.contentInput.value.trim();
	const requestId = ++state.previewRequest;

	if (!content) {
		elements.previewFrame.srcdoc =
			"<p style='font-family:sans-serif;color:#69736c;padding:24px'>开始输入正文后，这里会显示预览。</p>";
		return;
	}

	try {
		const data = await api('/api/preview', {
			method: 'POST',
			body: JSON.stringify({ content }),
		});

		if (requestId === state.previewRequest) {
			elements.previewFrame.srcdoc = buildPreviewDocument(data.html);
		}
	} catch (error) {
		if (requestId === state.previewRequest) {
			elements.previewFrame.srcdoc = `<p style="font-family:sans-serif;color:#a33d2c;padding:24px">${escapeHTML(
				error.message,
			)}</p>`;
		}
	}
};

const schedulePreview = () => {
	window.clearTimeout(state.previewTimer);
	state.previewTimer = window.setTimeout(renderPreview, 280);
};

const insertAtSelection = (before, after = '', placeholder = '') => {
	const textarea = elements.contentInput;
	const start = textarea.selectionStart;
	const end = textarea.selectionEnd;
	const selected = textarea.value.slice(start, end);
	const content = selected || placeholder;
	const insertion = `${before}${content}${after}`;

	textarea.setRangeText(insertion, start, end, 'end');
	textarea.focus();
	textarea.setSelectionRange(start + before.length, start + before.length + content.length);
	setDirty();
	updateCharacterCount();
	schedulePreview();
};

const fillForm = (post) => {
	elements.titleInput.value = post.title || '';
	elements.descriptionInput.value = post.description || '';
	elements.slugInput.value = post.slug || '';
	elements.pubDateInput.value = post.pubDate || getToday();
	elements.categoryInput.value = post.category || 'growth';
	elements.tagsInput.value = Array.isArray(post.tags) ? post.tags.join(', ') : post.tags || '';
	elements.featuredInput.checked = Boolean(post.featured);
	elements.draftInput.checked = Boolean(post.draft);
	elements.contentInput.value = post.content || '';
	elements.editorHeading.textContent = post.title || '未命名文章';
	elements.editorMode.textContent = 'EDIT ARTICLE';
	updateCharacterCount();
	renderPreview();
};

const confirmDiscardChanges = () =>
	!state.dirty || window.confirm('当前文章有未保存的改动，确定要离开吗？');

const startNewPost = () => {
	if (!confirmDiscardChanges()) return;

	state.currentSlug = '';
	elements.editorForm.reset();
	elements.pubDateInput.value = getToday();
	elements.categoryInput.value = 'growth';
	elements.contentInput.value = '';
	elements.editorHeading.textContent = '新建文章';
	elements.editorMode.textContent = 'NEW ARTICLE';
	state.dirty = false;
	setSavedState('尚未保存');
	updateCharacterCount();
	setPreviewLink();
	showEditor();
	renderPostList();
	renderPreview();
	elements.titleInput.focus();
};

const openPost = async (slug) => {
	if (slug === state.currentSlug && !state.dirty) return;
	if (!confirmDiscardChanges()) return;

	try {
		const data = await api(`/api/posts/${encodeURIComponent(slug)}`);
		state.currentSlug = data.post.slug;
		fillForm(data.post);
		markSaved();
		setPreviewLink();
		showEditor();
		renderPostList();
	} catch (error) {
		showToast(error.message, 'error');
	}
};

const getPayload = () => ({
	originalSlug: state.currentSlug,
	title: elements.titleInput.value,
	description: elements.descriptionInput.value,
	slug: elements.slugInput.value,
	pubDate: elements.pubDateInput.value,
	category: elements.categoryInput.value,
	tags: elements.tagsInput.value,
	featured: elements.featuredInput.checked,
	draft: elements.draftInput.checked,
	content: elements.contentInput.value,
});

const saveArticle = async ({ silent = false } = {}) => {
	if (state.saving) return null;

	state.saving = true;
	elements.saveButton.disabled = true;
	elements.publishButton.disabled = true;
	setSavedState('正在保存…');

	try {
		const data = await api('/api/posts', {
			method: 'POST',
			body: JSON.stringify(getPayload()),
		});

		state.currentSlug = data.post.slug;
		elements.slugInput.value = data.post.slug;
		elements.pubDateInput.value = data.post.pubDate;
		elements.descriptionInput.value = data.post.description;
		elements.editorHeading.textContent = data.post.title;
		elements.editorMode.textContent = 'EDIT ARTICLE';
		markSaved();
		setPreviewLink();
		await loadPosts();
		if (!silent) showToast('文章已保存到本地项目。');
		return data.post;
	} catch (error) {
		setDirty();
		showToast(error.message, 'error');
		if (!silent) throw error;
		return null;
	} finally {
		state.saving = false;
		elements.saveButton.disabled = false;
		elements.publishButton.disabled = false;
	}
};

const publishArticle = async () => {
	if (state.publishing) return;

	state.publishing = true;
	elements.confirmPublishButton.disabled = true;
	elements.confirmPublishButton.textContent = '正在发布…';

	try {
		const data = await api('/api/publish', {
			method: 'POST',
			body: JSON.stringify({ slug: state.currentSlug }),
		});
		elements.publishDialog.close();
		if (data.pushed) markSaved();
		showToast(data.message);
	} catch (error) {
		showToast(error.message, 'error');
	} finally {
		state.publishing = false;
		elements.confirmPublishButton.disabled = false;
		elements.confirmPublishButton.textContent = '确认发布';
	}
};

const handleImport = async (file) => {
	try {
		const raw = await file.text();
		const data = await api('/api/import', {
			method: 'POST',
			body: JSON.stringify({ raw }),
		});

		state.currentSlug = '';
		fillForm({
			...data.post,
			slug: data.post.slug || '',
		});
		state.dirty = true;
		setDirty();
		setPreviewLink();
		showEditor();
		renderPostList();
		showToast('Markdown 已导入，检查内容后保存即可。');
	} catch (error) {
		showToast(error.message, 'error');
	} finally {
		elements.importInput.value = '';
	}
};

elements.newPostButton.addEventListener('click', startNewPost);
elements.emptyNewButton.addEventListener('click', startNewPost);
elements.searchInput.addEventListener('input', renderPostList);

elements.postList.addEventListener('click', (event) => {
	const item = event.target.closest('[data-slug]');
	if (item) openPost(item.dataset.slug);
});

elements.importButton.addEventListener('click', () => elements.importInput.click());
elements.importInput.addEventListener('change', () => {
	const [file] = elements.importInput.files;
	if (file) handleImport(file);
});

elements.editorForm.addEventListener('input', () => {
	setDirty();
	updateCharacterCount();
});

elements.editorForm.addEventListener('change', setDirty);

elements.contentInput.addEventListener('input', schedulePreview);

elements.saveButton.addEventListener('click', () => saveArticle());

elements.publishButton.addEventListener('click', async () => {
	const post = await saveArticle({ silent: true });
	if (!post) return;
	if (!elements.publishDialog.open) elements.publishDialog.showModal();
});

elements.confirmPublishButton.addEventListener('click', (event) => {
	event.preventDefault();
	publishArticle();
});

elements.insertHeadingButton.addEventListener('click', () => {
	const needsLeadingBreak = elements.contentInput.selectionStart > 0;
	insertAtSelection(`${needsLeadingBreak ? '\n\n' : ''}## `, '\n\n', '小标题');
});

elements.insertInlineMathButton.addEventListener('click', () => {
	insertAtSelection('$', '$', 'E = mc^2');
});

elements.insertBlockMathButton.addEventListener('click', () => {
	const needsLeadingBreak = elements.contentInput.selectionStart > 0;
	insertAtSelection(`${needsLeadingBreak ? '\n\n' : ''}$$\n`, '\n$$', '\\int_0^1 x^2 \\, dx = \\frac{1}{3}');
});

elements.insertCodeBlockButton.addEventListener('click', () => {
	const needsLeadingBreak = elements.contentInput.selectionStart > 0;
	insertAtSelection(
		`${needsLeadingBreak ? '\n\n' : ''}\`\`\`text\n`,
		'\n```',
		'在这里输入代码',
	);
});

elements.contentInput.addEventListener('keydown', (event) => {
	if (event.key !== 'Tab') return;

	event.preventDefault();
	const textarea = elements.contentInput;
	textarea.setRangeText('  ', textarea.selectionStart, textarea.selectionEnd, 'end');
	setDirty();
	updateCharacterCount();
	schedulePreview();
});

window.addEventListener('keydown', (event) => {
	if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
		event.preventDefault();
		saveArticle();
	}
});

window.addEventListener('beforeunload', (event) => {
	if (!state.dirty) return;
	event.preventDefault();
	event.returnValue = '';
});

elements.pubDateInput.value = getToday();
elements.categoryInput.value = 'growth';
setPreviewLink();
loadPosts();
