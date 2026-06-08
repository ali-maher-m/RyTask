import type { Priority, UnresolvedToken } from '@rytask/contracts';
import type { SlackMessage } from '../../../common/ports/slack.port';

/**
 * Pure Block Kit builders + parsers for Slack capture (M3, US3, slack-capture-flow §4). These are
 * leaf functions — no Nest, no I/O, no tokens/secrets — so they are fully unit-testable. The
 * controller opens `buildCaptureModal(...)` synchronously within Slack's 3 s `trigger_id` window;
 * on submit it parses the view with `extractCaptureFields(...)`; the worker confirms with
 * `buildCaptureConfirmation(...)`. The grammar is shared with the slash path (one brain everywhere).
 */

/** `callback_id` that identifies a RyTask capture modal submission on the interactivity webhook. */
export const CAPTURE_MODAL_CALLBACK_ID = 'rytask_capture';

/** Block + action ids for the modal inputs (stable — the submission parser reads by these). */
export const CAPTURE_BLOCK = {
  title: { block: 'rt_title', action: 'value' },
  description: { block: 'rt_description', action: 'value' },
  priority: { block: 'rt_priority', action: 'value' },
  dueDate: { block: 'rt_due', action: 'value' },
} as const;

/** What the worker needs to confirm back to Slack after a modal submit (carried in private_metadata). */
export interface CaptureModalContext {
  responseUrl: string | null;
  channelId: string | null;
}

/** A Block Kit view is opaque to the port; typed loosely here (no SDK dependency leaks out). */
export type SlackView = Record<string, unknown>;

const PRIORITY_OPTIONS: Priority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE'];

const PRIORITY_LABELS: Record<Priority, string> = {
  URGENT: 'Urgent',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
  NONE: 'No priority',
};

/**
 * Build the capture modal (US3, FR-SLK-011). Title is required; description/priority/due date are
 * optional so a title-only submit still creates with smart defaults (FR-SLK-012). The project is the
 * connection's routing default (M3 does not surface a per-submit project picker); `private_metadata`
 * carries the reply target so the worker can confirm. Contains no tokens/secrets.
 */
export function buildCaptureModal(meta: CaptureModalContext): SlackView {
  return {
    type: 'modal',
    callback_id: CAPTURE_MODAL_CALLBACK_ID,
    private_metadata: JSON.stringify(meta),
    title: { type: 'plain_text', text: 'Capture a task' },
    submit: { type: 'plain_text', text: 'Create' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: CAPTURE_BLOCK.title.block,
        label: { type: 'plain_text', text: 'Title' },
        element: {
          type: 'plain_text_input',
          action_id: CAPTURE_BLOCK.title.action,
          placeholder: { type: 'plain_text', text: 'What needs doing?' },
        },
      },
      {
        type: 'input',
        block_id: CAPTURE_BLOCK.description.block,
        optional: true,
        label: { type: 'plain_text', text: 'Description' },
        element: {
          type: 'plain_text_input',
          action_id: CAPTURE_BLOCK.description.action,
          multiline: true,
        },
      },
      {
        type: 'input',
        block_id: CAPTURE_BLOCK.priority.block,
        optional: true,
        label: { type: 'plain_text', text: 'Priority' },
        element: {
          type: 'static_select',
          action_id: CAPTURE_BLOCK.priority.action,
          options: PRIORITY_OPTIONS.map((p) => ({
            text: { type: 'plain_text', text: PRIORITY_LABELS[p] },
            value: p,
          })),
        },
      },
      {
        type: 'input',
        block_id: CAPTURE_BLOCK.dueDate.block,
        optional: true,
        label: { type: 'plain_text', text: 'Due date' },
        element: { type: 'datepicker', action_id: CAPTURE_BLOCK.dueDate.action },
      },
    ],
  };
}

/** The fields a parsed modal submission yields (all optional but title may be empty → defaults). */
export interface CaptureModalFields {
  title: string;
  description?: string;
  priority?: Priority;
  dueDate?: string;
}

/** Parse the private_metadata reply target back off a submitted view (safe on garbled input). */
export function parseCaptureModalContext(privateMetadata: unknown): CaptureModalContext {
  if (typeof privateMetadata !== 'string') {
    return { responseUrl: null, channelId: null };
  }
  try {
    const parsed = JSON.parse(privateMetadata) as Partial<CaptureModalContext>;
    return { responseUrl: parsed.responseUrl ?? null, channelId: parsed.channelId ?? null };
  } catch {
    return { responseUrl: null, channelId: null };
  }
}

/**
 * Extract the captured fields from a `view_submission` payload's `view.state.values` (US3). Reads by
 * the stable block/action ids; tolerant of missing optional inputs. Pure — no I/O, no Slack SDK.
 */
export function extractCaptureFields(view: unknown): CaptureModalFields {
  const values = readValues(view);
  const title = readInput(values, CAPTURE_BLOCK.title.block, CAPTURE_BLOCK.title.action) ?? '';
  const description = readInput(
    values,
    CAPTURE_BLOCK.description.block,
    CAPTURE_BLOCK.description.action,
  );
  const priorityRaw = readSelect(
    values,
    CAPTURE_BLOCK.priority.block,
    CAPTURE_BLOCK.priority.action,
  );
  const priority = PRIORITY_OPTIONS.includes(priorityRaw as Priority)
    ? (priorityRaw as Priority)
    : undefined;
  const dueDate = readDate(values, CAPTURE_BLOCK.dueDate.block, CAPTURE_BLOCK.dueDate.action);
  return {
    title: title.trim(),
    description: description?.trim() || undefined,
    priority,
    dueDate: dueDate || undefined,
  };
}

/**
 * Confirmation message (FR-SLK-013, slack-capture-flow §3/§5): item key as a deep link + the title,
 * a note of any unresolved quick-add tokens (slash path), and a "link your account" nudge for an
 * unmapped captor. Ephemeral, plain — contains no tokens/secrets.
 */
export function buildCaptureConfirmation(params: {
  key: string;
  title: string;
  link: string;
  unresolved?: UnresolvedToken[];
  unmapped: boolean;
}): SlackMessage {
  const lines = [`:white_check_mark: Captured *<${params.link}|${params.key}>* — ${params.title}`];
  const note = unresolvedNote(params.unresolved ?? []);
  if (note) {
    lines.push(note);
  }
  if (params.unmapped) {
    lines.push(
      "_Your Slack account isn't linked to RyTask yet, so this isn't attributed to you. Ask an admin to link you in *Settings → Integrations*._",
    );
  }
  return { text: lines.join('\n'), responseType: 'ephemeral' };
}

/** Human-readable "what wasn't applied" note from the unresolved quick-add tokens, or null. */
export function unresolvedNote(unresolved: UnresolvedToken[]): string | null {
  if (unresolved.length === 0) {
    return null;
  }
  const tokens = unresolved.map((u) => `\`${u.token}\``).join(', ');
  return `_Kept verbatim (couldn't resolve): ${tokens}_`;
}

// — internal readers over the loosely-typed Block Kit submission payload —

type ViewValues = Record<string, Record<string, Record<string, unknown>>>;

function readValues(view: unknown): ViewValues {
  const state = (view as { state?: { values?: unknown } } | null)?.state;
  const values = state?.values;
  return (values && typeof values === 'object' ? values : {}) as ViewValues;
}

function readInput(values: ViewValues, block: string, action: string): string | undefined {
  const v = values[block]?.[action]?.value;
  return typeof v === 'string' ? v : undefined;
}

function readSelect(values: ViewValues, block: string, action: string): string | undefined {
  const opt = values[block]?.[action]?.selected_option as { value?: unknown } | undefined;
  return typeof opt?.value === 'string' ? opt.value : undefined;
}

function readDate(values: ViewValues, block: string, action: string): string | undefined {
  const v = values[block]?.[action]?.selected_date;
  return typeof v === 'string' ? v : undefined;
}
