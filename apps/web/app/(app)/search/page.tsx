import { EmptyState } from '@rytask/ui';

/**
 * Search results surface (route-map). Scaffolded under the shell here; the ranked,
 * tenant/permission-scoped results + command palette are implemented in US11 (T089/T090).
 */
export default function SearchPage() {
  return (
    <EmptyState
      title="Search"
      description="Find anything across your projects, items, labels, and people. Press ⌘K from anywhere to jump in."
    />
  );
}
