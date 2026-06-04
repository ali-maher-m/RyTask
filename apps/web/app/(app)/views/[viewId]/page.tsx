import { EmptyState } from '@rytask/ui';

/**
 * Saved-view surface (route-map). Scaffolded under the shell here; restoring a saved view's full
 * config (filter AST + grouping + multi-key sort) is implemented in US7 (T069).
 */
export default function SavedViewPage() {
  return (
    <EmptyState
      title="Saved view"
      description="This is where a saved board or list view will open with its filters, grouping, and sort restored."
    />
  );
}
