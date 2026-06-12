import { PageAiActions } from '@/components/ai-actions';
import { OpenAPIPage } from '@/components/api-page';
import { JsonLd } from '@/components/json-ld';
import { getMDXComponents } from '@/components/mdx';
import { baseUrl, createMetadata, ogImageUrl } from '@/lib/metadata';
import { source } from '@/lib/source';
import {
  type Breadcrumb,
  breadcrumbSchema,
  jsonLdGraph,
  techArticleSchema,
} from '@/lib/structured-data';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

/** Build the breadcrumb trail (Docs › section › … › page) from the page's slug. */
function breadcrumbsFor(slugs: string[]): Breadcrumb[] {
  const crumbs: Breadcrumb[] = [{ name: 'Docs', url: '/docs' }];
  for (let i = 0; i < slugs.length; i++) {
    const ancestor = source.getPage(slugs.slice(0, i + 1));
    if (ancestor) crumbs.push({ name: ancestor.data.title, url: ancestor.url });
  }
  return crumbs;
}

export default async function Page(props: { params: Promise<{ slug?: string[] }> }) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const markdownUrl = `${page.url}.mdx`;
  const structuredData = jsonLdGraph(
    techArticleSchema({
      title: page.data.title,
      description: page.data.description,
      pathname: page.url,
    }),
    breadcrumbSchema(breadcrumbsFor(page.slugs)),
  );

  const head = (
    <>
      <JsonLd data={structuredData} />
      <PageAiActions
        markdownUrl={markdownUrl}
        markdownAbsoluteUrl={new URL(markdownUrl, baseUrl).href}
      />
    </>
  );

  if (page.type === 'openapi') {
    return (
      <DocsPage toc={page.data.toc} full>
        <DocsTitle>{page.data.title}</DocsTitle>
        <DocsDescription>{page.data.description}</DocsDescription>
        {head}
        <DocsBody>
          <OpenAPIPage {...page.data.getOpenAPIPageProps()} />
        </DocsBody>
      </DocsPage>
    );
  }

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      {head}
      <DocsBody>
        <MDX components={getMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  return createMetadata({
    title: page.data.title,
    description: page.data.description,
    pathname: page.url,
    image: ogImageUrl(page.slugs),
    type: 'article',
  });
}
