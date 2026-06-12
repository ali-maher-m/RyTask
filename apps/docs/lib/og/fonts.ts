import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export interface OgFont {
  name: string;
  data: Buffer;
  weight: 400 | 600 | 700 | 800;
  style: 'normal';
}

/**
 * Try several file specifiers and return the bytes of the first that resolves.
 * Satori (the engine behind `next/og`) parses ttf/otf/woff but NOT woff2, so we
 * never list woff2 here.
 */
function load(specifiers: string[]): Buffer | null {
  for (const spec of specifiers) {
    try {
      return readFileSync(require.resolve(spec));
    } catch {
      // try the next candidate
    }
  }
  return null;
}

interface Face {
  name: string;
  weight: OgFont['weight'];
  files: string[];
}

/** Brand faces: Schibsted Grotesk for brand moments (wordmark + title), Hanken
 *  Grotesk for everything else — the same families the UI loads via next/font. */
const FACES: Face[] = [
  {
    name: 'Hanken Grotesk',
    weight: 400,
    files: [
      '@fontsource/hanken-grotesk/files/hanken-grotesk-latin-400-normal.woff',
      '@fontsource/hanken-grotesk/files/hanken-grotesk-latin-400-normal.ttf',
    ],
  },
  {
    name: 'Hanken Grotesk',
    weight: 600,
    files: [
      '@fontsource/hanken-grotesk/files/hanken-grotesk-latin-600-normal.woff',
      '@fontsource/hanken-grotesk/files/hanken-grotesk-latin-600-normal.ttf',
    ],
  },
  {
    name: 'Schibsted Grotesk',
    weight: 700,
    files: [
      '@fontsource/schibsted-grotesk/files/schibsted-grotesk-latin-700-normal.woff',
      '@fontsource/schibsted-grotesk/files/schibsted-grotesk-latin-700-normal.ttf',
    ],
  },
  {
    name: 'Schibsted Grotesk',
    weight: 800,
    files: [
      '@fontsource/schibsted-grotesk/files/schibsted-grotesk-latin-800-normal.woff',
      '@fontsource/schibsted-grotesk/files/schibsted-grotesk-latin-800-normal.ttf',
    ],
  },
];

let cache: OgFont[] | null = null;

/**
 * Load the brand fonts for OG rendering, cached across requests. Returns `[]`
 * if none resolve (a missing/changed @fontsource layout shouldn't break the
 * build) — the image then renders in next/og's default font.
 */
export function ogFonts(): OgFont[] {
  if (cache) return cache;
  const fonts: OgFont[] = [];
  for (const face of FACES) {
    const data = load(face.files);
    if (data) fonts.push({ name: face.name, data, weight: face.weight, style: 'normal' });
  }
  cache = fonts;
  return fonts;
}
