import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveChild, useAllSessionTags, useCompletedSessions, useDayTags, useTags } from '@/hooks';
import { daySegments, groupByDay, sessionDayKey, settleMinutes, sleepMinutes } from '@/lib/sessions';
import { clock, dayLabel, duration, durationTight } from '@/lib/time';
import { MoonIcon, SunIcon } from '@/components/Icons';
import { EmptyState, PrimaryButton, ScreenTitle, TagChip } from '@/components/ui';
import type { SleepSession, Tag } from '@/types';

/**
 * Reverse-chronological day cards. Each carries a 24h bar so the shape of a day
 * is readable before any of the numbers are.
 */
export default function Timeline() {
  const navigate = useNavigate();
  const child = useActiveChild();
  const sessions = useCompletedSessions(child?.id);
  const tags = useTags();
  const dayTags = useDayTags(child?.id);
  const sessionTags = useAllSessionTags();

  // Bars draw in from zero width on first paint.
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setDrawn(true), 120);
    return () => window.clearTimeout(id);
  }, []);

  const days = useMemo(() => groupByDay(sessions ?? []), [sessions]);
  const tagById = useMemo(() => new Map((tags ?? []).map((t) => [t.id, t])), [tags]);

  const sessionTagsBySession = useMemo(() => {
    const map = new Map<string, Tag[]>();
    for (const st of sessionTags ?? []) {
      const tag = tagById.get(st.tag_id);
      if (!tag) continue;
      map.set(st.session_id, [...(map.get(st.session_id) ?? []), tag]);
    }
    return map;
  }, [sessionTags, tagById]);

  const dayTagsByDate = useMemo(() => {
    const map = new Map<string, Tag[]>();
    for (const dt of dayTags ?? []) {
      const tag = tagById.get(dt.tag_id);
      if (!tag) continue;
      map.set(dt.date, [...(map.get(dt.date) ?? []), tag]);
    }
    return map;
  }, [dayTags, tagById]);

  if (sessions && sessions.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="px-4 pt-3">
          <ScreenTitle>Timeline</ScreenTitle>
        </div>
        <EmptyState
          title="Nothing here yet"
          body="The first sleep you log fills in the bar above. After a few days the shape of your days starts showing up on its own."
          action={
            <div className="mt-[10px] w-[180px]">
              <PrimaryButton height={52} onClick={() => navigate('/log')}>
                Log a sleep
              </PrimaryButton>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="scroll-y min-h-0 flex-1 px-[14px] pt-3">
      <div className="flex flex-col gap-3 pb-4">
        {days.map((day) => {
          const segments = daySegments(day.sessions);
          const chips = dayTagsByDate.get(day.date) ?? [];
          return (
            <div key={day.date} className="shrink-0 overflow-hidden rounded-[24px] bg-surface">
              <div className="px-4 pt-[14px] pb-[13px]">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="serif text-[21px] font-medium tracking-[-0.01em]">
                    {dayLabel(day.date)}
                  </div>
                  <div className="num text-[12.5px] text-muted">
                    {durationTight(day.totalSleepMin)} · {day.napCount}{' '}
                    {day.napCount === 1 ? 'nap' : 'naps'} · {durationTight(day.nightSleepMin)} night
                  </div>
                </div>

                <div className="relative mt-[11px] h-[17px] overflow-hidden rounded-md bg-surface2">
                  {segments.map((seg, i) => (
                    <div
                      key={i}
                      className="absolute inset-y-0 rounded-[5px]"
                      style={{
                        left: `${seg.fromPct}%`,
                        width: drawn ? `${seg.widthPct}%` : '0%',
                        background: seg.kind === 'nap' ? 'var(--awake)' : 'var(--asleep)',
                        transition: `width 900ms var(--ease-out) ${i * 110}ms`,
                      }}
                    />
                  ))}
                  {/* 6-hour gridlines. */}
                  <div className="absolute inset-0 flex">
                    <span className="flex-1 border-r border-line" />
                    <span className="flex-1 border-r border-line" />
                    <span className="flex-1 border-r border-line" />
                    <span className="flex-1" />
                  </div>
                </div>
                <div className="num mt-[5px] flex justify-between text-[11px] text-faint">
                  <span>12a</span>
                  <span>6a</span>
                  <span>12p</span>
                  <span>6p</span>
                  <span>12a</span>
                </div>

                {chips.length > 0 && (
                  <div className="mt-[10px] flex flex-wrap gap-[6px]">
                    {chips.map((t) => (
                      <TagChip key={t.id} tag={t} />
                    ))}
                  </div>
                )}
              </div>

              {day.sessions.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  tags={sessionTagsBySession.get(s.id) ?? []}
                  onOpen={() => navigate(`/session/${s.id}`)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SessionRow({
  session,
  tags,
  onOpen,
}: {
  session: SleepSession;
  tags: Tag[];
  onOpen: () => void;
}) {
  const isNap = session.type === 'nap';
  const color = isNap ? 'var(--awake)' : 'var(--asleep)';
  const settle = settleMinutes(session);

  return (
    <button
      onClick={onOpen}
      className="press flex w-full items-center gap-3 border-t border-line px-4 py-[13px] text-left active:bg-surface2"
    >
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-xl"
        style={{ background: `color-mix(in oklab, ${color} 22%, var(--bg))`, color }}
      >
        {isNap ? <SunIcon size={15} /> : <MoonIcon size={15} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="num block text-[14.5px] font-semibold tracking-[-0.02em]">
          {clock(session.fell_asleep_at)} – {clock(session.woke_at)}
        </span>
        <span className="mt-[3px] block truncate text-[12.5px] text-faint">
          {settle !== null && settle > 0 ? `${settle}m to fall asleep` : 'settled straight away'}
          {tags.length > 0 && ` · ${tags.map((t) => t.name).join(', ')}`}
        </span>
      </span>
      <span className="num text-[15.5px] font-semibold tracking-[-0.02em]">
        {duration(sleepMinutes(session))}
      </span>
    </button>
  );
}

export { sessionDayKey };
