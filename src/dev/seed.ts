import { db, getPrefs } from '@/lib/db';
import { newId } from '@/lib/writes';
import { dateKey, nowIso } from '@/lib/time';
import type { DayTag, SleepSession, SleepSessionTag } from '@/types';

/**
 * Development helper. Generates ~6 weeks of plausible sleep for the active child,
 * including the messy cases the charts have to survive: missed timestamps, a 2am
 * wake, a rough teething stretch, a travel week, and a couple of skipped naps.
 *
 * Exposed on window in dev only — see main.tsx. Not shipped in a production build.
 */

const DAYS = 42;

/** Deterministic pseudo-random so a reseed produces the same data to compare against. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export async function seedDemoData(): Promise<string> {
  const prefs = await getPrefs();
  const child = await db.children.toCollection().first();
  if (!prefs.householdId || !child) return 'No household or child yet — finish onboarding first.';

  const rand = rng(20260809);
  const householdId = prefs.householdId;
  const sessions: SleepSession[] = [];
  const dayTags: DayTag[] = [];
  const sessionTags: SleepSessionTag[] = [];

  // Two rough stretches, so correlation has something real to find.
  const teethingDays = new Set([9, 10, 11, 12, 13, 26, 27]);
  const travelDays = new Set([18, 19, 20, 21, 22]);
  const daycareDay = (d: Date) => [1, 2, 4].includes(d.getDay());

  for (let i = DAYS - 1; i >= 0; i--) {
    const day = new Date();
    day.setDate(day.getDate() - i);
    day.setSeconds(0, 0);
    const key = dateKey(day);
    const rough = teethingDays.has(i) || travelDays.has(i);

    const mk = (h: number, m: number, offsetDays = 0) => {
      const d = new Date(day);
      d.setDate(d.getDate() + offsetDays);
      d.setHours(h, m, 0, 0);
      return d.toISOString();
    };

    // --- night ---
    const bedH = 19;
    const bedM = Math.round(20 + rand() * 40 + (rough ? 25 : 0));
    const settle = Math.round(8 + rand() * 14 + (rough ? 30 : 0));
    const wakeH = 6;
    const wakeM = Math.round(20 + rand() * 45 - (rough ? 35 : 0));

    const putDown = mk(bedH, Math.min(59, bedM));
    const fellAsleep = new Date(new Date(putDown).getTime() + settle * 60000).toISOString();
    const woke = mk(wakeH, Math.max(0, wakeM), 1);

    sessions.push(
      base(householdId, child.id, 'night', {
        put_down_at: putDown,
        fell_asleep_at: fellAsleep,
        woke_at: woke,
        // Some mornings nobody remembers to log getting up — that's realistic.
        up_at: rand() > 0.35 ? new Date(new Date(woke).getTime() + 14 * 60000).toISOString() : null,
      }),
    );

    // A genuine 2am wake, split into a second night session.
    if (i === 7 || i === 27) {
      sessions.push(
        base(householdId, child.id, 'night', {
          put_down_at: mk(2, 4, 1),
          fell_asleep_at: mk(2, 22, 1),
          woke_at: mk(5, 58, 1),
          up_at: null,
        }),
      );
    }

    // --- naps ---
    const skipped = rand() > 0.88;
    if (!skipped) {
      const napStart = mk(12, Math.round(30 + rand() * 40));
      const napLen = Math.round((rough ? 35 : 65) + rand() * 45);
      sessions.push(
        base(householdId, child.id, 'nap', {
          put_down_at: napStart,
          fell_asleep_at: new Date(new Date(napStart).getTime() + 9 * 60000).toISOString(),
          woke_at: new Date(new Date(napStart).getTime() + (9 + napLen) * 60000).toISOString(),
          up_at: null,
        }),
      );
    }

    // --- tags ---
    const push = (tagId: string) =>
      dayTags.push({
        id: newId(),
        household_id: householdId,
        child_id: child.id,
        date: key,
        tag_id: tagId,
        updated_at: nowIso(),
        deleted_at: null,
      });

    if (teethingDays.has(i)) push('preset-teething');
    if (travelDays.has(i)) push('preset-travel-new-place');
    if (daycareDay(day)) push('preset-daycare-day');
    if (skipped) push('preset-skipped-nap');
  }

  await db.transaction('rw', db.sleep_sessions, db.day_tags, db.sleep_session_tags, async () => {
    await db.sleep_sessions.bulkPut(sessions);
    await db.day_tags.bulkPut(dayTags);
    await db.sleep_session_tags.bulkPut(sessionTags);
  });

  return `Seeded ${sessions.length} sessions and ${dayTags.length} day tags across ${DAYS} days.`;
}

/** Removes seeded sleep data, leaving the household, child and tag library intact. */
export async function clearDemoData(): Promise<string> {
  await db.transaction('rw', db.sleep_sessions, db.day_tags, db.sleep_session_tags, async () => {
    await db.sleep_sessions.clear();
    await db.day_tags.clear();
    await db.sleep_session_tags.clear();
  });
  await db.outbox.clear();
  return 'Cleared all sleep data.';
}

function base(
  householdId: string,
  childId: string,
  type: 'nap' | 'night',
  times: Pick<SleepSession, 'put_down_at' | 'fell_asleep_at' | 'woke_at' | 'up_at'>,
): SleepSession {
  return {
    id: newId(),
    household_id: householdId,
    child_id: childId,
    type,
    ...times,
    status: 'completed',
    notes: null,
    created_by: null,
    updated_at: nowIso(),
    deleted_at: null,
  };
}
