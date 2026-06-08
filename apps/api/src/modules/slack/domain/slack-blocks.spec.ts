import { describe, expect, it } from 'vitest';
import {
  CAPTURE_BLOCK,
  CAPTURE_MODAL_CALLBACK_ID,
  buildCaptureConfirmation,
  buildCaptureModal,
  extractCaptureFields,
  parseCaptureModalContext,
} from './slack-blocks';

/**
 * Unit test for the pure Block Kit builders/parsers (T057, US3, slack-capture-flow §4). The modal +
 * confirmation builders must produce valid Block Kit and contain NO tokens/secrets; the submission
 * parser must read the chosen fields and tolerate missing optionals.
 */
const NO_SECRET = (json: string) => {
  expect(json).not.toMatch(/xoxb-/); // no bot token
  expect(json).not.toMatch(/signing/i); // no signing secret
  expect(json).not.toMatch(/Bearer /); // no auth header
};

describe('buildCaptureModal', () => {
  it('produces a valid modal view with a required title + optional fields', () => {
    const view = buildCaptureModal({ responseUrl: 'https://hooks.slack/x', channelId: 'C1' });
    expect(view.type).toBe('modal');
    expect(view.callback_id).toBe(CAPTURE_MODAL_CALLBACK_ID);
    const blocks = view.blocks as Array<{ block_id: string; optional?: boolean }>;
    const titleBlock = blocks.find((b) => b.block_id === CAPTURE_BLOCK.title.block);
    expect(titleBlock?.optional).toBeUndefined(); // title is required
    const ids = blocks.map((b) => b.block_id);
    expect(ids).toEqual(
      expect.arrayContaining([
        CAPTURE_BLOCK.title.block,
        CAPTURE_BLOCK.description.block,
        CAPTURE_BLOCK.priority.block,
        CAPTURE_BLOCK.dueDate.block,
      ]),
    );
  });

  it('carries the reply target in private_metadata and leaks no secrets', () => {
    const meta = { responseUrl: 'https://hooks.slack/x', channelId: 'C1' };
    const view = buildCaptureModal(meta);
    expect(parseCaptureModalContext(view.private_metadata)).toEqual(meta);
    NO_SECRET(JSON.stringify(view));
  });
});

describe('extractCaptureFields', () => {
  it('reads title, description, priority, and due date from a view_submission', () => {
    const view = {
      state: {
        values: {
          [CAPTURE_BLOCK.title.block]: { [CAPTURE_BLOCK.title.action]: { value: ' Ship it ' } },
          [CAPTURE_BLOCK.description.block]: {
            [CAPTURE_BLOCK.description.action]: { value: 'the thing' },
          },
          [CAPTURE_BLOCK.priority.block]: {
            [CAPTURE_BLOCK.priority.action]: { selected_option: { value: 'HIGH' } },
          },
          [CAPTURE_BLOCK.dueDate.block]: {
            [CAPTURE_BLOCK.dueDate.action]: { selected_date: '2026-06-30' },
          },
        },
      },
    };
    expect(extractCaptureFields(view)).toEqual({
      title: 'Ship it',
      description: 'the thing',
      priority: 'HIGH',
      dueDate: '2026-06-30',
    });
  });

  it('tolerates a title-only submit (optionals absent → undefined)', () => {
    const view = {
      state: {
        values: {
          [CAPTURE_BLOCK.title.block]: { [CAPTURE_BLOCK.title.action]: { value: 'Just a title' } },
        },
      },
    };
    expect(extractCaptureFields(view)).toEqual({
      title: 'Just a title',
      description: undefined,
      priority: undefined,
      dueDate: undefined,
    });
  });

  it('ignores an out-of-set priority value', () => {
    const view = {
      state: {
        values: {
          [CAPTURE_BLOCK.title.block]: { [CAPTURE_BLOCK.title.action]: { value: 'x' } },
          [CAPTURE_BLOCK.priority.block]: {
            [CAPTURE_BLOCK.priority.action]: { selected_option: { value: 'BOGUS' } },
          },
        },
      },
    };
    expect(extractCaptureFields(view).priority).toBeUndefined();
  });
});

describe('parseCaptureModalContext', () => {
  it('returns nulls for garbled/missing metadata', () => {
    expect(parseCaptureModalContext(undefined)).toEqual({ responseUrl: null, channelId: null });
    expect(parseCaptureModalContext('not json')).toEqual({ responseUrl: null, channelId: null });
  });
});

describe('buildCaptureConfirmation', () => {
  it('renders an ephemeral key link + title, with unresolved + unmapped notes', () => {
    const msg = buildCaptureConfirmation({
      key: 'RY-42',
      title: 'Fix login',
      link: 'https://app.rytask/work-items/abc',
      unresolved: [{ token: '@ghost', kind: 'assignee' }],
      unmapped: true,
    });
    expect(msg.responseType).toBe('ephemeral');
    expect(msg.text).toContain('RY-42');
    expect(msg.text).toContain('https://app.rytask/work-items/abc');
    expect(msg.text).toContain('@ghost');
    expect(msg.text.toLowerCase()).toContain('link');
    NO_SECRET(JSON.stringify(msg));
  });

  it('omits the notes when fully resolved and mapped', () => {
    const msg = buildCaptureConfirmation({
      key: 'RY-1',
      title: 'Clean',
      link: 'https://app/x',
      unresolved: [],
      unmapped: false,
    });
    expect(msg.text).not.toMatch(/Kept verbatim/);
    expect(msg.text.toLowerCase()).not.toContain('link your account');
  });
});
