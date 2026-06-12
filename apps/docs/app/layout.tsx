import './global.css';
import { JsonLd } from '@/components/json-ld';
import { baseUrl, siteName } from '@/lib/metadata';
import { jsonLdGraph, organizationSchema, webSiteSchema } from '@/lib/structured-data';
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
  metadataBase: baseUrl,
  title: {
    template: '%s | RyTask docs',
    default: 'RyTask docs — open-source project tracker with time tracking & MCP',
  },
  description:
    'Documentation for RyTask — the open-source, self-hostable project tracker with native time tracking, Slack capture, and a full-control MCP server.',
  applicationName: siteName,
  keywords: [
    'RyTask',
    'open-source project management',
    'self-hosted issue tracker',
    'time tracking',
    'plan vs actual',
    'Slack task capture',
    'MCP server',
    'AI agent project management',
    'Jira alternative',
    'Linear alternative',
  ],
  authors: [{ name: 'RyTask' }],
  creator: 'RyTask',
  publisher: 'RyTask',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName,
    locale: 'en_US',
    url: '/',
    title: 'RyTask docs',
    description:
      'Run, use, and understand RyTask — the open-source project tracker with native time tracking, Slack capture, and a full-control MCP server.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RyTask docs',
    description:
      'Run, use, and understand RyTask — the open-source project tracker with native time tracking, Slack capture, and a full-control MCP server.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${fontUi.variable} ${fontBrand.variable} ${fontMono.variable}`}
      suppressHydrationWarning
    >
      <body className="flex flex-col min-h-screen">
        <JsonLd data={jsonLdGraph(organizationSchema(), webSiteSchema())} />
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
