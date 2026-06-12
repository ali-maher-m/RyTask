import { getLLMText, source } from '@/lib/source';
import { notFound } from 'next/navigation';

/**
 * Serves any docs page as clean Markdown. Reached by appending `.md`/`.mdx` to a
 * page URL (wired by the rewrites in next.config.mjs) — the GEO/agent-friendly
 * twin of every HTML page, alongside the whole-site /llms.txt and /llms-full.txt.
 */
export const revalidate = false;

export async function GET(_req: Request, { params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();

  return new Response(await getLLMText(page), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}

export function generateStaticParams() {
  return source.generateParams();
}
