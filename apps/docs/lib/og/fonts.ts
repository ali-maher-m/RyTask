import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface OgFont {
  name: string;
  data: Buffer;
  weight: 400 | 600 | 700 | 800;
  style: 'normal';
}

/**
 * @fontsource ships its font files under `node_modules/@fontsource/<pkg>/files`.
 * We read them by computed filesystem path (no `require`/`import`) so the bundler
 * never tries to treat a `.woff` as a module nor flags a dynamic require — the
 * OG route prerenders at build time, where the working directory is this app.
 */
const FONTS_BASE = join(process.cwd(), 'node_modules', '@fontsource');

function readWoff(pkg: string, file: string): Buffer | null {
  try {
    return readFileSync(join(FONTS_BASE, pkg, 'files', file));
  } catch {
    return null;
  }
}

let cache: OgFont[] | null = null;

/**
 * Load the brand fonts for OG rendering, cached across requests — Schibsted
 * Grotesk for brand moments (wordmark + title), Hanken Grotesk for the rest, the
 * same families the UI loads via next/font. We read the `.woff` (Satori parses
 * ttf/otf/woff, NOT woff2). Returns `[]` if a file is absent, so a missing font
 * renders in next/og's default font rather than breaking the build.
 */
export function ogFonts(): OgFont[] {
  if (cache) return cache;

  const faces: Array<Omit<OgFont, 'data'> & { pkg: string; file: string }> = [
    {
      name: 'Hanken Grotesk',
      weight: 400,
      style: 'normal',
      pkg: 'hanken-grotesk',
      file: 'hanken-grotesk-latin-400-normal.woff',
    },
    {
      name: 'Hanken Grotesk',
      weight: 600,
      style: 'normal',
      pkg: 'hanken-grotesk',
      file: 'hanken-grotesk-latin-600-normal.woff',
    },
    {
      name: 'Schibsted Grotesk',
      weight: 700,
      style: 'normal',
      pkg: 'schibsted-grotesk',
      file: 'schibsted-grotesk-latin-700-normal.woff',
    },
    {
      name: 'Schibsted Grotesk',
      weight: 800,
      style: 'normal',
      pkg: 'schibsted-grotesk',
      file: 'schibsted-grotesk-latin-800-normal.woff',
    },
  ];

  const fonts: OgFont[] = [];
  for (const face of faces) {
    const data = readWoff(face.pkg, face.file);
    if (data) fonts.push({ name: face.name, data, weight: face.weight, style: face.style });
  }

  cache = fonts;
  return fonts;
}
