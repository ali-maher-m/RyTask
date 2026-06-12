import { OgCard } from '@/lib/og/card';
import { ogFonts } from '@/lib/og/fonts';
import { ImageResponse } from 'next/og';

/**
 * The default Open Graph image (home page, and any route that doesn't set its
 * own). Docs pages override this with their per-page card from /docs-og.
 */
export const alt = 'RyTask docs — open-source project tracker with time tracking & MCP';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  const fonts = ogFonts();
  return new ImageResponse(
    <OgCard
      title="Know where the time went."
      description="Open-source project tracker with native time tracking, Slack capture, and a full-control MCP server for AI agents."
    />,
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
