'use client';

import { ProjectForm } from '@/components/project-form';
import { useCapabilities } from '@/lib/auth/capability-context';
import type { Project } from '@rytask/contracts';
import { ForbiddenState } from '@rytask/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/**
 * New-project surface (US6, T061, FR-WEB-050). Mounts the create-mode `ProjectForm`; on success it
 * routes into the fresh project's Board. Cosmetically gated by `project:create` — the server stays
 * authoritative, so a slipped-through create still 403s. Token-only.
 */
export function NewProjectClient() {
  const router = useRouter();
  const { can, reason } = useCapabilities();

  if (!can('project:create')) {
    return (
      <main style={PAGE}>
        <ForbiddenState description={reason('project:create')} />
      </main>
    );
  }

  return (
    <main style={PAGE}>
      <p style={{ marginTop: 0 }}>
        <Link href="/projects" style={{ color: 'var(--accent)' }}>
          ← Back to projects
        </Link>
      </p>
      <ProjectForm onSaved={(project: Project) => router.push(`/projects/${project.id}/board`)} />
    </main>
  );
}

const PAGE: React.CSSProperties = {
  maxWidth: 'var(--container-prose)',
  margin: '0 auto',
  padding: 'var(--space-4)',
};
