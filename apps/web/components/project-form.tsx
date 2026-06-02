'use client';

import type { CreateProject, Project, ProjectMember, UpdateProject } from '@rytask/contracts';
import { useState } from 'react';
import { authedRequest } from '../lib/api';

/**
 * Project create / settings form (US4, T075, FR-PROJ-001). Captures a project's name, key
 * prefix, icon, color, and lead. In `create` mode it POSTs `CreateProject`; in `edit` mode it
 * PATCHes `UpdateProject` (only changed fields) for the existing project. Requests carry the M0
 * bearer token via `authedRequest` (the M1 dev-header seam is gone). The key prefix is immutable
 * after creation (the key sequence is anchored to it), so it is read-only in edit mode. The lead
 * is chosen from the project's members (edit) or left unset (create, set later in settings).
 * Every field has an associated label for axe; submit/validation errors surface in a
 * `role="alert"` region.
 */

/** Key prefix rule (projects.contract `keyPrefixSchema`): A then 1–9 of [A-Z0-9]. */
const KEY_PREFIX_RE = /^[A-Z][A-Z0-9]{1,9}$/;

interface FormFields {
  name: string;
  keyPrefix: string;
  icon: string;
  color: string;
  leadId: string;
}

function initialFields(project?: Project): FormFields {
  return {
    name: project?.name ?? '',
    keyPrefix: project?.keyPrefix ?? '',
    icon: project?.icon ?? '',
    color: project?.color ?? '#3B82F6',
    leadId: project?.leadId ?? '',
  };
}

export interface ProjectFormProps {
  /** Existing project to edit; omit for create mode. */
  project?: Project;
  /** Members eligible to lead (edit mode). Empty in create mode. */
  members?: ProjectMember[];
  /** Called with the created/updated project after a successful save. */
  onSaved?: (project: Project) => void;
}

export function ProjectForm({ project, members = [], onSaved }: ProjectFormProps) {
  const mode = project ? 'edit' : 'create';
  const [fields, setFields] = useState<FormFields>(() => initialFields(project));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Project | null>(null);

  function set<K extends keyof FormFields>(key: K, value: FormFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): string | null {
    const name = fields.name.trim();
    if (!name) return 'Name is required.';
    if (name.length > 120) return 'Name must be 120 characters or fewer.';
    if (mode === 'create' && !KEY_PREFIX_RE.test(fields.keyPrefix)) {
      return 'Key prefix must be an uppercase letter followed by 1–9 letters or digits (e.g. RYT).';
    }
    if (!fields.color.trim()) return 'Color is required.';
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const project_ = project
        ? await patchProject(project.id, buildUpdate(project, fields))
        : await postProject(buildCreate(fields));
      setSaved(project_);
      if (mode === 'create') setFields(initialFields());
      onSaved?.(project_);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  }

  const headingId = 'project-form-heading';

  return (
    <form onSubmit={submit} aria-labelledby={headingId}>
      <h2 id={headingId}>{mode === 'create' ? 'New project' : 'Project settings'}</h2>

      <p>
        <label htmlFor="project-name">Name</label>
        <br />
        <input
          id="project-name"
          type="text"
          required
          maxLength={120}
          value={fields.name}
          disabled={busy}
          onChange={(e) => set('name', e.target.value)}
        />
      </p>

      <p>
        <label htmlFor="project-key-prefix">Key prefix</label>
        <br />
        <input
          id="project-key-prefix"
          type="text"
          value={fields.keyPrefix}
          disabled={busy || mode === 'edit'}
          readOnly={mode === 'edit'}
          maxLength={10}
          placeholder="RYT"
          aria-describedby="project-key-prefix-hint"
          onChange={(e) => set('keyPrefix', e.target.value.toUpperCase())}
        />
        <br />
        <small id="project-key-prefix-hint">
          {mode === 'edit'
            ? 'The key prefix is fixed once the project exists.'
            : 'Uppercase letter then 1–9 letters/digits (e.g. RYT). Item keys read RYT-1, RYT-2…'}
        </small>
      </p>

      <p>
        <label htmlFor="project-icon">Icon</label>
        <br />
        <input
          id="project-icon"
          type="text"
          maxLength={64}
          placeholder="🚀"
          value={fields.icon}
          disabled={busy}
          onChange={(e) => set('icon', e.target.value)}
        />
      </p>

      <p>
        <label htmlFor="project-color">Color</label>
        <br />
        <input
          id="project-color"
          type="text"
          required
          maxLength={32}
          placeholder="#3B82F6"
          value={fields.color}
          disabled={busy}
          onChange={(e) => set('color', e.target.value)}
        />
      </p>

      {mode === 'edit' ? (
        <p>
          <label htmlFor="project-lead">Lead</label>
          <br />
          <select
            id="project-lead"
            value={fields.leadId}
            disabled={busy}
            onChange={(e) => set('leadId', e.target.value)}
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </select>
        </p>
      ) : null}

      <button type="submit" disabled={busy}>
        {busy ? 'Saving…' : mode === 'create' ? 'Create project' : 'Save changes'}
      </button>

      {error ? (
        <p role="alert" style={{ color: '#b00020' }}>
          {error}
        </p>
      ) : null}

      {saved ? (
        <output>
          Saved <strong>{saved.name}</strong> (<code>{saved.keyPrefix}</code>).
        </output>
      ) : null}
    </form>
  );
}

/** Build a `CreateProject` body from the form, omitting empty optionals. */
function buildCreate(fields: FormFields): CreateProject {
  const body: CreateProject = {
    name: fields.name.trim(),
    keyPrefix: fields.keyPrefix.trim(),
    color: fields.color.trim(),
  };
  const icon = fields.icon.trim();
  if (icon) body.icon = icon;
  if (fields.leadId) body.leadId = fields.leadId;
  return body;
}

/** Build an `UpdateProject` body containing only the fields that changed (nullable clears). */
function buildUpdate(project: Project, fields: FormFields): UpdateProject {
  const body: UpdateProject = {};
  const name = fields.name.trim();
  if (name !== project.name) body.name = name;
  const color = fields.color.trim();
  if (color !== project.color) body.color = color;
  const icon = fields.icon.trim();
  if ((icon || null) !== project.icon) body.icon = icon || null;
  const leadId = fields.leadId || null;
  if (leadId !== project.leadId) body.leadId = leadId;
  return body;
}

async function postProject(body: CreateProject): Promise<Project> {
  const json = await authedRequest<{ data: Project }>('/projects', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return json.data;
}

async function patchProject(id: string, body: UpdateProject): Promise<Project> {
  const json = await authedRequest<{ data: Project }>(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return json.data;
}
