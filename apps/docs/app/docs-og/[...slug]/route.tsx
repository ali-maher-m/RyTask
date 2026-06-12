import { OgCard } from '@/lib/og/card';
import { ogFonts } from '@/lib/og/fonts';
import { source } from '@/lib/source';
import { notFound } from 'next/navigation';
import { ImageResponse } from 'next/og';

/**
 * Per-page Open Graph image, served at `/docs-og/<...slug>/image.png`. Hand-wired
 * (Fumadocs' `createMetadataImage` is gone in this version) and prerendered for
 * every page so social/AI scrapers get a branded card on first fetch.
 */
export function generateStaticParams() {
  return source.getPages().map((page) => ({
    slug: [...page.slugs, 'image.png'],
  }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  // Drop the trailing 'image.png' to recover the page slug.
  const page = source.getPage(slug.slice(0, -1));
  if (!page) notFound();

  const raw = page.data.description ?? undefined;
  const description = raw && raw.length > 140 ? `${raw.slice(0, 137)}…` : raw;
  const fonts = ogFonts();

  const title = page.data.title ?? 'Untitled';

  return new ImageResponse(<OgCard title={title} description={description} />, {
    width: 1200,
    height: 630,
    fonts: fonts.length ? fonts : undefined,
  });
}
