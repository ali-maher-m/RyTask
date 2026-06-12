import { baseUrl } from '@/lib/metadata';
import { source } from '@/lib/source';
import type { MetadataRoute } from 'next';

/**
 * Lists every indexable URL for crawlers: the home page plus every docs page
 * (hand-written, the 49 generated MCP tool pages, and the OpenAPI reference —
 * all enumerated from the same source the site renders from, so the sitemap
 * can't drift from what actually exists).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  const home: MetadataRoute.Sitemap[number] = {
    url: new URL('/', baseUrl).href,
    lastModified,
    changeFrequency: 'weekly',
    priority: 1,
  };

  const pages = source.getPages().map((page) => ({
    url: new URL(page.url, baseUrl).href,
    lastModified,
    changeFrequency: 'weekly' as const,
    priority: page.url === '/docs/tutorials/quickstart' ? 0.9 : 0.7,
  }));

  return [home, ...pages];
}
