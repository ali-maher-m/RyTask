import '@rytask/ui/styles';
import './fonts.css';

import type { Metadata } from 'next';
import { Geist_Mono, Hanken_Grotesk, Schibsted_Grotesk } from 'next/font/google';
import type { ReactNode } from 'react';

/**
 * Root layout (D3/D4). Wires the design system once: imports the global `@rytask/ui/styles` (tokens
 * + base), self-hosts the brand fonts via next/font (Hanken Grotesk for UI, Schibsted Grotesk 800
 * for brand moments, Geist Mono for every figure), and runs a pre-paint inline script that applies
 * the persisted `data-theme` before first paint so there is no flash of the wrong theme. The
 * authenticated shell + client providers mount under the `(app)` route group; auth/setup/invite
 * surfaces render bare under this layout.
 */
const fontUi = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ui-loaded',
  display: 'swap',
});

const fontBrand = Schibsted_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-brand-loaded',
  display: 'swap',
});

const fontMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono-loaded',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'RyTask',
  description: 'Open-source, self-hostable project management & issue tracking.',
};

// Applies the persisted theme to <html> before paint (no FOUC). Defaults to the OS preference.
const NO_FOUC = `(function(){try{var t=localStorage.getItem('rytask.theme');var dark=(t==='dark')||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',(t==='light')?'light':(dark?'dark':'light'));}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fontUi.variable} ${fontBrand.variable} ${fontMono.variable}`}
    >
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: tiny static no-FOUC theme script. */}
        <script dangerouslySetInnerHTML={{ __html: NO_FOUC }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
