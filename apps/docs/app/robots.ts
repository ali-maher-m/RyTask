import { baseUrl } from '@/lib/metadata';
import type { MetadataRoute } from 'next';

/**
 * Allow everything, point crawlers at the sitemap, and — the GEO stance —
 * explicitly welcome the major AI/answer-engine crawlers by name. RyTask's docs
 * want to be read and cited by these agents (the site even emits /llms.txt and
 * per-page `.mdx`), so we never disallow them.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/' },
      {
        userAgent: [
          'GPTBot',
          'OAI-SearchBot',
          'ChatGPT-User',
          'ClaudeBot',
          'Claude-Web',
          'anthropic-ai',
          'PerplexityBot',
          'Perplexity-User',
          'Google-Extended',
          'Applebot-Extended',
          'CCBot',
        ],
        allow: '/',
      },
    ],
    sitemap: new URL('/sitemap.xml', baseUrl).href,
    host: baseUrl.origin,
  };
}
