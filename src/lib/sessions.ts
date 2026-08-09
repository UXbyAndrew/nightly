import { db } from './db';
import { newId, patch, put } from './writes';
import { dateKey, minutesBetween, nowIso, shiftIso } from './time';
import type { DaySummary, LogState, SleepKind, SleepSession } from '@/types';

/**
 * Sleep-session domain logic: deriving the Quick Log state from stored data,
 * advancing the state machine, and rolling sessions up into days.
 */

/** Which of the four states an in-progress session represents. */
export function stateOf(session: SleepSession | undefined | null): LogState {
  if (!session || session.status === 'completed') return 'awake';
  if (!session.fell_asleep_at) return 'settling';
  if (!session.woke_at) return 'asleep';
  return 'incrib';
}

/** The timestamp the live counter on Quick Log counts up from. */
export function counterAnchor(session: SleepSession | undefined | null, state: LogState) {
  if (!session) return null;
  if (state === 'settling') return session.put_down_at;
  if (state === 'asleep') return session.fell_asleep_at;
  if (state === 'incrib') return session.woke_at;
  return null;
}

/** The field the correction chips nudge — always the transition just made. */
export function correctionField(state: LogState): keyof SleepSession | null {
  if (state === 'settling') return 'put_down_at';
  if (state === 'asleep') return 'fell_asleep_at';
  if (state === 'incrib') return 'woke_at';
  return null;
}

export const CORRECTION_WORD: Record<Exclude<LogState, 'awake'>, string> = {
  settling: 'Put down',
  asleep: 'Fell asleep',
  incrib: 'Woke',
};

export async function findOpenSession(childId: string): Promise<SleepSession | undefined> {
  const rows = await db.sleep_sessions
    .where('child_id')
    .equals(childId)
    .filter((s) => s.status === 'in_progress' && !s.deleted_at)
    .toArray();
  // Newest wins if two devices somehow both opened one — the older is closed out below.
  return rows.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))[0];
}

/** Nap before ~5pm, bedtime after. Only a suggestion — the mode picker overrides it. */
export function suggestKind(at: Date = new Date()): SleepKind {
  const h = at.getHours();
  return h >= 17 || h < 4 ? 'night' : 'nap';
}

export async function startSession(
  householdId: string,
  childId: string,
  kind: SleepKind,
  userId: string | null,
): Promise<SleepSession> {
  return put<SleepSession>('sleep_sessions', {
    id: newId(),
    household_id: householdId,
    child_id: childId,
    type: kind,
    put_down_at: nowIso(),
    fell_asleep_at: null,
    woke_at: null,
    up_at: null,
    status: 'in_progress',
    notes: null,
    created_by: userId,
    updated_at: nowIso(),
    deleted_at: null,
  });
}

/** Advances settling → asleep → incrib → completed, stamping the relevant time. */
export async function advanceSession(session: SleepSession): Promise<SleepSession | null> {
  const state = stateOf(session);
  if (state === 'settling')
    return patch<SleepSession>('sleep_sessions', session.id, { fell_asleep_at: nowIso() });
  if (state === 'asleep')
    return patch<SleepSession>('sleep_sessions', session.id, { woke_at: nowIso() });
  if (state === 'incrib')
    return patch<SleepSession>('sleep_sessions', session.id, {
      up_at: nowIso(),
      status: 'completed',
    });
  return null;
}

/** The −5m / −10m correction chips. Shifts the transition backwards in time. */
export async function nudgeSession(
  session: SleepSession,
  field: keyof SleepSession,
  deltaMinutes: number,
): Promise<SleepSession | null> {
  const current = session[field];
  if (typeof current !== 'string') return null;
  return patch<SleepSession>('sleep_sessions', session.id, {
    [field]: shiftIso(current, deltaMinutes),
  } as Partial<SleepSession>);
}

/* ---------- derived values ---------- */

/** Actual sleep: onset to waking. Null until both are known. */
export function sleepMinutes(s: SleepSession): number | null {
  return minutesBetween(s.fell_asleep_at, s.woke_at);
}

/** How long it took to fall asleep. */
export function settleMinutes(s: SleepSession): number | null {
  return minutesBetween(s.put_down_at, s.fell_asleep_at);
}

/** Total time in the crib, including settling and lying awake afterwards. */
export function inCribMinutes(s: SleepSession): number | null {
  return minutesBetween(s.put_down_at, s.up_at ?? s.woke_at);
}

/** The gap between getting up and the next put-down. */
export function wakeWindows(sessions: SleepSession[]): number[] {
  const ordered = [...sessions]
    .filter((s) => s.put_down_at)
    .sort((a, b) => (a.put_down_at! < b.put_down_at! ? -1 : 1));
  const out: number[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const prevUp = ordered[i - 1].up_at ?? ordered[i - 1].woke_at;
    const gap = minutesBetween(prevUp, ordered[i].put_down_at);
    if (gap !== null && gap > 0 && gap < 16 * 60) out.push(gap);
  }
  return out;
}

/**
 * A session belongs to the day it *started* on, so a night that runs past midnight
 * stays attached to the evening a parent would file it under.
 */
export function sessionDayKey(s: SleepSession): string {
  return dateKey(s.put_down_at ?? s.fell_asleep_at ?? s.updated_at);
}

export function groupByDay(sessions: SleepSession[]): DaySummary[] {
  const byDay = new Map<string, SleepSession[]>();
  for (const s of sessions) {
    const key = sessionDayKey(s);
    const list = byDay.get(key);
    if (list) list.push(s);
    else byDay.set(key, [s]);
  }

  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, list]) => {
      const sorted = list.sort((a, b) =>
        (a.put_down_at ?? '') < (b.put_down_at ?? '') ? 1 : -1,
      );
      const sleepOf = (s: SleepSession) => sleepMinutes(s) ?? 0;
      return {
        date,
        label: date,
        sessions: sorted,
        totalSleepMin: sorted.reduce((a, s) => a + sleepOf(s), 0),
        napCount: sorted.filter((s) => s.type === 'nap').length,
        nightSleepMin: sorted.filter((s) => s.type === 'night').reduce((a, s) => a + sleepOf(s), 0),
      };
    });
}

/**
 * Segments for the 24h day bar. A session crossing midnight is split in two so it
 * renders correctly on the day it started.
 */
export function daySegments(sessions: SleepSession[]): {
  fromPct: number;
  widthPct: number;
  kind: SleepKind;
}[] {
  const out: { fromPct: number; widthPct: number; kind: SleepKind }[] = [];
  for (const s of sessions) {
    const start = s.fell_asleep_at ?? s.put_down_at;
    const end = s.woke_at ?? s.up_at;
    if (!start || !end) continue;
    const startDate = new Date(start);
    const from = startDate.getHours() * 60 + startDate.getMinutes();
    const total = minutesBetween(start, end) ?? 0;
    if (total <= 0) continue;
    const first = Math.min(total, 1440 - from);
    out.push({ fromPct: (from / 1440) * 100, widthPct: (first / 1440) * 100, kind: s.type });
    const spill = total - first;
    if (spill > 0) {
      out.push({ fromPct: 0, widthPct: (Math.min(spill, 1440) / 1440) * 100, kind: s.type });
    }
  }
  return out;
}
