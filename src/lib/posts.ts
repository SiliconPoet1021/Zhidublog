import { getCollection, type CollectionEntry } from 'astro:content';

export type BlogPost = CollectionEntry<'blog'>;

export async function getPublishedPosts(): Promise<BlogPost[]> {
	const posts = await getCollection('blog', ({ data }) => import.meta.env.DEV || !data.draft);

	return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export function getReadingTime(body = ''): number {
	const withoutCode = body.replace(/```[\s\S]*?```/g, '');
	const chineseCharacters = withoutCode.match(/[\u3400-\u9fff]/g)?.length ?? 0;
	const latinWords =
		withoutCode
			.replace(/[\u3400-\u9fff]/g, ' ')
			.match(/[a-zA-Z0-9]+/g)?.length ?? 0;

	return Math.max(1, Math.ceil(chineseCharacters / 400 + latinWords / 220));
}

export function getPostHref(post: BlogPost): string {
	return `/blog/${post.id}/`;
}

export function getTagHref(tag: string): string {
	return `/tags/${encodeURIComponent(tag)}/`;
}

export function getTagCounts(posts: BlogPost[]): Array<{ tag: string; count: number }> {
	const counts = new Map<string, number>();

	for (const post of posts) {
		for (const tag of post.data.tags) {
			counts.set(tag, (counts.get(tag) ?? 0) + 1);
		}
	}

	return [...counts.entries()]
		.map(([tag, count]) => ({ tag, count }))
		.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh-CN'));
}
