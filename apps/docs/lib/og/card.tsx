/**
 * The branded Open Graph card (1200×630), rendered server-side by `next/og`.
 *
 * Brand rules applied here (see branding/): flat fills only — no gradient, no
 * shadow; a Sunbeam top edge as the signature; dark ink title on a warm Stone
 * card; Schibsted Grotesk for the brand moment (wordmark + title), Hanken for
 * the rest. Colors are literal hex because the stylesheet (and its CSS vars)
 * isn't present during image rendering.
 */
const STONE_50 = '#FAF9F7';
const INK = '#201D1A';
const MUTED = '#6C655B';
const SUNBEAM = '#ECB30A';
const HONEY = '#B26C08';
const BORDER = '#E4E1DA';

export function OgCard({ title, description }: { title: string; description?: string }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: STONE_50,
        borderTop: `16px solid ${SUNBEAM}`,
        padding: '72px 80px',
        fontFamily: 'Hanken Grotesk',
        color: INK,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 18 }}>
        <span style={{ fontFamily: 'Schibsted Grotesk', fontWeight: 800, fontSize: 40 }}>
          RyTask
        </span>
        <span
          style={{
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: HONEY,
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            padding: '4px 12px',
          }}
        >
          Docs
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            fontFamily: 'Schibsted Grotesk',
            fontWeight: 800,
            fontSize: 68,
            lineHeight: 1.08,
            letterSpacing: -1,
            color: INK,
          }}
        >
          {title}
        </div>
        {description ? (
          <div style={{ marginTop: 24, fontSize: 30, lineHeight: 1.35, color: MUTED }}>
            {description}
          </div>
        ) : null}
      </div>

      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: SUNBEAM }} />
        <span style={{ fontSize: 26, fontWeight: 600, color: MUTED }}>docs.rytask.app</span>
      </div>
    </div>
  );
}
