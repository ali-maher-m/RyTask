import { baseUrl, githubUrl, siteName, siteUrl } from './metadata';

/**
 * Schema.org JSON-LD builders. These describe the site, the product, and each
 * page to search engines (rich results) and answer/AI engines (which lift
 * structured facts more reliably than prose). Every `@id`/`url` is absolute so a
 * crawler can resolve it without guessing the host.
 *
 * Keep these factual and in lock-step with the code — a wrong `softwareVersion`
 * or `featureList` here is the same drift this site exists to avoid.
 */

const ORG_ID = `${siteUrl.origin}/#organization`;
const SITE_ID = `${baseUrl.origin}/#website`;

export function organizationSchema() {
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: 'RyTask',
    url: siteUrl.origin,
    logo: `${siteUrl.origin}/logo-mark.svg`,
    sameAs: [githubUrl],
  };
}

export function webSiteSchema() {
  return {
    '@type': 'WebSite',
    '@id': SITE_ID,
    name: siteName,
    url: baseUrl.origin,
    inLanguage: 'en',
    publisher: { '@id': ORG_ID },
  };
}

/**
 * RyTask itself, as a free, open-source application. Rendered on the docs home
 * so a search/answer engine can state what RyTask is, that it's free, and its
 * license without inferring it from prose.
 */
export function softwareApplicationSchema() {
  return {
    '@type': 'SoftwareApplication',
    '@id': `${siteUrl.origin}/#software`,
    name: 'RyTask',
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Project management & issue tracking',
    operatingSystem: 'Web, Docker, Linux',
    url: siteUrl.origin,
    description:
      'Open-source, self-hostable project management and issue tracker with native time tracking, plan-vs-actual reporting, first-class Slack capture, and a full-control MCP server for AI agents.',
    license: 'https://www.gnu.org/licenses/agpl-3.0.html',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    featureList: [
      'Native time tracking with plan-vs-actual reporting',
      'Slack capture',
      'MCP server with full workspace control for AI agents',
      'Work items, projects, statuses, views, and search',
      'Self-hosted via Docker Compose',
    ],
    publisher: { '@id': ORG_ID },
  };
}

export interface Breadcrumb {
  name: string;
  url: string;
}

export function breadcrumbSchema(items: Breadcrumb[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: new URL(item.url, baseUrl).href,
    })),
  };
}

export interface ArticleInput {
  title: string;
  description?: string;
  /** Path-only, e.g. `page.url`. */
  pathname: string;
}

export function techArticleSchema({ title, description, pathname }: ArticleInput) {
  const url = new URL(pathname, baseUrl).href;
  return {
    '@type': 'TechArticle',
    '@id': `${url}#article`,
    headline: title,
    description,
    url,
    inLanguage: 'en',
    isPartOf: { '@id': SITE_ID },
    author: { '@id': ORG_ID },
    publisher: { '@id': ORG_ID },
  };
}

export interface FaqEntry {
  question: string;
  answer: string;
}

export function faqPageSchema(entries: FaqEntry[]) {
  return {
    '@type': 'FAQPage',
    mainEntity: entries.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    })),
  };
}

/** Wrap one or more schema nodes in a single `@graph` document. */
export function jsonLdGraph(...nodes: object[]) {
  return {
    '@context': 'https://schema.org',
    '@graph': nodes,
  };
}
