import './global.css';
import { RootProvider } from 'fumadocs-ui/provider/next';
import type { Metadata } from 'next';
import { Geist_Mono, Hanken_Grotesk, Schibsted_Grotesk } from 'next/font/google';
import type { ReactNode } from 'react';

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
  title: {
    template: '%s | RyTask docs',
    default: 'RyTask docs',
  },
  description:
    'Documentation for RyTask — the open-source, self-hostable project tracker with native time tracking, Slack capture, and a full-control MCP server.',
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${fontUi.variable} ${fontBrand.variable} ${fontMono.variable}`}
      suppressHydrationWarning
    >
      <body className="flex flex-col min-h-screen">
        <RootProvider
          theme={{
            attribute: ['class', 'data-theme'],
            defaultTheme: 'system',
            enableSystem: true,
          }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
