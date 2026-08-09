import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { useActiveChild, usePrefs, useSessionTags, useTags } from '@/hooks';
import { newId, put, softDelete } from '@/lib/writes';
import { clock, duration, minutesBetween, nowIso, relativeDayLabel, shiftIso } from '@/lib/time';
import { SegmentedControl, TagPill, ValidationNote } from '@/components/ui';
import type { SleepKind, SleepSession, SleepSessionTag } from '@/types';

/**
 * Manual add / edit. Used for backfilling a session nobody logged live, and for
 * fixing the times on one that was.
 *
 * Validation here is advisory by design: it points out a nonsensical ordering and
 * still lets the save through. Nothing blocks a tired parent from recording what
 * actually happened.
 */

type Field = 'put_down_at' | 'fell_asleep_at' | 'woke_at' | 'up_at';

const FIELDS: { key: Field; label: string }[] = [
  { key: 'put_down_at', label: 'Put down' },
  { key: 'fell_asleep_at', label: 'Fell asleep' },
  { key: 'woke_at', label: 'Woke' },
  { key: 'up_at', label: 'Out of crib' },
];

export default function SessionEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const child = useActiveChild();
  const prefs = usePrefs();
  const tags = useTags();

  const isNew = id === 'new';
  const existing = useLiveQuery(
    async () => (isNew || !id ? undefined : db.sleep_sessions.get(id)),
    [id, isNew],
  );
  const existingTags = useSessionTags(isNew ? undefined : id);

  const [draft, setDraft] = useState<SleepSession | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [seeded, setSeeded] = useState(false);

  // Seed the draft once, from the stored row or from sensible defaults for a new one.
  useEffect(() => {
    if (seeded || !child || !prefs?.householdId) return;
    if (isNew) {
      const now = new Date();
      const anHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      setDraft({
        id: newId(),
        household_id: prefs.householdId,
        child_id: child.id,
        type: 'nap',
        put_down_at: anHourAgo,
        fell_asleep_at: shiftIso(anHourAgo, 10),
        woke_at: nowIso(),
        up_at: null,
        status: 'completed',
        notes: null,
        created_by: prefs.userId,
        updated_at: nowIso(),
        deleted_at: null,
      });
      setSeeded(true);
    } else if (existing) {
      setDraft(existing);
      setSeeded(true);
    }
  }, [isNew, existing, child, prefs, seeded]);

  useEffect(() => {
    if (existingTags && selectedTags.length === 0) {
      setSelectedTags(existingTags.map((t) => t.tag_id));
    }
    // Only hydrates the initial selection; later edits are user-driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingTags]);

  const sleepMins = useMemo(
    () => (draft ? minutesBetween(draft.fell_asleep_at, draft.woke_at) : null),
    [draft],
  );

  const warning = useMemo(() => {
    if (!draft) return null;
    if (draft.fell_asleep_at && draft.woke_at && (sleepMins ?? 0) < 0)
      return 'Woke is before fell asleep — nudge it forward.';
    if (draft.fell_asleep_at && draft.woke_at && (sleepMins ?? 0) < 5)
      return 'That reads as under 5 minutes — nudge one of them.';
    if (draft.put_down_at && draft.fell_asleep_at && (minutesBetween(draft.put_down_at, draft.fell_asleep_at) ?? 0) < 0)
      return 'Fell asleep is before put down — nudge one of them.';
    return null;
  }, [draft, sleepMins]);

  if (!draft) return null;

  function nudge(field: Field, minutes: number) {
    setDraft((d) => {
      if (!d) return d;
      const current = d[field];
      // A field that was never recorded starts from now rather than staying blank.
      const base = current ?? nowIso();
      return { ...d, [field]: shiftIso(base, minutes) };
    });
  }

  function clearField(field: Field) {
    setDraft((d) => (d ? { ...d, [field]: null } : d));
  }

  async function save() {
    if (!draft) return;
    await put<SleepSession>('sleep_sessions', {
      ...draft,
      status: draft.woke_at ? 'completed' : 'in_progress',
    });

    // Reconcile tag rows: add what's new, tombstone what was removed.
    const before = new Set((existingTags ?? []).map((t) => t.tag_id));
    const after = new Set(selectedTags);
    const additions = selectedTags.filter((t) => !before.has(t));
    const removals = (existingTags ?? []).filter((t) => !after.has(t.tag_id));

    await Promise.all([
      ...additions.map((tagId) =>
        put<SleepSessionTag>('sleep_session_tags', {
          id: newId(),
          household_id: draft.household_id,
          session_id: draft.id,
          tag_id: tagId,
          updated_at: nowIso(),
          deleted_at: null,
        }),
      ),
      ...removals.map((row) => softDelete('sleep_session_tags', row.id)),
    ]);

    navigate(-1);
  }

  async function remove() {
    if (!draft) return;
    await softDelete('sleep_sessions', draft.id);
    navigate('/timeline');
  }

  const sessionTagOptions = (tags ?? []).filter((t) => t.scope === 'session');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-[18px] pt-[6px] pb-3">
        <button
          onClick={() => navigate(-1)}
          className="press flex min-h-11 items-center text-[14.5px] font-medium text-muted"
        >
          Cancel
        </button>
        <span className="serif text-[19px] font-medium">
          {isNew ? 'Add session' : 'Edit session'}
        </span>
        <button
          onClick={save}
          className="press flex min-h-11 items-center text-[14.5px] font-bold text-awake"
        >
          Save
        </button>
      </div>

      <div className="scroll-y min-h-0 flex-1 px-4 pb-6">
        <div className="mb-[14px]">
          <SegmentedControl
            options={[
              { value: 'nap' as SleepKind, label: 'Nap' },
              { value: 'night' as SleepKind, label: 'Night' },
            ]}
            value={draft.type}
            onChange={(v) => setDraft({ ...draft, type: v })}
          />
        </div>

        <div className="mb-[14px] flex items-baseline justify-between px-1">
          <span className="label-caps">Duration</span>
          <span className="num text-[15px] font-semibold text-muted">{duration(sleepMins)}</span>
        </div>

        <div className="mb-[14px] overflow-hidden rounded-[22px] bg-surface">
          {FIELDS.map((f, i) => (
            <div key={f.key} className={i > 0 ? 'border-t border-bg px-[15px] py-[13px]' : 'px-[15px] py-[13px]'}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[13.5px] font-semibold">{f.label}</div>
                  <div className="mt-px text-[12px] text-faint">
                    {relativeDayLabel(draft[f.key])}
                  </div>
                </div>
                <div
                  className="num text-[21px] font-semibold tracking-[-0.03em]"
                  style={{ color: draft[f.key] ? 'var(--text)' : 'var(--faint)' }}
                >
                  {clock(draft[f.key])}
                </div>
              </div>
              <div className="mt-[10px] flex gap-[6px]">
                {[-15, -5, 5, 15].map((d) => (
                  <button
                    key={d}
                    onClick={() => nudge(f.key, d)}
                    className="press num flex h-11 flex-1 items-center justify-center rounded-[13px] bg-surface2 text-[13px] font-semibold active:bg-line"
                  >
                    {d > 0 ? `+${d}` : `−${Math.abs(d)}`}
                  </button>
                ))}
                <button
                  onClick={() => clearField(f.key)}
                  className="press flex h-11 flex-[1.2] items-center justify-center rounded-[13px] bg-surface2 text-[13px] font-semibold active:bg-line"
                >
                  clear
                </button>
              </div>
            </div>
          ))}
        </div>

        {warning && <ValidationNote>{warning}</ValidationNote>}

        <div className="label-caps px-[2px] pb-[7px]">Tags</div>
        <div className="flex flex-wrap gap-[7px]">
          {sessionTagOptions.map((t) => (
            <TagPill
              key={t.id}
              tag={t}
              size="sm"
              selected={selectedTags.includes(t.id)}
              onClick={() =>
                setSelectedTags((s) =>
                  s.includes(t.id) ? s.filter((x) => x !== t.id) : [...s, t.id],
                )
              }
            />
          ))}
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-line px-4 pt-[14px] pb-[calc(26px+env(safe-area-inset-bottom))]">
        <button
          onClick={save}
          className="press flex h-[52px] items-center justify-center rounded-[17px] text-base font-bold"
          style={{ background: 'var(--text)', color: 'var(--bg)' }}
        >
          Save session
        </button>
        {!isNew && (
          <button
            onClick={remove}
            className="press flex h-[46px] items-center justify-center text-[15px] font-semibold text-danger"
          >
            Delete session
          </button>
        )}
      </div>
    </div>
  );
}
