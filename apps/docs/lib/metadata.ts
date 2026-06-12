import type { Metadata } from 'next';

/**
 * Single source for the docs site's identity and SEO metadata. Everything that
 * needs an absolute URL (canonical links, Open Graph, sitemap, JSON-LD) resolves
 * against `baseUrl`, so set NEXT_PUBLIC_DOCS_URL in any environment that isn't
 * production (preview deploys, local) to keep crawlers from seeing the prod URL.
 */
export const baseUrl = new URL(process.env.NEXT_PUBLIC_DOCS_URL ?? 'https://docs.rytask.app');

/** The product marketing site (the docs are a subdomain of it). */
export const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://rytask.app');

export const siteName = 'RyTask docs';
export const githubUrl = 'https://github.com/ali-maher-m/RyTask';

/**
 * The dynamic Open Graph image for a docs page. We hand-wire the route (rather
 * than use Fumadocs' `createMetadataImage`, which this version no longer ships)
 * so the URL stays stable: `/docs-og/<...slug>/image.png`.
 */
export function ogImageUrl(slugs: string[]): string {
  const path = [...slugs, 'image.png'].map(encodeURIComponent).join('/');
  return `/docs-og/${path}`;
}

interface CreateMetadataInput {
  title: string;
  description?: string;
  /** Path-only canonical, e.g. `page.url` ('/docs/...') or '/'. */
  pathname: string;
  /**
   * Relative OG image URL (e.g. from `ogImageUrl`). When omitted, no per-page
   * image is set and the route inherits the file-convention `opengraph-image`.
   */
  image?: string;
  type?: 'website' | 'article';
}

/**
 * Build a complete, self-consistent Metadata object for a page. Next merges a
 * child's `openGraph`/`twitter` by replacing the parent's wholesale (not deep),
 * so every page must emit the full set — this keeps that in one place.
 */
export function createMetadata(input: CreateMetadataInput): Metadata {
  const { title, description, pathname, image, type = 'article' } = input;
  const images = image ? [{ url: image, width: 1200, height: 630, alt: title }] : undefined;

  return {
    title,
    description,
    alternates: { canonical: pathname },
    openGraph: {
      type,
      siteName,
      url: pathname,
      title,
      description,
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}
