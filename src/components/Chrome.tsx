import { NavLink } from 'react-router-dom';
import { ChartIcon, ClockIcon, ListIcon, PersonIcon, TagIcon } from './Icons';
import { ACCENTS } from '@/data/accents';
import type { Child } from '@/types';

/**
 * Shared chrome: the header (child switcher + sync state) and the bottom tab bar.
 */

interface HeaderProps {
  child?: Child;
  pendingWrites: number;
  online: boolean;
  /** False when no backend is configured — the app is then local-only by design. */
  syncEnabled: boolean;
  onOpenSwitcher: () => void;
}

export function Header({
  child,
  pendingWrites,
  online,
  syncEnabled,
  onOpenSwitcher,
}: HeaderProps) {
  // "Saved locally" is a normal state, not an error — it gets --warn, never --danger.
  // With no backend at all, claiming "Synced" would be a lie, so say what's true.
  const unsynced = syncEnabled && (pendingWrites > 0 || !online);
  const label = !syncEnabled ? 'On this phone' : unsynced ? 'Saved locally' : 'Synced';
  const dot = !syncEnabled ? 'var(--faint)' : unsynced ? 'var(--warn)' : 'var(--ok)';

  return (
    <div className="shrink-0 pt-[env(safe-area-inset-top)]">
      <div className="flex items-center justify-between px-5 pt-2">
        <button
          onClick={onOpenSwitcher}
          className="press flex h-11 items-center gap-[9px] rounded-full bg-surface pl-[10px] pr-[15px]"
        >
          <span
            className="size-[11px] shrink-0 rounded-full"
            style={{ background: ACCENTS[child?.color ?? 0] }}
          />
          <span className="text-[15.5px] font-semibold">{child?.name ?? 'No child'}</span>
          <span className="text-[10px] text-faint">▾</span>
        </button>

        <div className="flex h-9 items-center gap-[7px] rounded-full bg-surface px-[13px] text-xs font-semibold text-muted">
          <span className="size-[7px] shrink-0 rounded-full" style={{ background: dot }} />
          {label}
        </div>
      </div>
    </div>
  );
}

const TABS = [
  { to: '/log', label: 'Log', Icon: ClockIcon },
  { to: '/timeline', label: 'Timeline', Icon: ListIcon },
  { to: '/trends', label: 'Trends', Icon: ChartIcon },
  { to: '/tags', label: 'Tags', Icon: TagIcon },
  { to: '/more', label: 'More', Icon: PersonIcon },
];

/** `dim` fades the bar while a child is settling or asleep — the room is dark. */
export function TabBar({ dim = false }: { dim?: boolean }) {
  return (
    <nav
      className="shrink-0 border-t border-line bg-bg px-[10px] pt-[6px] pb-[calc(24px+env(safe-area-inset-bottom))] transition-opacity duration-500"
      style={{ display: 'flex', opacity: dim ? 0.5 : 1 }}
    >
      {TABS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className="flex min-h-[52px] flex-1 flex-col items-center justify-center gap-[5px] rounded-xl text-[10.5px] font-semibold"
          style={({ isActive }) => ({ color: isActive ? 'var(--text)' : 'var(--faint)' })}
        >
          <Icon size={21} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
