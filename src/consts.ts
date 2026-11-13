export const SITE_TITLE = '知渡';
export const SITE_DESCRIPTION =
	'记录技术实践、项目复盘与成长经验，把走过的路写成可以复用的地图。';
export const SITE_AUTHOR = '知渡';
export const GITHUB_URL = 'https://github.com/SiliconPoet1021';

export const NAV_ITEMS = [
	{ href: '/', label: '首页' },
	{ href: '/blog/', label: '文章' },
	{ href: '/archive/', label: '归档' },
	{ href: '/projects/', label: '项目' },
	{ href: '/about/', label: '关于' },
] as const;

export const CATEGORY_META = {
	tech: {
		label: '技术实践',
		description: '把技术选择、实现细节和踩坑经验写清楚。',
	},
	growth: {
		label: '成长记录',
		description: '记录学习、工作和长期成长中的真实变化。',
	},
	project: {
		label: '项目复盘',
		description: '从想法到上线，复盘做过的项目与关键决策。',
	},
} as const;

export type CategoryKey = keyof typeof CATEGORY_META;
