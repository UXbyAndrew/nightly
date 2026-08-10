/**
 * Time formatting. Every value produced here is rendered in mono with tabular
 * figures — see the .num class. Durations are minutes unless stated.
 */

const MS_MIN = 60_000;

export function nowIso(): string {
  return new Date().toISOString();
}

export function minutesBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / MS_MIN);
}

/** "7:38 pm" — the app's only clock format. */
export function clock(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const h24 = d.getHours();
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${h24 < 12 ? 'am' : 'pm'}`;
}

/** "11h 06m" / "48m" — used for any elapsed or total duration. */
export function duration(mins: number | null): string {
  if (mins === null || Number.isNaN(mins)) return '—';
  const t = Math.max(0, Math.round(mins));
  const h = Math.floor(t / 60);
  const m = t % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

/** "12h47" — the tighter form used in day-card summaries. */
export function durationTight(mins: number): string {
  const t = Math.max(0, Math.round(mins));
  return `${Math.floor(t / 60)}h${String(t % 60).padStart(2, '0')}`;
}

/** Splits a live counter so the seconds can be rendered smaller and fainter. */
export function liveCounter(fromIso: string | null, now: number): { main: string; secs: string } {
  if (!fromIso) return { main: '—', secs: '' };
  const elapsedMs = Math.max(0, now - new Date(fromIso).getTime());
  const totalSecs = Math.floor(elapsedMs / 1000);
  return {
    main: duration(Math.floor(totalSecs / 60)),
    secs: ` ${String(totalSecs % 60).padStart(2, '0')}s`,
  };
}

/** Local calendar date key, YYYY-MM-DD. Deliberately local, not UTC — a night
 *  logged at 1am belongs to the day the parent thinks it does. */
export function dateKey(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

export function dayLabel(key: string): string {
  const today = dateKey(new Date());
  const yesterday = dateKey(new Date(Date.now() - 86_400_000));
  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

/** Relative day label used beside a time in the edit sheet. */
export function relativeDayLabel(iso: string | null): string {
  if (!iso) return 'Not recorded';
  return dayLabel(dateKey(iso));
}

/** Minutes since local midnight — the x-axis unit for the 24h day bar. */
export function minutesIntoDay(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

/** ISO → the value a <input type="datetime-local"> expects, in local time. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** The reverse. Returns null for a cleared or half-typed value. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function shiftIso(iso: string, deltaMinutes: number): string {
  return new Date(new Date(iso).getTime() + deltaMinutes * MS_MIN).toISOString();
}

export function ageLabel(birthDate: string | null): string {
  if (!birthDate) return '';
  const b = new Date(birthDate);
  const now = new Date();
  let months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth());
  if (now.getDate() < b.getDate()) months -= 1;
  if (months < 1) return 'newborn';
  if (months < 24) return `${months} month${months === 1 ? '' : 's'}`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'}`;
}
