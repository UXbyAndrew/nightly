import type { ReactNode } from 'react';
import { CATEGORY_COLOR } from '@/data/presetTags';
import { CheckIcon } from './Icons';
import type { Tag, TagCategory } from '@/types';

/**
 * Small shared primitives. Each one encodes a rule from the handoff so the rule
 * doesn't have to be re-remembered at every call site.
 */

/** Bottom sheet over a 45% scrim. Tapping the scrim dismisses. */
export function Sheet({
  open,
  onClose,
  children,
  surface = 'var(--surface)',
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  surface?: string;
}) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-30">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/45"
        style={{ animation: 'n-veil .35s ease both' }}
      />
      <div
        className="absolute inset-x-0 bottom-0 px-5 pt-3 pb-[calc(30px+env(safe-area-inset-bottom))]"
        style={{
          background: surface,
          borderRadius: '28px 28px 0 0',
          boxShadow: '0 -20px 50px -20px rgba(0,0,0,.6)',
          animation: 'n-sheet .42s var(--ease-out) both',
        }}
      >
        <div className="mx-auto mb-[18px] h-1 w-10 rounded-sm bg-surface2" />
        {children}
      </div>
    </div>
  );
}

/** The inverted primary — text colour on background colour. */
export function PrimaryButton({
  children,
  onClick,
  disabled,
  className = '',
  height = 54,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  height?: number;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`press flex w-full items-center justify-center rounded-[18px] text-[15.5px] font-bold transition-colors duration-300 ${className}`}
      style={{
        height,
        background: disabled ? 'var(--surface)' : 'var(--text)',
        color: disabled ? 'var(--faint)' : 'var(--bg)',
      }}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  className = '',
  height = 54,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  height?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`press flex w-full items-center justify-center rounded-[18px] bg-surface2 text-[15.5px] font-semibold ${className}`}
      style={{ height }}
    >
      {children}
    </button>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  height = 44,
  track = 'var(--surface)',
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  height?: number;
  track?: string;
}) {
  return (
    <div className="flex gap-[5px] rounded-full p-[5px]" style={{ background: track }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className="press flex flex-1 items-center justify-center rounded-full text-[14.5px] font-semibold transition-[background,color] duration-200"
            style={{
              height,
              background: on ? 'var(--surface2)' : 'transparent',
              color: on ? 'var(--text)' : 'var(--muted)',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export const tagColor = (category: TagCategory) => CATEGORY_COLOR[category];

/** Selectable tag pill. Selected state is a tinted fill plus a 1.5px inset ring. */
export function TagPill({
  tag,
  selected,
  onClick,
  size = 'md',
}: {
  tag: Tag;
  selected?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md';
}) {
  const accent = tagColor(tag.category);
  const h = size === 'sm' ? 38 : 40;
  return (
    <button
      onClick={onClick}
      className="press flex items-center rounded-full font-semibold"
      style={{
        minHeight: h,
        padding: size === 'sm' ? '0 14px' : '0 15px',
        fontSize: size === 'sm' ? 13.5 : 14,
        background: selected ? `color-mix(in oklab, ${accent} 24%, var(--bg))` : 'var(--surface2)',
        boxShadow: selected ? `inset 0 0 0 1.5px ${accent}` : 'none',
        color: selected ? accent : 'var(--muted)',
      }}
    >
      {tag.name}
    </button>
  );
}

/** Read-only tag chip used on timeline day cards. */
export function TagChip({ tag }: { tag: Tag }) {
  const accent = tagColor(tag.category);
  return (
    <span
      className="rounded-full px-[10px] py-1 text-[11.5px] font-semibold"
      style={{ background: `color-mix(in oklab, ${accent} 22%, var(--bg))`, color: accent }}
    >
      {tag.name}
    </span>
  );
}

/** Advisory validation strip. It warns — it never blocks a save. */
export function ValidationNote({ children }: { children: ReactNode }) {
  return (
    <div
      className="mb-3 flex items-center gap-[10px] rounded-[18px] px-[14px] py-[10px]"
      style={{
        background: 'color-mix(in oklab, var(--warn) 14%, var(--bg))',
        animation: 'n-pop .3s ease both',
      }}
    >
      <span className="size-4 shrink-0 rounded-full border-[1.6px] border-warn" />
      <div className="text-[13px] leading-[1.45] text-muted">{children}</div>
    </div>
  );
}

/** Transient confirmation above the tab bar. */
export function Toast({ text }: { text: string }) {
  return (
    <div
      className="absolute inset-x-4 bottom-[100px] z-40 flex items-center gap-[11px] rounded-[20px] bg-surface2 px-4 py-[14px]"
      style={{ boxShadow: '0 18px 40px -18px rgba(0,0,0,.7)', animation: 'n-toast 2.2s ease both' }}
    >
      <span
        className="flex size-[26px] shrink-0 items-center justify-center rounded-full text-ok"
        style={{ background: 'color-mix(in oklab, var(--ok) 22%, transparent)' }}
      >
        <CheckIcon size={15} />
      </span>
      <span className="text-[14.5px] font-semibold">{text}</span>
    </div>
  );
}

export function ScreenTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="serif text-[28px] font-medium tracking-[-0.015em] text-text">{children}</h1>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="label-caps px-[2px] pb-[9px]">{children}</div>;
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-[34px] py-10 text-center">
      <div className="serif text-[26px] font-medium tracking-[-0.01em]">{title}</div>
      <div className="max-w-[260px] text-[14.5px] leading-[1.55] text-muted">{body}</div>
      {action}
    </div>
  );
}
