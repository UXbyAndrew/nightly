import type { Tag, TagCategory, TagScope } from '@/types';

/**
 * The global preset library. Seeded locally on first run and mirrored by the
 * SQL migration, so a household has something to tag with before it has any data.
 *
 * Ids are fixed strings rather than random UUIDs so the local seed and the server
 * seed refer to the same rows — otherwise every device would create duplicates.
 */

export const CATEGORY_ORDER: TagCategory[] = [
  'health',
  'schedule',
  'environment',
  'food',
  'activity',
];

export const CATEGORY_LABEL: Record<TagCategory, string> = {
  health: 'Health',
  schedule: 'Schedule',
  environment: 'Environment',
  food: 'Food',
  activity: 'Activity',
  other: 'Other',
};

/** Each category owns a hue so a tag's chip colour is predictable everywhere. */
export const CATEGORY_COLOR: Record<TagCategory, string> = {
  health: 'var(--danger)',
  schedule: 'oklch(0.74 0.11 250)',
  environment: 'var(--incrib)',
  food: 'var(--warn)',
  activity: 'var(--settling)',
  other: 'var(--faint)',
};

interface PresetDef {
  name: string;
  category: TagCategory;
  scope: TagScope;
  /** Starts starred, so it surfaces first in the quick tag prompt. */
  favourite?: boolean;
}

const PRESETS: PresetDef[] = [
  // Health — almost all whole-day conditions.
  { name: 'teething', category: 'health', scope: 'day', favourite: true },
  { name: 'sick', category: 'health', scope: 'day' },
  { name: 'fever', category: 'health', scope: 'day' },
  { name: 'congestion', category: 'health', scope: 'day' },
  { name: 'vaccination', category: 'health', scope: 'day' },
  { name: 'growth spurt', category: 'health', scope: 'day' },

  // Schedule
  { name: 'skipped nap', category: 'schedule', scope: 'day', favourite: true },
  { name: 'short nap', category: 'schedule', scope: 'session', favourite: true },
  { name: 'early wake', category: 'schedule', scope: 'session' },
  { name: 'late bedtime', category: 'schedule', scope: 'session' },
  { name: 'daycare day', category: 'schedule', scope: 'day', favourite: true },
  { name: 'time change / DST', category: 'schedule', scope: 'day' },
  { name: 'schedule change', category: 'schedule', scope: 'day' },

  // Environment
  { name: 'travel / new place', category: 'environment', scope: 'day' },
  { name: 'room too hot', category: 'environment', scope: 'session' },
  { name: 'room too cold', category: 'environment', scope: 'session' },
  { name: 'noise', category: 'environment', scope: 'session' },
  { name: 'new sleep space', category: 'environment', scope: 'day' },

  // Food
  { name: 'big meal', category: 'food', scope: 'session' },
  { name: 'late meal', category: 'food', scope: 'session' },
  { name: 'new food', category: 'food', scope: 'day' },
  { name: 'more milk', category: 'food', scope: 'session' },
  { name: 'less milk', category: 'food', scope: 'session' },

  // Activity
  { name: 'screen time', category: 'activity', scope: 'day' },
  { name: 'high activity day', category: 'activity', scope: 'day' },
  { name: 'low activity day', category: 'activity', scope: 'day' },
  { name: 'overtired', category: 'activity', scope: 'session', favourite: true },
  { name: 'car nap', category: 'activity', scope: 'session' },
  { name: 'stroller nap', category: 'activity', scope: 'session' },
  { name: 'extra outdoor time', category: 'activity', scope: 'day' },
  { name: 'missed wind-down', category: 'activity', scope: 'session' },
];

const slug = (name: string) => name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

export const PRESET_TAGS: Tag[] = PRESETS.map((p) => ({
  id: `preset-${slug(p.name)}`,
  household_id: null,
  name: p.name,
  category: p.category,
  scope: p.scope,
  is_preset: true,
  created_by: null,
  updated_at: '2026-01-01T00:00:00.000Z',
  deleted_at: null,
}));

export const DEFAULT_FAVOURITE_TAG_IDS = PRESETS.filter((p) => p.favourite).map(
  (p) => `preset-${slug(p.name)}`,
);
