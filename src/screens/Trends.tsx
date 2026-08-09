import { useEffect, useMemo, useState } from 'react';
import { useActiveChild, useAllSessionTags, useCompletedSessions, useDayTags, useTags } from '@/hooks';
import {
  METRICS,
  MIN_SAMPLE,
  type MetricId,
  type RangeDays,
  correlateTags,
  dailySeries,
  spread,
  summarise,
} from '@/lib/analytics';
import { duration } from '@/lib/time';
import { ScreenTitle } from '@/components/ui';
import { tagColor } from '@/components/ui';

/**
 * Two separate things, deliberately not blurred together: patterns over time,
 * and tag correlation. The correlation block never states cause and never hides n.
 */
export default function Trends() {
  const child = useActiveChild();
  const sessions = useCompletedSessions(child?.id);
  const tags = useTags();
  const sessionTags = useAllSessionTags();
  const dayTags = useDayTags(child?.id);

  const [range, setRange] = useState<RangeDays>(30);
  const [metric, setMetric] = useState<MetricId>('night');
  const [openTag, setOpenTag] = useState<string | null>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setDrawn(true), 140);
    return () => window.clearTimeout(id);
  }, []);

  const series = useMemo(() => dailySeries(sessions ?? [], metric, range), [sessions, metric, range]);
  const summary = useMemo(() => summarise(sessions ?? [], metric, range), [sessions, metric, range]);
  const spreads = useMemo(() => spread(sessions ?? [], range), [sessions, range]);
  const correlations = useMemo(
    () => correlateTags(sessions ?? [], tags ?? [], sessionTags ?? [], dayTags ?? [], range),
    [sessions, tags, sessionTags, dayTags, range],
  );

  const metricLabel = METRICS.find((m) => m.id === metric)?.label ?? '';
  const maxValue = Math.max(...series.map((d) => d.value ?? 0), 1);

  // Under a week of data, a chart would imply a pattern that isn't there yet.
  const lowData = summary.sampleDays < 7;

  return (
    <div className="scroll-y min-h-0 flex-1 px-4 pt-3 pb-4">
      <div className="mb-3">
        <ScreenTitle>Trends</ScreenTitle>
      </div>

      <div className="mb-3 flex gap-[5px] rounded-full bg-surface p-[5px]">
        {([7, 30, 90] as RangeDays[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className="press flex h-10 flex-1 items-center justify-center rounded-full text-sm font-semibold transition-[background,color] duration-200"
            style={{
              background: range === r ? 'var(--surface2)' : 'transparent',
              color: range === r ? 'var(--text)' : 'var(--muted)',
            }}
          >
            {r} days
          </button>
        ))}
      </div>

      <div
        className="mb-3 flex gap-[6px] overflow-x-auto"
        style={{
          maskImage: 'linear-gradient(90deg,#000 86%,transparent 100%)',
          WebkitMaskImage: 'linear-gradient(90deg,#000 86%,transparent 100%)',
          scrollbarWidth: 'none',
        }}
      >
        {METRICS.map((m) => (
          <button
            key={m.id}
            onClick={() => setMetric(m.id)}
            className="press flex h-9 shrink-0 items-center whitespace-nowrap rounded-full px-[14px] text-[13px] font-semibold transition-[background,color] duration-200"
            style={{
              background: metric === m.id ? 'var(--surface2)' : 'transparent',
              border: metric === m.id ? '1px solid transparent' : '1px solid var(--line)',
              color: metric === m.id ? 'var(--text)' : 'var(--muted)',
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {lowData ? (
        <div className="mb-5 flex flex-col items-center gap-[13px] rounded-[24px] bg-surface px-[26px] pt-[46px] pb-[34px] text-center">
          <div className="flex h-12 items-end gap-[6px]">
            {[18, 30, 13, 38].map((h, i) => (
              <span
                key={i}
                className="w-[11px] rounded"
                style={{
                  height: h,
                  background:
                    i === 3 ? 'color-mix(in oklab, var(--asleep) 45%, var(--surface2))' : 'var(--surface2)',
                }}
              />
            ))}
          </div>
          <div className="serif text-2xl font-medium">Still gathering nights</div>
          <div className="max-w-[250px] text-sm leading-[1.55] text-muted">
            {summary.sampleDays} {summary.sampleDays === 1 ? 'night' : 'nights'} so far. Charts need
            about a week before they say anything honest.
          </div>
        </div>
      ) : (
        <div className="mb-5 rounded-[24px] bg-surface px-4 pt-4 pb-3">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-[12.5px] font-medium text-muted">{metricLabel} · average</div>
              <div className="num mt-[3px] text-[30px] font-semibold tracking-[-0.035em]">
                {duration(summary.average)}
              </div>
            </div>
            {summary.deltaMinutes !== null && (
              <div
                className="text-[12.5px] font-semibold"
                style={{ color: summary.deltaMinutes >= 0 ? 'var(--ok)' : 'var(--warn)' }}
              >
                {summary.deltaMinutes >= 0 ? '+' : '−'}
                {duration(Math.abs(summary.deltaMinutes))} vs. earlier
              </div>
            )}
          </div>
          <div className="mt-[14px] flex h-[114px] items-end gap-[2px]">
            {series.map((d, i) => (
              <div
                key={d.date}
                className="min-w-[2px] flex-1 rounded-[3px]"
                title={`${d.date}: ${duration(d.value)}`}
                style={{
                  background: d.value === null ? 'var(--surface2)' : 'var(--asleep)',
                  opacity: d.value === null ? 0.5 : 0.92,
                  height: drawn ? `${Math.max(2, ((d.value ?? 0) / maxValue) * 112)}px` : '2px',
                  transition: `height 620ms var(--ease-out) ${Math.min(i * 22, 420)}ms`,
                }}
              />
            ))}
          </div>
        </div>
      )}

      <div className="mb-5 flex gap-[9px]">
        <SpreadCard label="Bedtime ±" value={spreads.bed} />
        <SpreadCard label="Wake ±" value={spreads.wake} />
      </div>

      <div className="serif text-[21px] font-medium tracking-[-0.01em]">What moves the needle</div>
      <div className="mt-1 mb-3 text-[13px] leading-[1.5] text-muted">
        Tap a tag to compare with and without. These are patterns, not causes.
      </div>

      <div className="flex flex-col gap-2">
        {correlations.length === 0 && (
          <div className="rounded-[20px] bg-surface px-[15px] py-[14px] text-[13.5px] leading-[1.5] text-muted">
            Nothing to compare yet. Tag a few days and this fills in on its own.
          </div>
        )}
        {correlations.map((c) => {
          const open = openTag === c.tag.id;
          const max = Math.max(c.withAvg, c.withoutAvg, 1);
          const accent = tagColor(c.tag.category);
          return (
            <button
              key={c.tag.id}
              onClick={() => setOpenTag(open ? null : c.tag.id)}
              className="press w-full rounded-[20px] bg-surface px-[15px] pt-[14px] pb-[13px] text-left"
              style={{ opacity: c.reliable ? 1 : 0.62 }}
            >
              <div className="flex items-center gap-[9px]">
                <span className="size-[9px] shrink-0 rounded-[3px]" style={{ background: accent }} />
                <span className="flex-1 text-[14.5px] font-semibold">{c.tag.name}</span>
                <span
                  className="num text-[14.5px] font-bold"
                  style={{
                    color: !c.reliable
                      ? 'var(--faint)'
                      : c.deltaMinutes < 0
                        ? 'var(--danger)'
                        : 'var(--ok)',
                  }}
                >
                  {c.deltaMinutes < 0 ? '−' : '+'}
                  {duration(Math.abs(c.deltaMinutes))}
                </span>
              </div>

              {!c.reliable && (
                <div className="mt-[10px] text-xs font-semibold text-warn">
                  Only {Math.min(c.nWith, c.nWithout)} day
                  {Math.min(c.nWith, c.nWithout) === 1 ? '' : 's'} so far — not enough data yet
                  {` (needs ${MIN_SAMPLE})`}
                </div>
              )}

              {open && (
                <div style={{ animation: 'n-fade-up .35s var(--ease-out) both' }}>
                  <CorrelationBar
                    label="with"
                    value={c.withAvg}
                    max={max}
                    color={c.deltaMinutes < 0 ? accent : 'var(--ok)'}
                    delay={60}
                  />
                  <CorrelationBar
                    label="without"
                    value={c.withoutAvg}
                    max={max}
                    color="var(--faint)"
                    delay={160}
                  />
                  <div className="mt-[10px] text-[11.5px] text-faint">
                    n = {c.nWith} days with · {c.nWithout} without
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SpreadCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex flex-1 items-baseline justify-between gap-2 rounded-[18px] bg-surface px-[13px] py-[10px]">
      <div className="text-[11.5px] font-semibold text-faint">{label}</div>
      <div className="num text-[17px] font-semibold">{value === null ? '—' : `${value}m`}</div>
    </div>
  );
}

function CorrelationBar({
  label,
  value,
  max,
  color,
  delay,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  delay: number;
}) {
  return (
    <div className="mt-[6px] flex items-center gap-[9px] first:mt-[11px]">
      <span className="w-[52px] text-[11.5px] font-semibold text-faint">{label}</span>
      <span className="h-[9px] flex-1 overflow-hidden rounded-[5px] bg-surface2">
        <span
          className="block h-full rounded-[5px]"
          style={{
            width: `${Math.round((value / max) * 100)}%`,
            background: color,
            transition: `width 700ms var(--ease-out) ${delay}ms`,
          }}
        />
      </span>
      <span className="num w-14 text-right text-[12.5px]">{duration(value)}</span>
    </div>
  );
}
