# Design Brief — Toddler Sleep Tracker (frontend build prompt)

> Paste the contents below into Claude Design. Bring the output back to Claude Code to wire up Supabase + Dexie offline sync.

---

## The product

Build the complete frontend for **a toddler sleep tracking PWA** — a mobile-first, installable web app used by two parents (later: nanny/grandparents) to log a toddler's naps and overnight sleep, tag things that might be affecting sleep, and spot trends over time.

This is a **frontend-only build**: all screens, all states, and a lightweight design system, running on mock data. A separate pass will wire up the real backend (Supabase) and offline storage (Dexie/IndexedDB), so the code needs clean seams for that — see "Handoff constraints" at the bottom. Do not build any backend, auth SDK integration, or network calls.

## Who uses it, and when

Two exhausted parents, on phones, one-handed. The single most important interaction happens **at 2am in a dark room, half-asleep, holding a toddler**. Design for that first and everything else second:

- Primary action must be reachable in the thumb zone, and be a big, unmissable target
- Dark mode is not a nice-to-have — it's the default context of use. Support both, but make dark genuinely comfortable at low screen brightness (no pure-white surfaces, no harsh contrast)
- Logging a sleep event should be **one tap**. Corrections come after, never before
- Nothing that requires reading carefully or making a decision in the moment

## Core concept: the sleep session

The app's central object is a **sleep session** — one nap or one overnight sleep. It has four timestamps, because put-down time and actual sleep are very different things to a parent:

1. `put_down_at` — when they were put down / the attempt started
2. `fell_asleep_at` — when they actually fell asleep
3. `woke_at` — when they woke up
4. `up_at` — when they were actually up and out of the crib

Any of 2–4 can be empty (session still in progress, or the parent didn't catch it). Derived values the UI shows: **time to fall asleep** (1→2), **sleep duration** (2→3), **total time in crib** (1→4), and **wake window** (previous session's `up_at` → this session's `put_down_at`).

## Screens to design and build

### 1. Onboarding
- Email entry → "check your email" magic-link confirmation state (no password anywhere)
- Name your household
- Add your first child: name, birth date, an accent color used as their identity throughout the app
- Ends by dropping the user into Quick Log

### 2. Quick Log — the hero screen
A per-child state machine with **one large primary button** whose label and appearance reflect the current state:

```
AWAKE → [Start nap / Start bedtime] → SETTLING → [Fell asleep] → ASLEEP → [Woke up] → AWAKE IN CRIB → [Up for the day / Out of crib] → AWAKE
```

Requirements:
- Each of the four states needs a distinct, immediately-readable visual treatment (color, iconography, ambient background). A parent should know the state from across the room without reading.
- Every tap timestamps `now()`. Immediately after a tap, show a transient inline correction affordance — "Just now · −5m · −10m · edit" — so a mistimed tap is fixable without leaving the screen or opening a form.
- Show a live-running counter in `SETTLING` and `ASLEEP` states (e.g. "asleep for 1h 12m").
- Nap vs. bedtime is auto-suggested by time of day, with a visible manual toggle.
- Show today's context compactly above or below the button: sessions so far, current wake window.
- On completing a session, offer an optional tag prompt (recent/favourite tags first, skippable in one tap).

### 3. Timeline / log
- Reverse-chronological, grouped by day, with a sticky day header showing that day's totals (total sleep, # naps, night length)
- Each row: type icon, time range, duration, tag chips
- Tap any row to edit
- Include a horizontal 24h "day bar" visualization per day — sleep blocks laid out against a time axis so patterns are visible at a glance
- Empty state for a brand new user

### 4. Add / edit session (manual entry)
- Child selector, nap/night toggle, four time pickers (put down, fell asleep, woke, up), tag multi-select, free-text notes, delete
- Time pickers must be fast on mobile and handle "yesterday" gracefully (a bedtime session spans midnight)
- Validation: times must be in order; show this gently, not as a blocking error wall

### 5. Tags
- Preset library grouped by category: **health, schedule, environment, food, activity**
- Users can favourite presets (favourites surface first in the quick tag prompt) and create custom tags with a name, category and color
- Tags apply to a **session** or to a **whole day** (e.g. "travel day", "teething") — the UI needs to make that distinction clear without being fussy

Starter preset library to include:
- **Health**: teething, sick, fever, congestion, vaccination, growth spurt
- **Schedule**: skipped nap, short nap, early wake, late bedtime, daycare day, time change/DST, schedule change
- **Environment**: travel / new place, room too hot, room too cold, noise, new sleep space
- **Food**: big meal, late meal, new food, more milk, less milk
- **Activity**: screen time, high activity day, low activity day, overtired, car nap, stroller nap, extra outdoor time, missed wind-down

### 6. Trends
Two distinct things, don't blur them:
- **Patterns over time** — charts for nap length, night length, time to fall asleep, wake windows, and bedtime/wake-time consistency. Toggleable 7 / 30 / 90 day windows.
- **Tag correlation** — for each tag, average sleep on days with vs. without it, shown as a comparison with the **sample size (n) always visible**. Small-n results must be visually de-emphasized or explicitly flagged as "not enough data yet" — never present three data points as an insight.
- Needs a strong empty/low-data state, since a new user has nothing to show for the first week or two.

### 7. Settings & household
- Household members list with roles (owner / member)
- "Invite a caregiver" → generates a shareable code + link, with share/copy affordance, and shows pending/expiring invites
- Join-by-invite screen (what a second parent sees when they open an invite link)
- Manage children (add, edit, archive)
- Theme preference, sign out

### 8. Cross-cutting
- **Child switcher** in the header — designed to scale to multiple children, but must not feel like overhead when there's only one
- **Offline indicator** — a calm, non-alarming persistent affordance showing "saved locally, will sync" vs "synced". This must never look like an error; offline is a normal, expected state in this app
- Loading, empty, and error states for every screen
- iOS "add to home screen" install prompt banner (iOS gives no native install prompt, so this has to be a custom, dismissible instructional element)

## Design system

Build a small, disciplined system — not a component library, just enough to keep everything coherent:

- **Color tokens** as CSS custom properties with full light + dark values. Include semantic tokens for the four sleep states, plus per-child accent colors that can be swapped without touching component code.
- **Type scale** — mobile-first, generous minimum sizes. Timestamps and durations are the most-read content in the app; give them a deliberate treatment (consider tabular numerals).
- **Spacing scale, radii, elevation** — small and consistent.
- **Component inventory**: button (primary/secondary/ghost/destructive), icon button, big state button, card, list row, tag chip (selectable + display), time picker, segmented control, bottom sheet / modal, toast, empty state, stat tile, chart shell, header with child switcher, bottom tab bar.
- **Motion**: state transitions on the Quick Log screen should feel physical and reassuring, but everything must be fast and respect `prefers-reduced-motion`.
- Accessibility: WCAG AA contrast in both themes, 44px minimum touch targets, real focus states, semantic HTML, screen-reader labels on icon-only controls.

## Tech + handoff constraints (important)

Build this as a real project, not a single-file mockup:

- **React 18 + TypeScript + Vite + Tailwind CSS**
- `react-router-dom` for navigation between the screens above
- Charts with **Recharts**
- Design tokens defined as CSS variables and surfaced through the Tailwind config — no hardcoded hex values in components

To make the backend wiring pass clean:

- Put **all TypeScript types in `src/types.ts`**, using exactly these entity and field names: `Household`, `HouseholdMember`, `HouseholdInvite`, `Child`, `SleepSession` (`id`, `household_id`, `child_id`, `type: 'nap' | 'night'`, `put_down_at`, `fell_asleep_at`, `woke_at`, `up_at`, `status: 'in_progress' | 'completed'`, `notes`, `created_by`, `updated_at`, `deleted_at`), `Tag` (`id`, `household_id`, `name`, `category`, `color`, `is_preset`), `SleepSessionTag`, `DayTag`. All timestamps are ISO strings. All ids are UUID strings.
- Put **all mock data in `src/mock/data.ts`** — around 6 weeks of realistic sessions for one toddler, including messy real-world data: missed timestamps, a 2am wake, a travel week with bad sleep, a teething stretch, a couple of skipped naps. Trends and correlation views should look genuinely interesting against this data.
- **All data access goes through hooks in `src/hooks/`** (e.g. `useSessions`, `useChildren`, `useTags`, `useHousehold`) that currently read from the mock file. Components must never import mock data directly. These hooks are the seam the real Dexie/Supabase layer will replace.
- **No network calls, no auth library, no data-fetching library.** Auth screens should be visual only, driven by local state.
- Derived calculations (durations, wake windows, daily totals, tag correlations) go in **`src/lib/analytics.ts`** as pure functions taking sessions and returning results — testable and reusable by the real build.
- Include a `README.md` noting anything you'd flag for the implementation pass.

## What matters most

If you have to trade something off: **the 2am one-tap logging experience beats everything else in this app.** Trends are what makes it interesting; frictionless logging in the dark is what makes it survive past week one.
