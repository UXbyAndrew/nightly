import { db, getPrefs } from './db';
import { supabase } from './supabase';
import { applyRemote } from './writes';
import type { SyncEntity } from '@/types';

/**
 * The sync engine.
 *
 * Three jobs, in order of importance:
 *   1. flush  — drain the outbox to Supabase, retrying safely
 *   2. pull   — reconcile anything changed while this device was away
 *   3. listen — apply the other parent's writes live
 *
 * Nothing here is on the critical path of a tap. If it all fails, the app still
 * works; the outbox just gets longer.
 */

const SYNCED_TABLES: SyncEntity[] = [
  'households',
  'household_members',
  'household_invites',
  'children',
  'sleep_sessions',
  'tags',
  'sleep_session_tags',
  'day_tags',
];

const FLUSH_INTERVAL_MS = 15_000;
/** Give up on a row after this many tries so one poison entry can't wedge the queue. */
const MAX_ATTEMPTS = 8;

let flushing = false;
let timer: number | null = null;
let channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;

/**
 * Drain the outbox in insertion order.
 *
 * Every write is an upsert keyed on the client-generated id, so retrying after a
 * dropped connection can never duplicate a row — which is what lets this be
 * aggressive about retries without any dedupe bookkeeping.
 */
export async function flushOutbox(): Promise<void> {
  if (!supabase || flushing || !navigator.onLine) return;
  flushing = true;
  try {
    const pending = await db.outbox.orderBy('createdAt').toArray();
    for (const entry of pending) {
      try {
        const { error } = await supabase
          .from(entry.entity)
          .upsert(entry.payload, { onConflict: 'id' });

        if (error) throw new Error(error.message);
        if (entry.localId !== undefined) await db.outbox.delete(entry.localId);
      } catch (err) {
        const attempts = entry.attempts + 1;
        const message = err instanceof Error ? err.message : String(err);
        if (entry.localId === undefined) continue;

        if (attempts >= MAX_ATTEMPTS) {
          // Drop it rather than block every later write behind it. The row is
          // still correct locally and the next edit to it will re-queue.
          console.warn('[sync] giving up on outbox entry', entry.entity, entry.entityId, message);
          await db.outbox.delete(entry.localId);
        } else {
          await db.outbox.update(entry.localId, { attempts, lastError: message });
          // A network failure will hit the next entry too — stop and retry later.
          break;
        }
      }
    }
  } finally {
    flushing = false;
  }
}

/**
 * Fetch everything changed since the last successful pull.
 *
 * Realtime can miss events while a device is asleep or offline, so this runs on
 * every (re)connect. Without it, a phone that was in airplane mode overnight
 * would never learn about the other parent's entries.
 */
export async function pullChanges(householdId: string): Promise<void> {
  if (!supabase || !navigator.onLine) return;

  for (const table of SYNCED_TABLES) {
    const metaKey = `pull:${table}`;
    const meta = await db.sync_meta.get(metaKey);
    const since = meta?.lastPulledAt ?? '1970-01-01T00:00:00.000Z';

    let query = supabase.from(table).select('*').gt('updated_at', since);
    // The preset tag library is global (household_id null), so it can't be filtered.
    if (table !== 'tags') query = query.eq('household_id', householdId);

    const { data, error } = await query;
    if (error) {
      console.warn('[sync] pull failed', table, error.message);
      continue;
    }
    if (!data?.length) continue;

    let newest = since;
    for (const row of data) {
      await applyRemote(table, row as { id: string; updated_at: string });
      if (row.updated_at > newest) newest = row.updated_at as string;
    }
    await db.sync_meta.put({ key: metaKey, lastPulledAt: newest });
  }
}

/** Live updates from the other caregiver's device. */
function subscribe(householdId: string): void {
  if (!supabase || channel) return;

  channel = supabase.channel(`household:${householdId}`);
  for (const table of SYNCED_TABLES) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `household_id=eq.${householdId}` },
      (payload) => {
        const row = payload.new as { id?: string; updated_at?: string } | null;
        if (!row?.id || !row.updated_at) return;
        // Same last-write-wins comparison as the server trigger, so an incoming
        // echo can't stomp an edit this device made more recently while offline.
        void applyRemote(table, row as { id: string; updated_at: string });
      },
    );
  }

  channel.subscribe((status) => {
    // Every (re)subscribe closes the gap Realtime may have left.
    if (status === 'SUBSCRIBED') void pullChanges(householdId);
  });
}

/** Wire up flush triggers: reconnect, foreground, and a slow safety-net interval. */
export function startSync(): () => void {
  if (!supabase) return () => {};

  const kick = async () => {
    const prefs = await getPrefs();
    await flushOutbox();
    if (prefs.householdId) {
      subscribe(prefs.householdId);
      await pullChanges(prefs.householdId);
    }
  };

  const onOnline = () => void kick();
  const onVisible = () => {
    if (document.visibilityState === 'visible') void kick();
  };

  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  timer = window.setInterval(() => void flushOutbox(), FLUSH_INTERVAL_MS);
  void kick();

  return () => {
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
    if (timer) window.clearInterval(timer);
    void channel?.unsubscribe();
    channel = null;
  };
}
