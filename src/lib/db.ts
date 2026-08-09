import Dexie, { type Table } from 'dexie';
import type {
  Child,
  DayTag,
  Household,
  HouseholdInvite,
  HouseholdMember,
  LocalPrefs,
  OutboxEntry,
  SleepSession,
  SleepSessionTag,
  SyncMeta,
  Tag,
} from '@/types';

/**
 * Dexie is the app's only source of truth. Screens read from here and nowhere else;
 * Supabase is a sync target that this database is reconciled against.
 *
 * That single rule is what makes offline logging work without any special-casing
 * in the UI — a write at 2am with no signal takes exactly the same path as one online.
 */
class NightlyDB extends Dexie {
  households!: Table<Household, string>;
  household_members!: Table<HouseholdMember, string>;
  household_invites!: Table<HouseholdInvite, string>;
  children!: Table<Child, string>;
  sleep_sessions!: Table<SleepSession, string>;
  tags!: Table<Tag, string>;
  sleep_session_tags!: Table<SleepSessionTag, string>;
  day_tags!: Table<DayTag, string>;

  // Local-only — never synced.
  outbox!: Table<OutboxEntry, number>;
  sync_meta!: Table<SyncMeta, string>;
  prefs!: Table<LocalPrefs, string>;

  constructor() {
    super('nightly');
    this.version(1).stores({
      households: 'id, updated_at',
      household_members: 'id, household_id, user_id, updated_at',
      household_invites: 'id, household_id, code, updated_at',
      children: 'id, household_id, updated_at, archived',
      sleep_sessions: 'id, household_id, child_id, status, put_down_at, fell_asleep_at, updated_at',
      tags: 'id, household_id, category, scope, is_preset, updated_at',
      sleep_session_tags: 'id, household_id, session_id, tag_id, updated_at',
      day_tags: 'id, household_id, child_id, date, tag_id, updated_at',
      outbox: '++localId, entity, entityId, createdAt',
      sync_meta: 'key',
      prefs: 'key',
    });
  }
}

export const db = new NightlyDB();

export const DEFAULT_PREFS: LocalPrefs = {
  key: 'prefs',
  activeChildId: null,
  theme: 'dark',
  householdId: null,
  userId: null,
  installBannerDismissed: false,
  favouriteTagIds: [],
};

export async function getPrefs(): Promise<LocalPrefs> {
  return (await db.prefs.get('prefs')) ?? DEFAULT_PREFS;
}

export async function setPrefs(patch: Partial<Omit<LocalPrefs, 'key'>>): Promise<void> {
  const current = await getPrefs();
  await db.prefs.put({ ...current, ...patch, key: 'prefs' });
}

/** Wipes everything local. Used by sign-out so a shared device doesn't leak a household. */
export async function clearLocalData(): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.households,
      db.household_members,
      db.household_invites,
      db.children,
      db.sleep_sessions,
      db.tags,
      db.sleep_session_tags,
      db.day_tags,
      db.outbox,
      db.sync_meta,
      db.prefs,
    ],
    async () => {
      await Promise.all([
        db.households.clear(),
        db.household_members.clear(),
        db.household_invites.clear(),
        db.children.clear(),
        db.sleep_sessions.clear(),
        db.tags.clear(),
        db.sleep_session_tags.clear(),
        db.day_tags.clear(),
        db.outbox.clear(),
        db.sync_meta.clear(),
        db.prefs.clear(),
      ]);
    },
  );
}
