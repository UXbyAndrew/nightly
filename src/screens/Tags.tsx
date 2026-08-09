import { useMemo, useState } from 'react';
import { usePrefs, useTags } from '@/hooks';
import { setPrefs } from '@/lib/db';
import { newId, put, softDelete } from '@/lib/writes';
import { CATEGORY_COLOR, CATEGORY_LABEL, CATEGORY_ORDER } from '@/data/presetTags';
import { nowIso } from '@/lib/time';
import { PrimaryButton, ScreenTitle, SecondaryButton, Sheet } from '@/components/ui';
import type { Tag, TagCategory, TagScope } from '@/types';

/**
 * The tag library. Presets grouped by category, plus whatever the household adds.
 * Starring a tag floats it to the top of the quick prompt after a sleep.
 */
export default function Tags() {
  const tags = useTags();
  const prefs = usePrefs();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<TagCategory>('environment');
  const [scope, setScope] = useState<TagScope>('session');

  const favourites = prefs?.favouriteTagIds ?? [];

  const grouped = useMemo(() => {
    const map = new Map<TagCategory, Tag[]>();
    for (const t of tags ?? []) {
      map.set(t.category, [...(map.get(t.category) ?? []), t]);
    }
    return map;
  }, [tags]);

  async function toggleFavourite(id: string) {
    const next = favourites.includes(id)
      ? favourites.filter((f) => f !== id)
      : [...favourites, id];
    await setPrefs({ favouriteTagIds: next });
  }

  async function create() {
    if (!name.trim() || !prefs?.householdId) return;
    await put<Tag & { id: string; updated_at: string }>('tags', {
      id: newId(),
      household_id: prefs.householdId,
      name: name.trim().toLowerCase(),
      category,
      scope,
      is_preset: false,
      created_by: prefs.userId,
      updated_at: nowIso(),
      deleted_at: null,
    });
    setName('');
    setCreating(false);
  }

  return (
    <div className="scroll-y min-h-0 flex-1 px-4 pt-3 pb-4">
      <div className="mb-[5px] flex items-center justify-between">
        <ScreenTitle>Tags</ScreenTitle>
        <button
          onClick={() => setCreating(true)}
          className="press flex h-10 items-center rounded-full bg-surface px-4 text-[13.5px] font-semibold"
        >
          New tag
        </button>
      </div>
      <p className="mb-4 text-[13.5px] leading-[1.5] text-muted">
        Star a tag to keep it at the top of the quick prompt.{' '}
        <strong className="font-semibold text-text">Day</strong> tags cover the whole day;{' '}
        <strong className="font-semibold text-text">session</strong> tags attach to one sleep.
      </p>

      {CATEGORY_ORDER.map((cat) => {
        const list = grouped.get(cat);
        if (!list?.length) return null;
        return (
          <div key={cat} className="mb-4">
            <div className="flex items-center gap-2 px-[2px] pb-[9px]">
              <span
                className="size-[9px] rounded-[3px]"
                style={{ background: CATEGORY_COLOR[cat] }}
              />
              <span className="label-caps !text-muted">{CATEGORY_LABEL[cat]}</span>
            </div>
            <div className="overflow-hidden rounded-[20px] bg-surface">
              {list.map((t, i) => (
                <div
                  key={t.id}
                  className="flex min-h-[50px] items-center gap-[11px] px-[14px] py-[10px]"
                  style={{ borderTop: i > 0 ? '1px solid var(--bg)' : undefined }}
                >
                  <span
                    className="size-[10px] shrink-0 rounded-[3px]"
                    style={{ background: CATEGORY_COLOR[t.category] }}
                  />
                  <span className="flex-1 text-[14.5px] font-medium">{t.name}</span>
                  <span className="rounded-md border border-line px-[7px] py-[3px] text-[11px] font-semibold uppercase tracking-[0.04em] text-faint">
                    {t.scope}
                  </span>
                  <button
                    onClick={() => toggleFavourite(t.id)}
                    aria-label={favourites.includes(t.id) ? 'Unstar tag' : 'Star tag'}
                    className="press flex size-11 items-center justify-center text-lg"
                    style={{ color: favourites.includes(t.id) ? 'var(--warn)' : 'var(--line)' }}
                  >
                    ★
                  </button>
                  {!t.is_preset && (
                    <button
                      onClick={() => softDelete('tags', t.id)}
                      aria-label="Delete tag"
                      className="press flex size-11 items-center justify-center text-lg text-faint"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <Sheet open={creating} onClose={() => setCreating(false)}>
        <div className="serif mb-4 text-2xl font-medium">New tag</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="white noise off"
          className="mb-[14px] h-[52px] w-full rounded-2xl bg-surface2 px-[15px] text-base text-text outline-none placeholder:text-faint"
        />
        <div className="label-caps mb-[9px]">Category</div>
        <div className="mb-[18px] flex flex-wrap gap-[7px]">
          {CATEGORY_ORDER.map((c) => {
            const on = c === category;
            return (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className="press flex min-h-[38px] items-center rounded-full px-[14px] text-[13.5px] font-semibold"
                style={{
                  background: on
                    ? `color-mix(in oklab, ${CATEGORY_COLOR[c]} 26%, var(--bg))`
                    : 'var(--surface2)',
                  boxShadow: on ? `inset 0 0 0 1.5px ${CATEGORY_COLOR[c]}` : 'none',
                  color: on ? CATEGORY_COLOR[c] : 'var(--muted)',
                }}
              >
                {CATEGORY_LABEL[c]}
              </button>
            );
          })}
        </div>
        <div className="label-caps mb-[9px]">Applies to</div>
        <div className="mb-5 flex gap-[5px] rounded-full bg-surface2 p-[5px]">
          {(
            [
              { v: 'session' as TagScope, l: 'One session' },
              { v: 'day' as TagScope, l: 'The whole day' },
            ]
          ).map(({ v, l }) => (
            <button
              key={v}
              onClick={() => setScope(v)}
              className="press flex h-[42px] flex-1 items-center justify-center rounded-full text-sm font-semibold"
              style={{
                background: scope === v ? 'var(--bg)' : 'transparent',
                color: scope === v ? 'var(--text)' : 'var(--muted)',
              }}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="flex gap-[10px]">
          <SecondaryButton onClick={() => setCreating(false)}>Cancel</SecondaryButton>
          <div className="flex-[1.3]">
            <PrimaryButton onClick={create} disabled={!name.trim()}>
              Create tag
            </PrimaryButton>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
