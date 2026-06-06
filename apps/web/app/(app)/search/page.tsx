import { SearchClient } from './search-client';

/**
 * Search results surface (route-map, US11/T090). Ranked, grouped, tenant- and permission-scoped
 * full-text results over `GET /search`; the scoping is enforced server-side so no foreign data is
 * ever rendered. The Cmd/Ctrl-K palette is the fast path; this page is the shareable deep-link view.
 */
export default function SearchPage() {
  return <SearchClient />;
}
