/**
 * Inline SVG icon set, drawn on a 24px grid at 1.5–2px stroke, matching the handoff.
 * `size` is in px; colour always comes from currentColor.
 */

interface IconProps {
  size?: number;
  className?: string;
}

export const SunIcon = ({ size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
    <circle cx="12" cy="12" r="4.8" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="9.2" opacity=".4" />
  </svg>
);

export const SettlingIcon = ({ size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
    <circle cx="12" cy="12" r="9.2" strokeDasharray="3.4 4.2" />
    <circle cx="12" cy="12" r="2.8" fill="currentColor" stroke="none" />
  </svg>
);

export const MoonIcon = ({ size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12.4 3a9 9 0 1 0 8.6 8.6A7 7 0 0 1 12.4 3z" />
  </svg>
);

export const CribIcon = ({ size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
    <rect x="3" y="7" width="18" height="12" rx="3" />
    <path d="M7.5 7v12M12 7v12M16.5 7v12" />
  </svg>
);

export const ClockIcon = ({ size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M12 7.4V12l3 1.8" />
  </svg>
);

export const ListIcon = ({ size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden>
    <rect x="3.5" y="5" width="14" height="3.4" rx="1.7" />
    <rect x="3.5" y="10.3" width="17" height="3.4" rx="1.7" />
    <rect x="3.5" y="15.6" width="9" height="3.4" rx="1.7" />
  </svg>
);

export const ChartIcon = ({ size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden>
    <path d="M4 17.5 9 11l3.6 3.4L20 6" />
    <path d="M20 6h-4.6M20 6v4.6" opacity=".55" />
  </svg>
);

export const TagIcon = ({ size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden>
    <path d="M11.2 3.6H4.6a1 1 0 0 0-1 1v6.6a2 2 0 0 0 .6 1.4l7.2 7.2a2 2 0 0 0 2.8 0l5.6-5.6a2 2 0 0 0 0-2.8L12.6 4.2a2 2 0 0 0-1.4-.6z" />
    <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);

export const PersonIcon = ({ size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden>
    <circle cx="12" cy="9" r="3.4" />
    <path d="M5 19.5c1.3-3.2 4-4.8 7-4.8s5.7 1.6 7 4.8" />
  </svg>
);

export const CheckIcon = ({ size = 24 }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M5 12.5 10 17.5 19.5 7.5" />
  </svg>
);

export const EnvelopeIcon = ({ size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden>
    <rect x="3" y="5.5" width="18" height="13" rx="3" />
    <path d="M3.8 7.2 12 13l8.2-5.8" />
  </svg>
);
