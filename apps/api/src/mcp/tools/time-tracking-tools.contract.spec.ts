import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { buildDispatcher, dispatchError, makeSession } from '../mcp.testkit';

/**
 * Per-tool contract test for the 5 time-tracking MCP tools (AC-9, BRD §5 MVP tool set). Each tool
 * dispatches to the SAME provider the timer/log/report REST controllers call, returns the raw DTO its
 * contract declares (the providers return no `{ data }` envelope), and surfaces categorized errors
 * (INVALID_ARGUMENT / PERMISSION_DENIED / NOT_FOUND). Writes (stop_timer / log_time) stamp
 * `source = 'MCP'` so plan-vs-actual reporting can attribute agent-logged time.
 */
const WID = '0193b3a0-0000-7000-8000-0000000000b1'; // work item
const TID = '0193b3a0-0000-7000-8000-0000000000b2'; // timer
const LOG = '0193b3a0-0000-7000-8000-0000000000b3'; // time log
const PID = '0193b3a0-0000-7000-8000-0000000000b4'; // project
const UID = '0193b3a0-0000-7000-8000-000000000003'; // user

const activeTimer = {
  id: TID,
  workItemId: WID,
  startedAt: '2026-06-19T10:00:00.000Z',
  note: null,
};
const timeLog = {
  id: LOG,
  workItemId: WID,
  projectId: PID,
  userId: UID,
  startedAt: '2026-06-19T10:00:00.000Z',
  endedAt: '2026-06-19T10:30:00.000Z',
  durationSeconds: 1800,
  note: null,
  billable: false,
  source: 'MCP',
  classification: 'PLANNED',
  classificationOverridden: false,
  createdAt: '2026-06-19T10:30:00.000Z',
  updatedAt: '2026-06-19T10:30:00.000Z',
};
const overview = {
  range: { from: '2026-06-01', to: '2026-06-19' },
  totals: { loggedSeconds: 1800, plannedSeconds: 1800, interruptionSeconds: 0, entries: 1 },
  weeks: [],
  topItems: [],
};

const startTimer = { start: vi.fn(async () => activeTimer) };
const stopTimer = { stop: vi.fn(async () => timeLog) };
const activeTimerProvider = {
  getActive: vi.fn(async () => activeTimer as typeof activeTimer | null),
};
const createTimeLog = { create: vi.fn(async () => timeLog) };
const timeReports = { getOverview: vi.fn(async () => overview) };

const dispatcher = buildDispatcher({
  startTimer,
  stopTimer,
  activeTimer: activeTimerProvider,
  createTimeLog,
  timeReports,
});
const owner = makeSession();

describe('MCP time-tracking tools (contract)', () => {
  it('start_timer starts on the item and returns the active timer', async () => {
    const res = await dispatcher.dispatch(owner, 'start_timer', { workItemId: WID });
    expect(res).toEqual(activeTimer);
    expect(startTimer.start).toHaveBeenCalledWith(WID, null);

    await dispatcher.dispatch(owner, 'start_timer', { workItemId: WID, note: 'pairing' });
    expect(startTimer.start).toHaveBeenLastCalledWith(WID, 'pairing');
  });

  it('stop_timer stops the timer and stamps source=MCP', async () => {
    const res = await dispatcher.dispatch(owner, 'stop_timer', { timerId: TID });
    expect(res).toEqual(timeLog);
    expect(stopTimer.stop).toHaveBeenCalledWith(TID, undefined, 'MCP');
  });

  it('get_active_timer returns the running timer or null', async () => {
    expect(await dispatcher.dispatch(owner, 'get_active_timer', {})).toEqual(activeTimer);
    activeTimerProvider.getActive.mockResolvedValueOnce(null);
    expect(await dispatcher.dispatch(owner, 'get_active_timer', {})).toBeNull();
  });

  it('log_time logs against the item and stamps source=MCP', async () => {
    const res = await dispatcher.dispatch(owner, 'log_time', {
      workItemId: WID,
      durationSeconds: 1800,
      note: 'fix',
    });
    expect(res).toEqual(timeLog);
    expect(createTimeLog.create).toHaveBeenCalledWith(
      WID,
      expect.objectContaining({ durationSeconds: 1800, note: 'fix' }),
      undefined,
      'MCP',
    );
  });

  it('time_report returns the overview for the requested range', async () => {
    const res = await dispatcher.dispatch(owner, 'time_report', {
      from: '2026-06-01',
      to: '2026-06-19',
    });
    expect(res).toEqual(overview);
    expect(timeReports.getOverview).toHaveBeenCalledWith(
      expect.objectContaining({ from: '2026-06-01', to: '2026-06-19' }),
    );
  });

  it('categorizes bad input, denial (writes), and not-found', async () => {
    // INVALID_ARGUMENT — a non-uuid id fails zod before any provider call.
    expect(await dispatchError(dispatcher, owner, 'start_timer', { workItemId: 'nope' })).toBe(
      'INVALID_ARGUMENT',
    );

    // PERMISSION_DENIED — a read-only PAT cannot start/stop/log (work:write) but CAN read.
    const readOnly = makeSession({ role: 'MEMBER', scopes: ['work:read'] });
    expect(await dispatchError(dispatcher, readOnly, 'start_timer', { workItemId: WID })).toBe(
      'PERMISSION_DENIED',
    );
    expect(await dispatchError(dispatcher, readOnly, 'stop_timer', { timerId: TID })).toBe(
      'PERMISSION_DENIED',
    );
    expect(
      await dispatchError(dispatcher, readOnly, 'log_time', {
        workItemId: WID,
        durationSeconds: 60,
      }),
    ).toBe('PERMISSION_DENIED');
    expect(await dispatchError(dispatcher, readOnly, 'get_active_timer', {})).toBe('OK');
    expect(
      await dispatchError(dispatcher, readOnly, 'time_report', {
        from: '2026-06-01',
        to: '2026-06-19',
      }),
    ).toBe('OK');

    // NOT_FOUND — a missing timer in the principal's scope propagates as NOT_FOUND.
    stopTimer.stop.mockRejectedValueOnce(new NotFoundException('no active timer to stop'));
    expect(await dispatchError(dispatcher, owner, 'stop_timer', { timerId: TID })).toBe(
      'NOT_FOUND',
    );
  });
});
