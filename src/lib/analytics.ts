import { dateKey } from './time';
import { groupByDay, sessionDayKey, settleMinutes, sleepMinutes, wakeWindows } from './sessions';
import type { DayTag, SleepSession, SleepSessionTag, Tag } from '@/types';

/**
 * Pure functions over sessions. The dataset is a few thousand rows at most, so
 * everything is computed on the device — there is no server aggregation to keep
 * in sync, and it all still works offline.
 */

export type MetricId = 'night' | 'nap' | 'settle' | 'wake';
export type RangeDays = 7 | 30 | 90;

export const METRICS: { id: MetricId; label: string }[] = [
  { id: 'night', label: 'Night sleep' },
  { id: 'nap', label: 'Nap' },
  { id: 'settle', label: 'Fall asleep' },
  { id: 'wake', label: 'Wake gaps' },
];

/** Below this, a comparison is shown as "not enough data" rather than a number. */
export const MIN_SAMPLE = 5;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function daysAgoKey(n: number): string {
  return dateKey(new Date(Date.now() - n * 86_400_000));
}

export function withinRange(sessions: SleepSession[], range: RangeDays): SleepSession[] {
  const cutoff = daysAgoKey(range);
  return sessions.filter((s) => sessionDayKey(s) >= cutoff);
}

/** One value per day for the bar chart, oldest first. Days with no data are null. */
export function dailySeries(
  sessions: SleepSession[],
  metric: MetricId,
  range: RangeDays,
): { date: string; value: number | null }[] {
  const days = groupByDay(withinRange(sessions, range));
  const byDate = new Map(days.map((d) => [d.date, d]));
  const out: { date: string; value: number | null }[] = [];

  for (let i = range - 1; i >= 0; i--) {
    const key = daysAgoKey(i);
    const day = byDate.get(key);
    if (!day) {
      out.push({ date: key, value: null });
      continue;
    }
    out.push({ date: key, value: metricForDay(day.sessions, metric) });
  }
  return out;
}

function metricForDay(sessions: SleepSession[], metric: MetricId): number | null {
  if (metric === 'night') {
    const vals = sessions.filter((s) => s.type === 'night').map(sleepMinutes).filter(isNum);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  }
  if (metric === 'nap') {
    const vals = sessions.filter((s) => s.type === 'nap').map(sleepMinutes).filter(isNum);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  }
  if (metric === 'settle') {
    const vals = sessions.map(settleMinutes).filter(isNum);
    return vals.length ? mean(vals) : null;
  }
  const gaps = wakeWindows(sessions);
  return gaps.length ? mean(gaps) : null;
}

const isNum = (n: number | null): n is number => n !== null && !Number.isNaN(n);

export interface MetricSummary {
  average: number | null;
  /** Change vs. the immediately preceding window of the same length. */
  deltaMinutes: number | null;
  sampleDays: number;
}

export function summarise(
  sessions: SleepSession[],
  metric: MetricId,
  range: RangeDays,
): MetricSummary {
  const current = dailySeries(sessions, metric, range)
    .map((d) => d.value)
    .filter(isNum);

  // Same-length window immediately before the current one.
  const cutoffOld = daysAgoKey(range * 2);
  const cutoffNew = daysAgoKey(range);
  const previousSessions = sessions.filter((s) => {
    const k = sessionDayKey(s);
    return k >= cutoffOld && k < cutoffNew;
  });
  const previous = groupByDay(previousSessions)
    .map((d) => metricForDay(d.sessions, metric))
    .filter(isNum);

  const avg = current.length ? mean(current) : null;
  const prevAvg = previous.length ? mean(previous) : null;

  return {
    average: avg,
    deltaMinutes: avg !== null && prevAvg !== null ? Math.round(avg - prevAvg) : null,
    sampleDays: current.length,
  };
}

/**
 * Consistency: mean absolute deviation of bedtime / wake time, in minutes.
 * Reported as "±" because it answers "how much does this move night to night".
 */
export function spread(sessions: SleepSession[], range: RangeDays): { bed: number | null; wake: number | null } {
  const nights = withinRange(sessions, range).filter((s) => s.type === 'night');

  const bedMins = nights
    .map((s) => s.put_down_at)
    .filter((v): v is string => !!v)
    .map(clockMinutesCentredOnEvening);
  const wakeMins = nights
    .map((s) => s.woke_at)
    .filter((v): v is string => !!v)
    .map((iso) => {
      const d = new Date(iso);
      return d.getHours() * 60 + d.getMinutes();
    });

  return { bed: madOrNull(bedMins), wake: madOrNull(wakeMins) };
}

/** Bedtimes straddle midnight, so shift post-midnight times past 1440 before averaging. */
function clockMinutesCentredOnEvening(iso: string): number {
  const d = new Date(iso);
  const m = d.getHours() * 60 + d.getMinutes();
  return m < 12 * 60 ? m + 1440 : m;
}

function madOrNull(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.round(mean(xs.map((x) => Math.abs(x - m))));
}

/* ---------- tag correlation ---------- */

export interface Correlation {
  tag: Tag;
  withAvg: number;
  withoutAvg: number;
  deltaMinutes: number;
  nWith: number;
  nWithout: number;
  /** False when either side is below MIN_SAMPLE — the UI must say so, not imply a finding. */
  reliable: boolean;
}

/**
 * Average total night sleep on days carrying a tag vs. days without it.
 *
 * This is a plain difference of means, stated as correlation and never as cause.
 * The sample size travels with the result so the UI can always show n and can
 * refuse to present a comparison built on three days.
 */
export function correlateTags(
  sessions: SleepSession[],
  tags: Tag[],
  sessionTags: SleepSessionTag[],
  dayTags: DayTag[],
  range: RangeDays,
): Correlation[] {
  const days = groupByDay(withinRange(sessions, range));
  if (days.length === 0) return [];

  const nightByDate = new Map(
    days.map((d) => [
      d.date,
      d.sessions.filter((s) => s.type === 'night').map(sleepMinutes).filter(isNum),
    ]),
  );

  // A tag counts for a day if it was applied to the day, or to any session that day.
  const sessionDate = new Map(sessions.map((s) => [s.id, sessionDayKey(s)]));
  const datesByTag = new Map<string, Set<string>>();
  const add = (tagId: string, date: string) => {
    const set = datesByTag.get(tagId) ?? new Set<string>();
    set.add(date);
    datesByTag.set(tagId, set);
  };
  for (const dt of dayTags) if (!dt.deleted_at) add(dt.tag_id, dt.date);
  for (const st of sessionTags) {
    if (st.deleted_at) continue;
    const date = sessionDate.get(st.session_id);
    if (date) add(st.tag_id, date);
  }

  const out: Correlation[] = [];

  for (const tag of tags) {
    const tagged = datesByTag.get(tag.id);
    if (!tagged || tagged.size === 0) continue;

    const withVals: number[] = [];
    const withoutVals: number[] = [];
    for (const [date, nights] of nightByDate) {
      if (nights.length === 0) continue;
      const total = nights.reduce((a, b) => a + b, 0);
      (tagged.has(date) ? withVals : withoutVals).push(total);
    }
    if (withVals.length === 0 || withoutVals.length === 0) continue;

    const withAvg = mean(withVals);
    const withoutAvg = mean(withoutVals);
    out.push({
      tag,
      withAvg,
      withoutAvg,
      deltaMinutes: Math.round(withAvg - withoutAvg),
      nWith: withVals.length,
      nWithout: withoutVals.length,
      reliable: withVals.length >= MIN_SAMPLE && withoutVals.length >= MIN_SAMPLE,
    });
  }

  // Biggest absolute effect first, but always sink the unreliable ones below the rest.
  return out.sort((a, b) => {
    if (a.reliable !== b.reliable) return a.reliable ? -1 : 1;
    return Math.abs(b.deltaMinutes) - Math.abs(a.deltaMinutes);
  });
}
