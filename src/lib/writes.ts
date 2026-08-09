import { db } from './db';
import { nowIso } from './time';
import type { SyncEntity } from '@/types';

/**
 * Every mutation in the app goes through here.
 *
 * The contract: write to Dexie and enqueue an outbox entry in one transaction.
 * The UI re-renders from Dexie immediately; the network is never on the critical
 * path of a tap. If the device is offline the outbox simply drains later.
 */

export function newId(): string {
  // crypto.randomUUID needs a secure context; localhost and https both qualify.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Fallback keeps dev on a bare-IP origin working rather than throwing at 2am.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** The minimum a row must carry to be syncable. */
interface Row {
  id: string;
  updated_at: string;
}

/**
 * Upsert a row locally and queue it for sync.
 *
 * `updated_at` is stamped at the moment of the local edit. The server's
 * last-write-wins trigger compares against it, so two devices editing offline
 * converge on the later edit regardless of which one reconnects first.
 */
export async function put<T extends Row>(entity: SyncEntity, row: T): Promise<T> {
  const stamped = { ...row, updated_at: nowIso() };
  await db.transaction('rw', db.table(entity), db.outbox, async () => {
    await db.table(entity).put(stamped);
    await db.outbox.add({
      entity,
      entityId: stamped.id,
      op: 'upsert',
      payload: stamped as unknown as Record<string, unknown>,
      createdAt: nowIso(),
      attempts: 0,
      lastError: null,
    });
  });
  return stamped;
}

/** Patch an existing local row. No-ops if it's gone. */
export async function patch<T extends Row>(
  entity: SyncEntity,
  id: string,
  changes: Partial<T>,
): Promise<T | null> {
  const existing = (await db.table(entity).get(id)) as T | undefined;
  if (!existing) return null;
  return put(entity, { ...existing, ...changes });
}

/**
 * Soft delete. A tombstone rather than a real removal, so the delete can reach
 * the other parent's phone — and so a concurrent later edit can resurrect the
 * row instead of being silently lost.
 */
export async function softDelete(entity: SyncEntity, id: string): Promise<void> {
  const existing = (await db.table(entity).get(id)) as Row | undefined;
  if (!existing) return;
  await put(entity, { ...existing, deleted_at: nowIso() });
}

/**
 * Apply a row that arrived from the server (realtime event or reconciliation pull).
 * Last-write-wins on updated_at: a local edit made after the server's copy is kept,
 * which is what stops an incoming echo from stomping an edit made while offline.
 */
export async function applyRemote(entity: SyncEntity, remote: Row): Promise<void> {
  const local = (await db.table(entity).get(remote.id)) as Row | undefined;
  if (local && new Date(local.updated_at) > new Date(remote.updated_at)) return;
  await db.table(entity).put(remote);
}
