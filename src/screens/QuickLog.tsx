import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useActiveChild,
  useCompletedSessions,
  useNow,
  useOpenSession,
  usePrefs,
  useTags,
} from '@/hooks';
import {
  CORRECTION_WORD,
  advanceSession,
  correctionField,
  counterAnchor,
  nudgeSession,
  sessionDayKey,
  sleepMinutes,
  startSession,
  stateOf,
  suggestKind,
} from '@/lib/sessions';
import { clock, dateKey, duration, liveCounter, minutesBetween } from '@/lib/time';
import { newId, put } from '@/lib/writes';
import { CribIcon, MoonIcon, SettlingIcon, SunIcon, CheckIcon, ClockIcon } from '@/components/Icons';
import { PrimaryButton, SecondaryButton, SegmentedControl, Sheet, TagPill } from '@/components/ui';
import type { LogState, SleepKind, SleepSession, SleepSessionTag } from '@/types';

/**
 * The hero screen. One 246px ring, four states, one tap per transition.
 *
 * State is derived from the open session row rather than held in component state,
 * so it survives a reload, and the other parent's phone shows the same thing.
 */

interface Phase {
  word: string;
  wordSize: number;
  color: string;
  glow: string;
  counterLabel: string;
  /** Ring fill and inset-ring opacities, per the handoff. */
  mix: number;
  ring: number;
}

const PHASES: Record<LogState, Phase> = {
  awake: {
    word: 'Awake',
    wordSize: 40,
    color: 'var(--awake)',
    glow: 'oklch(0.78 0.10 45 / .20)',
    counterLabel: 'Awake for',
    mix: 17,
    ring: 40,
  },
  settling: {
    word: 'Settling',
    wordSize: 40,
    color: 'var(--settling)',
    glow: 'oklch(0.76 0.075 320 / .22)',
    counterLabel: 'Settling for',
    mix: 18,
    ring: 42,
  },
  asleep: {
    word: 'Asleep',
    wordSize: 40,
    color: 'var(--asleep)',
    glow: 'oklch(0.72 0.075 285 / .26)',
    counterLabel: 'Asleep for',
    mix: 20,
    ring: 42,
  },
  incrib: {
    word: 'Awake in crib',
    wordSize: 38,
    color: 'var(--incrib)',
    glow: 'oklch(0.79 0.065 175 / .22)',
    counterLabel: 'In crib for',
    mix: 18,
    ring: 40,
  },
};

const RING_ICON: Record<LogState, typeof SunIcon> = {
  awake: SunIcon,
  settling: SettlingIcon,
  asleep: MoonIcon,
  incrib: CribIcon,
};

/** How long the correction chips stay up after a transition. */
const CORRECTION_MS = 9000;

export default function QuickLog() {
  const navigate = useNavigate();
  const child = useActiveChild();
  const prefs = usePrefs();
  const open = useOpenSession(child?.id);
  const completed = useCompletedSessions(child?.id);
  const tags = useTags();

  // useLiveQuery yields undefined while the query is in flight and null when
  // there genuinely is no open session. Conflating the two rendered "Awake" over
  // a sleep that was already running, and invited a second one to be started.
  const sessionLoading = open === undefined;
  const session = open ?? undefined;
  const state = stateOf(session);
  const phase = PHASES[state];
  const RingIcon = RING_ICON[state];

  const [mode, setMode] = useState<SleepKind>(() => suggestKind());
  const [revealed, setRevealed] = useState(true);
  const [correctionUntil, setCorrectionUntil] = useState(0);
  const [sheetSession, setSheetSession] = useState<SleepSession | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState<{ dur: string; tags: number } | null>(null);
  const prevState = useRef<LogState>(state);

  // Counters tick every second, but only while something is actually running.
  const now = useNow(state !== 'awake' || !!session);
  const anchor = counterAnchor(session, state);

  // The counter runs and is visible from the moment a sleep starts. The design
  // originally concealed it while settling to avoid a parent watching a number
  // climb at 3am, but knowing how long it's been is the point of the screen —
  // so it shows by default and "Hide" is there for anyone who'd rather not see it.
  useEffect(() => {
    if (prevState.current === state) return;
    prevState.current = state;
    setRevealed(true);
    if (state !== 'awake') setCorrectionUntil(Date.now() + CORRECTION_MS);
  }, [state]);

  // Re-render once when the correction window lapses so the chips disappear.
  const showCorrection = state !== 'awake' && correctionUntil > now;

  // The chip label tells the truth after a nudge: "Put down 5m ago", not "just now".
  const correctionAgo = (() => {
    if (!session) return 'just now';
    const field = correctionField(state);
    const at = field ? session[field] : null;
    if (typeof at !== 'string') return 'just now';
    const mins = Math.round((now - new Date(at).getTime()) / 60_000);
    return mins < 1 ? 'just now' : `${mins}m ago`;
  })();
  useEffect(() => {
    if (correctionUntil <= Date.now()) return;
    const id = window.setTimeout(() => setCorrectionUntil(0), correctionUntil - Date.now());
    return () => window.clearTimeout(id);
  }, [correctionUntil]);

  const todayTotal = useMemo(() => {
    const today = dateKey(new Date());
    return (completed ?? [])
      .filter((s) => sessionDayKey(s) === today)
      .reduce((a, s) => a + (sleepMinutes(s) ?? 0), 0);
  }, [completed]);

  const awakeSince = useMemo(() => {
    const last = (completed ?? [])[0];
    return last?.up_at ?? last?.woke_at ?? null;
  }, [completed]);

  const counter = liveCounter(state === 'awake' ? awakeSince : anchor, now);

  const favourites = prefs?.favouriteTagIds ?? [];
  const promptTags = useMemo(() => {
    if (!tags) return [];
    const favs = tags.filter((t) => favourites.includes(t.id));
    const rest = tags.filter((t) => !favourites.includes(t.id) && !t.is_preset);
    return [...favs, ...rest].slice(0, 8);
  }, [tags, favourites]);

  if (!child || !prefs?.householdId) return null;

  // Hold the screen until we know the real state. A blank beat is far better
  // than showing "Start bedtime" over a sleep that is already in progress.
  if (sessionLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
        <div
          className="size-[246px] rounded-full"
          style={{ background: 'var(--surface)', animation: 'n-shimmer 1.6s ease-in-out infinite' }}
        />
      </div>
    );
  }

  async function onRingTap() {
    if (!child || !prefs?.householdId) return;
    if (state === 'awake') {
      await startSession(prefs.householdId, child.id, mode, prefs.userId);
      return;
    }
    if (!session) return;
    const updated = await advanceSession(session);
    // "Up for the day" completes the session and hands off to the tag prompt.
    if (updated && updated.status === 'completed') {
      setSheetSession(updated);
      setSelectedTags([]);
    }
  }

  async function nudge(minutes: number) {
    const field = correctionField(state);
    if (!session || !field) return;
    await nudgeSession(session, field, minutes);
  }

  async function finishTagging(save: boolean) {
    const target = sheetSession;
    setSheetSession(null);
    if (!target) return;

    if (save && selectedTags.length) {
      await Promise.all(
        selectedTags.map((tagId) =>
          put<SleepSessionTag>('sleep_session_tags', {
            id: newId(),
            household_id: target.household_id,
            session_id: target.id,
            tag_id: tagId,
            updated_at: new Date().toISOString(),
            deleted_at: null,
          }),
        ),
      );
    }

    setConfirmation({
      dur: duration(sleepMinutes(target)),
      tags: save ? selectedTags.length : 0,
    });
    window.setTimeout(() => setConfirmation(null), 1900);
  }

  const subline = buildSubline(state, session, awakeSince, mode);
  const settleNote =
    state === 'asleep' && session ? minutesBetween(session.put_down_at, session.fell_asleep_at) : null;

  return (
    <>
      {/* Ambient glow, cross-fading over 900ms as the state changes. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(120% 52% at 50% 112%, ${phase.glow} 0%, transparent 72%)`,
          transition: 'background 900ms var(--ease-state)',
        }}
      />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center px-5 pt-[26px] pb-[22px]">
        <div
          key={state}
          className="serif text-center leading-[1.1]"
          style={{
            fontSize: phase.wordSize,
            fontWeight: 500,
            letterSpacing: '-0.02em',
            color: phase.color,
            animation: 'n-fade-up .7s var(--ease-out) both',
            transition: 'color 700ms var(--ease-state)',
          }}
        >
          {phase.word}
        </div>
        <div className="mt-[6px] text-center text-[14.5px] text-muted transition-colors duration-400">
          {subline}
          {settleNote !== null && ` · ${settleNote}m to settle`}
        </div>

        {state === 'awake' ? (
          <div className="mt-6 flex w-full gap-[10px]">
            <StatCard label="Awake for" value={counter.main} secs={counter.secs} />
            <StatCard label="Slept today" value={duration(todayTotal)} />
          </div>
        ) : revealed ? (
          <div
            className="mt-5 flex w-full items-center justify-between rounded-[22px] bg-surface px-[18px] pt-4 pb-[17px]"
            style={{ animation: 'n-pop .4s var(--ease-out) both' }}
          >
            <div>
              <div className="text-[11.5px] font-semibold text-faint">{phase.counterLabel}</div>
              <div className="num mt-[3px] text-[34px] font-semibold leading-none tracking-[-0.04em]">
                {counter.main}
                <span className="text-[16px] font-medium tracking-[-0.01em] text-faint">
                  {counter.secs}
                </span>
              </div>
            </div>
            <button
              onClick={() => setRevealed(false)}
              className="press rounded-full border border-line px-[13px] py-2 text-[13px] font-semibold text-faint"
            >
              Hide
            </button>
          </div>
        ) : (
          <button
            onClick={() => setRevealed(true)}
            className="press mt-[22px] flex h-14 w-full items-center justify-center gap-[9px] rounded-[22px] border border-dashed border-line text-faint"
          >
            <ClockIcon size={16} />
            <span className="text-[14.5px] font-semibold">Tap to show how long</span>
          </button>
        )}

        <div className="flex min-h-0 w-full flex-1 items-center justify-center py-[14px]">
          <button
            onClick={onRingTap}
            aria-label={ringLabel(state, mode)}
            className="flex size-[246px] flex-col items-center justify-center gap-3 rounded-full active:scale-[0.955] active:brightness-[1.14]"
            style={{
              color: phase.color,
              background: `color-mix(in oklab, ${phase.color} ${phase.mix}%, transparent)`,
              boxShadow: `inset 0 0 0 1.5px color-mix(in oklab, ${phase.color} ${phase.ring}%, transparent), 0 0 80px -10px color-mix(in oklab, ${phase.color} 32%, transparent)`,
              transition:
                'background 800ms var(--ease-state), box-shadow 800ms var(--ease-state), color 700ms ease, transform .16s ease, filter .16s ease',
              animation: state === 'asleep' ? 'n-breathe 5.5s ease-in-out infinite' : undefined,
            }}
          >
            <RingIcon size={44} />
            <span
              className="serif text-center font-medium tracking-[-0.01em]"
              style={{ fontSize: state === 'incrib' ? 27 : state === 'awake' ? 28 : 29 }}
            >
              {ringLabel(state, mode)}
            </span>
          </button>
        </div>

        {showCorrection && (
          <div
            className="flex w-full items-center gap-[7px]"
            style={{ animation: 'n-chips .45s var(--ease-out) both' }}
          >
            <span className="whitespace-nowrap text-[12.5px] text-muted">
              {CORRECTION_WORD[state]} {correctionAgo}
            </span>
            <button
              onClick={() => nudge(-5)}
              className="press num flex h-[38px] items-center rounded-full bg-surface px-[14px] text-[13px] font-semibold"
            >
              −5m
            </button>
            <button
              onClick={() => nudge(-10)}
              className="press num flex h-[38px] items-center rounded-full bg-surface px-[14px] text-[13px] font-semibold"
            >
              −10m
            </button>
            <button
              onClick={() => session && navigate(`/session/${session.id}`)}
              className="press flex h-[38px] items-center rounded-full bg-surface px-[15px] text-[13px] font-semibold"
            >
              edit
            </button>
          </div>
        )}

        {state === 'awake' && (
          <div className="w-full">
            <SegmentedControl
              options={[
                { value: 'nap' as SleepKind, label: 'Nap' },
                { value: 'night' as SleepKind, label: 'Bedtime' },
              ]}
              value={mode}
              onChange={setMode}
            />
            <button
              onClick={() => navigate('/session/new')}
              className="press mt-[14px] w-full text-center text-[13.5px] font-medium text-faint"
            >
              Add a past session
            </button>
          </div>
        )}
      </div>

      {/* Tag prompt — favourites first, skippable in one tap. */}
      <Sheet open={!!sheetSession} onClose={() => finishTagging(false)}>
        <div className="flex items-baseline justify-between">
          <div className="serif text-2xl font-medium tracking-[-0.01em]">
            {sheetSession?.type === 'night' ? 'Night logged' : 'Nap logged'}
          </div>
          <div className="num text-[15px] font-semibold text-muted">
            {duration(sheetSession ? sleepMinutes(sheetSession) : null)}
          </div>
        </div>
        <div className="mt-[5px] mb-[18px] text-[14px] text-muted">
          Anything worth noting? Optional.
        </div>
        <div className="mb-[22px] flex flex-wrap gap-2">
          {promptTags.map((t) => (
            <TagPill
              key={t.id}
              tag={t}
              selected={selectedTags.includes(t.id)}
              onClick={() =>
                setSelectedTags((s) =>
                  s.includes(t.id) ? s.filter((x) => x !== t.id) : [...s, t.id],
                )
              }
            />
          ))}
        </div>
        <div className="flex gap-[10px]">
          <SecondaryButton onClick={() => finishTagging(false)}>Skip</SecondaryButton>
          <div className="flex-[1.3]">
            <PrimaryButton onClick={() => finishTagging(true)}>Done</PrimaryButton>
          </div>
        </div>
      </Sheet>

      {confirmation && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center"
          style={{
            background: 'color-mix(in oklab, var(--bg) 82%, transparent)',
            animation: 'n-veil .3s ease both',
          }}
        >
          <div
            className="flex flex-col items-center gap-[14px]"
            style={{ animation: 'n-pop .5s var(--ease-out) both' }}
          >
            <span
              className="flex size-[76px] items-center justify-center rounded-full text-ok"
              style={{
                background: 'color-mix(in oklab, var(--ok) 20%, transparent)',
                boxShadow: 'inset 0 0 0 1.5px color-mix(in oklab, var(--ok) 45%, transparent)',
              }}
            >
              <CheckIcon size={34} />
            </span>
            <div className="serif text-[26px] font-medium">Saved</div>
            <div className="num text-[13.5px] text-muted">
              {confirmation.dur}
              {confirmation.tags > 0 &&
                ` · ${confirmation.tags} tag${confirmation.tags === 1 ? '' : 's'}`}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StatCard({ label, value, secs }: { label: string; value: string; secs?: string }) {
  return (
    <div className="flex-1 rounded-[22px] bg-surface px-4 pt-[15px] pb-4">
      <div className="text-[11.5px] font-semibold text-faint">{label}</div>
      <div className="num mt-[5px] text-[22px] font-semibold tracking-[-0.03em]">
        {value}
        {secs && <span className="text-[13px] font-medium text-faint">{secs}</span>}
      </div>
    </div>
  );
}

function ringLabel(state: LogState, mode: SleepKind): string {
  if (state === 'awake') return mode === 'nap' ? 'Start nap' : 'Start bedtime';
  if (state === 'settling') return 'Fell asleep';
  if (state === 'asleep') return 'Woke up';
  return 'Up for the day';
}

function buildSubline(
  state: LogState,
  session: SleepSession | undefined,
  awakeSince: string | null,
  mode: SleepKind,
): string {
  if (state === 'awake') {
    const since = awakeSince ? `Up since ${clock(awakeSince)}` : 'No sleep logged yet';
    return `${since} · ${mode === 'nap' ? 'nap' : 'bedtime'} next`;
  }
  if (state === 'settling' && session)
    return `Put down ${clock(session.put_down_at)} · ${session.type === 'nap' ? 'nap' : 'bedtime'}`;
  if (state === 'asleep' && session) return `Since ${clock(session.fell_asleep_at)}`;
  if (state === 'incrib' && session)
    return `Woke ${clock(session.woke_at)} · ${duration(sleepMinutes(session))} of sleep`;
  return '';
}
