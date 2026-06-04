'use client';

import { createProject, updateProject } from '@/lib/api';
import type { CreateProject, Project, ProjectMember, UpdateProject } from '@rytask/contracts';
import { Button, Input, Textarea } from '@rytask/ui';
import { useState } from 'react';

/**
 * Project create / settings form (US6, T061, FR-WEB-050). Captures a project's name, key prefix,
 * description, icon, color, and lead. In `create` mode it POSTs `CreateProject`; in `edit` mode it
 * PATCHes only the changed fields. Requests carry the M0 bearer via the consolidated `@/lib/api`
 * client. The key prefix is immutable after creation (the key sequence is anchored to it), so it is
 * read-only in edit mode. The lead is chosen from the project's members (edit) or left unset
 * (create). Token-only styling; every field is labelled (axe) and errors surface in a `role="alert"`.
 */

/** Key prefix rule (projects.contract `keyPrefixSchema`): A then 1–9 of [A-Z0-9]. */
const KEY_PREFIX_RE = /^[A-Z][A-Z0-9]{1,9}$/;

interface FormFields {
  name: string;
  keyPrefix: string;
  description: string;
  icon: string;
  color: string;
  leadId: string;
}

function initialFields(project?: Project): FormFields {
  return {
    name: project?.name ?? '',
    keyPrefix: project?.keyPrefix ?? '',
    description: project?.description ?? '',
    icon: project?.icon ?? '',
    color: project?.color ?? '',
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

const FIELD: React.CSSProperties = { marginBottom: 'var(--space-3)' };

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
      const result = project
        ? await updateProject(project.id, buildUpdate(project, fields))
        : await createProject(buildCreate(fields));
      setSaved(result);
      if (mode === 'create') setFields(initialFields());
      onSaved?.(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  }

  const headingId = 'project-form-heading';

  return (
    <form onSubmit={submit} aria-labelledby={headingId}>
      <h2 id={headingId} style={{ fontSize: 'var(--fs-h2)', marginTop: 0 }}>
        {mode === 'create' ? 'New project' : 'Project details'}
      </h2>

      <div style={FIELD}>
        <Input
          id="project-name"
          label="Name"
          type="text"
          required
          maxLength={120}
          value={fields.name}
          disabled={busy}
          onChange={(e) => set('name', e.target.value)}
        />
      </div>

      <div style={FIELD}>
        <Input
          id="project-key-prefix"
          label="Key prefix"
          type="text"
          value={fields.keyPrefix}
          disabled={busy || mode === 'edit'}
          readOnly={mode === 'edit'}
          maxLength={10}
          placeholder="RYT"
          hint={
            mode === 'edit'
              ? 'The key prefix is fixed once the project exists.'
              : 'Uppercase letter then 1–9 letters/digits (e.g. RYT). Item keys read RYT-1, RYT-2…'
          }
          onChange={(e) => set('keyPrefix', e.target.value.toUpperCase())}
        />
      </div>

      <div style={FIELD}>
        <Textarea
          id="project-description"
          label="Description"
          rows={3}
          maxLength={2000}
          value={fields.description}
          disabled={busy}
          onChange={(e) => set('description', e.target.value)}
        />
      </div>

      <div style={FIELD}>
        <Input
          id="project-icon"
          label="Icon"
          type="text"
          maxLength={64}
          placeholder="A short label or emoji shortcode"
          value={fields.icon}
          disabled={busy}
          onChange={(e) => set('icon', e.target.value)}
        />
      </div>

      <div style={{ ...FIELD, display: 'flex', alignItems: 'flex-end', gap: 'var(--space-2)' }}>
        <div style={{ flex: 1 }}>
          <Input
            id="project-color"
            label="Color"
            type="text"
            maxLength={32}
            placeholder="#RRGGBB"
            value={fields.color}
            disabled={busy}
            onChange={(e) => set('color', e.target.value)}
          />
        </div>
        <span
          aria-hidden="true"
          style={{
            width: 'var(--space-5)',
            height: 'var(--space-5)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
            background: fields.color || 'var(--surface-sunken)',
          }}
        />
      </div>

      {mode === 'edit' ? (
        <div style={FIELD}>
          <label
            htmlFor="project-lead"
            style={{ display: 'block', fontSize: 'var(--fs-sm)', color: 'var(--fg-muted)' }}
          >
            Lead
          </label>
          <select
            id="project-lead"
            value={fields.leadId}
            disabled={busy}
            onChange={(e) => set('leadId', e.target.value)}
            style={SELECT}
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <Button type="submit" variant="primary" loading={busy}>
        {mode === 'create' ? 'Create project' : 'Save changes'}
      </Button>

      {error ? (
        <p role="alert" style={{ color: 'var(--error)', marginTop: 'var(--space-2)' }}>
          {error}
        </p>
      ) : null}

      {saved ? (
        <output style={{ display: 'block', marginTop: 'var(--space-2)', color: 'var(--fg-muted)' }}>
          Saved <strong>{saved.name}</strong> (
          <code style={{ fontFamily: 'var(--font-mono)' }}>{saved.keyPrefix}</code>).
        </output>
      ) : null}
    </form>
  );
}

const SELECT: React.CSSProperties = {
  font: 'inherit',
  color: 'var(--fg)',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-2)',
  width: '100%',
};

/** Build a `CreateProject` body from the form, omitting empty optionals. */
function buildCreate(fields: FormFields): CreateProject {
  const body: CreateProject = {
    name: fields.name.trim(),
    keyPrefix: fields.keyPrefix.trim(),
  };
  const description = fields.description.trim();
  if (description) body.description = description;
  const icon = fields.icon.trim();
  if (icon) body.icon = icon;
  const color = fields.color.trim();
  if (color) body.color = color;
  if (fields.leadId) body.leadId = fields.leadId;
  return body;
}

/** Build an `UpdateProject` body containing only the fields that changed (nullable clears). */
function buildUpdate(project: Project, fields: FormFields): UpdateProject {
  const body: UpdateProject = {};
  const name = fields.name.trim();
  if (name !== project.name) body.name = name;
  const description = fields.description.trim();
  if ((description || null) !== project.description) body.description = description || null;
  const color = fields.color.trim();
  if (color && color !== project.color) body.color = color;
  const icon = fields.icon.trim();
  if ((icon || null) !== project.icon) body.icon = icon || null;
  const leadId = fields.leadId || null;
  if (leadId !== project.leadId) body.leadId = leadId;
  return body;
}
