import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db, getPrefs, setPrefs } from '@/lib/db';
import { findOpenSession } from '@/lib/sessions';
import { PRESET_TAGS } from '@/data/presetTags';
import type { Child, DayTag, LocalPrefs, SleepSession, SleepSessionTag, Tag } from '@/types';

/**
 * Every screen reads data through these hooks, never from Dexie or Supabase
 * directly. That keeps the data layer swappable and means adding sync changed
 * nothing above this line.
 */

const alive = <T extends { deleted_at: string | null }>(rows: T[] | undefined) =>
  (rows ?? []).filter((r) => !r.deleted_at);

export function usePrefs(): LocalPrefs | undefined {
  return useLiveQuery(() => getPrefs(), []);
}

export function useHousehold() {
  return useLiveQuery(async () => {
    const prefs = await getPrefs();
    if (!prefs.householdId) return undefined;
    return db.households.get(prefs.householdId);
  }, []);
}

export function useMembers() {
  return useLiveQuery(async () => alive(await db.household_members.toArray()), []);
}

export function useInvites() {
  return useLiveQuery(
    async () =>
      alive(await db.household_invites.toArray()).filter(
        (i) => !i.revoked_at && !i.redeemed_at && new Date(i.expires_at) > new Date(),
      ),
    [],
  );
}

export function useChildren(): Child[] | undefined {
  return useLiveQuery(
    async () =>
      alive(await db.children.toArray())
        .filter((c) => !c.archived)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );
}

/** The child the header is currently scoped to. Falls back to the first child. */
export function useActiveChild(): Child | undefined {
  return useLiveQuery(async () => {
    const prefs = await getPrefs();
    const kids = alive(await db.children.toArray()).filter((c) => !c.archived);
    if (kids.length === 0) return undefined;
    return kids.find((c) => c.id === prefs.activeChildId) ?? kids[0];
  }, []);
}

export async function setActiveChild(childId: string) {
  await setPrefs({ activeChildId: childId });
}

/** The open session for a child, if any — this is what drives the Quick Log state. */
export function useOpenSession(childId: string | undefined): SleepSession | undefined | null {
  return useLiveQuery(async () => {
    if (!childId) return null;
    return (await findOpenSession(childId)) ?? null;
  }, [childId]);
}

export function useSessions(childId: string | undefined): SleepSession[] | undefined {
  return useLiveQuery(async () => {
    if (!childId) return [];
    const rows = await db.sleep_sessions.where('child_id').equals(childId).toArray();
    return alive(rows).sort((a, b) => ((a.put_down_at ?? '') < (b.put_down_at ?? '') ? 1 : -1));
  }, [childId]);
}

/** Completed sessions only — what the timeline and every chart is built from. */
export function useCompletedSessions(childId: string | undefined): SleepSession[] | undefined {
  const all = useSessions(childId);
  return all?.filter((s) => s.fell_asleep_at && s.woke_at);
}

export function useTags(): Tag[] | undefined {
  return useLiveQuery(async () => {
    const rows = await db.tags.toArray();
    const live = rows.filter((t) => !t.deleted_at);
    return live.length ? live : PRESET_TAGS;
  }, []);
}

export function useSessionTags(sessionId: string | undefined): SleepSessionTag[] | undefined {
  return useLiveQuery(async () => {
    if (!sessionId) return [];
    return alive(await db.sleep_session_tags.where('session_id').equals(sessionId).toArray());
  }, [sessionId]);
}

export function useAllSessionTags(): SleepSessionTag[] | undefined {
  return useLiveQuery(async () => alive(await db.sleep_session_tags.toArray()), []);
}

export function useDayTags(childId: string | undefined): DayTag[] | undefined {
  return useLiveQuery(async () => {
    if (!childId) return [];
    return alive(await db.day_tags.where('child_id').equals(childId).toArray());
  }, [childId]);
}

export function usePendingWrites(): number {
  return useLiveQuery(() => db.outbox.count(), [], 0) ?? 0;
}

/** 1Hz ticker for the live counters. Returns Date.now(). */
export function useNow(enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [enabled]);
  return now;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
