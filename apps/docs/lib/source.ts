import { docs } from 'collections/server';
import { loader } from 'fumadocs-core/source';
import { openapi } from './openapi';

export const source = loader(
  {
    docs: docs.toFumadocsSource(),
    openapi: await openapi.staticSource({
      baseDir: 'reference/rest-api',
      groupBy: 'tag',
    }),
  },
  {
    baseUrl: '/docs',
    plugins: [openapi.loaderPlugin()],
  },
);

export async function getLLMText(page: (typeof source)['$inferPage']) {
  // OpenAPI pages are virtual (rendered from the spec) — describe them briefly.
  const processed =
    'getText' in page.data
      ? await page.data.getText('processed')
      : (page.data.description ?? 'Generated REST API reference page.');

  return `# ${page.data.title} (${page.url})

${processed}`;
}
