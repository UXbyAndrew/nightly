/*
 * Entity shapes. These mirror the Postgres tables 1:1 so a row can move between
 * Dexie and Supabase without translation.
 *
 * All ids are client-generated UUID strings — this is what makes offline creation
 * possible, and what makes the outbox's upserts idempotent on retry.
 * All timestamps are ISO strings.
 */

export type SleepKind = 'nap' | 'night';
export type SessionStatus = 'in_progress' | 'completed';
export type TagCategory = 'health' | 'schedule' | 'environment' | 'food' | 'activity' | 'other';
export type TagScope = 'session' | 'day';
export type MemberRole = 'owner' | 'member';

/** Fields every syncable row carries. */
export interface Syncable {
  id: string;
  household_id: string;
  updated_at: string;
  /** Soft delete. Tombstones are kept so a delete can propagate to other devices. */
  deleted_at: string | null;
}

export interface Household {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface HouseholdMember extends Syncable {
  user_id: string;
  role: MemberRole;
  display_name: string | null;
  email: string | null;
  joined_at: string;
}

export interface HouseholdInvite extends Syncable {
  code: string;
  label: string | null;
  email: string | null;
  created_by: string | null;
  expires_at: string;
  redeemed_by: string | null;
  redeemed_at: string | null;
  revoked_at: string | null;
}

export interface Child extends Syncable {
  name: string;
  birth_date: string | null;
  /** Index into the six onboarding accents. Stored as an index, not a colour value,
   *  so a future palette change re-themes existing children. */
  color: number;
  created_by: string | null;
  archived: boolean;
}

/**
 * The core entity. Four timestamps because put-down and sleep onset are
 * different events to a parent, as are waking and getting up.
 *
 * The in-progress session is also what drives the Quick Log state machine:
 *   put_down_at only ................ settling
 *   + fell_asleep_at ................ asleep
 *   + woke_at ....................... awake in crib
 *   + up_at ......................... completed
 * Storing state as data rather than component state means it survives a reload
 * and shows up on the other parent's phone.
 */
export interface SleepSession extends Syncable {
  child_id: string;
  type: SleepKind;
  put_down_at: string | null;
  fell_asleep_at: string | null;
  woke_at: string | null;
  up_at: string | null;
  status: SessionStatus;
  notes: string | null;
  created_by: string | null;
}

export interface Tag {
  id: string;
  /** null for the global preset library, which every household can read. */
  household_id: string | null;
  name: string;
  category: TagCategory;
  scope: TagScope;
  is_preset: boolean;
  created_by: string | null;
  updated_at: string;
  deleted_at: string | null;
}

export interface SleepSessionTag extends Syncable {
  session_id: string;
  tag_id: string;
}

export interface DayTag extends Syncable {
  child_id: string;
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  tag_id: string;
}

/* ---------- local-only tables ---------- */

export type OutboxOp = 'upsert' | 'delete';

/** One pending write. Flushed in insertion order; retried safely because upserts key on id. */
export interface OutboxEntry {
  localId?: number;
  entity: SyncEntity;
  entityId: string;
  op: OutboxOp;
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  lastError: string | null;
}

export type SyncEntity =
  | 'households'
  | 'household_members'
  | 'household_invites'
  | 'children'
  | 'sleep_sessions'
  | 'tags'
  | 'sleep_session_tags'
  | 'day_tags';

/** Per-table pull cursor, so a reconnect only fetches what changed. */
export interface SyncMeta {
  key: string;
  lastPulledAt: string | null;
}

/** Single-row local settings that never sync (device-specific choices). */
export interface LocalPrefs {
  key: 'prefs';
  activeChildId: string | null;
  theme: 'dark' | 'light' | 'system';
  householdId: string | null;
  userId: string | null;
  installBannerDismissed: boolean;
  favouriteTagIds: string[];
}

/* ---------- derived view models ---------- */

export type LogState = 'awake' | 'settling' | 'asleep' | 'incrib';

export interface DaySummary {
  date: string;
  label: string;
  sessions: SleepSession[];
  totalSleepMin: number;
  napCount: number;
  nightSleepMin: number;
}
