# Nightly

An offline-first sleep tracker for one household and its children. Built from the
Nightly design handoff: one-tap logging at 2am in a dark room, and a legible sense
of the pattern in the morning.

```bash
npm install
npm run dev
```

Open http://localhost:5173. With no backend configured the app runs entirely on
this device — no accounts, no network, fully usable.

## How it's put together

**Dexie (IndexedDB) is the only source of truth.** Every screen reads through the
hooks in `src/hooks/`, which read Dexie. Nothing renders from the network. That
single rule is what makes a 2am log with no signal take exactly the same code path
as one online — there is no offline special-casing anywhere in the UI.

Writes go through `src/lib/writes.ts`, which puts the row in Dexie and appends an
entry to a local `outbox` table in the same transaction. `src/lib/sync.ts` drains
that outbox to Supabase whenever it can, reconciles anything missed while the
device was away, and subscribes to the other caregiver's changes.

Conflicts resolve **last-write-wins on `updated_at`**, enforced by a Postgres
trigger rather than client logic — so two phones editing the same session offline
converge on the later edit no matter which one reconnects first. Deletes are soft
(`deleted_at` tombstones) so a delete can propagate, and a later edit resurrects
the row rather than being silently lost.

### The Quick Log state machine

State is derived from the open session row, not held in component state:

| Stored | State |
| --- | --- |
| `put_down_at` only | Settling |
| `+ fell_asleep_at` | Asleep |
| `+ woke_at` | Awake in crib |
| `+ up_at` | Completed |

Because it's data, it survives a reload and shows up on the other parent's phone.

## Layout

```
src/
  types.ts              entity shapes, mirroring the Postgres tables 1:1
  lib/
    db.ts               Dexie schema (+ outbox, sync_meta, prefs)
    writes.ts           all mutations: Dexie + outbox, in one transaction
    sync.ts             outbox flush, realtime, reconciliation pull
    supabase.ts         client; every call no-ops without env vars
    sessions.ts         state machine, derived durations, day grouping
    analytics.ts        trends + tag correlation (pure functions)
    time.ts             clock / duration formatting
  hooks/                the seam every screen reads through
  components/           chrome + shared primitives
  screens/              QuickLog, Timeline, SessionEditor, Trends, Tags, More, Onboarding, Join
  data/                 preset tag library, child accents
  dev/seed.ts           dev-only demo data generator
supabase/migrations/    0001_init.sql — schema, RLS, LWW trigger, redeem_invite, preset seed
scripts/make-icons.mjs  generates the PWA icon set, no dependencies
```

## Development helpers

In the browser console (dev builds only):

```js
await nightly.seed()   // ~6 weeks of plausible sleep for the active child
await nightly.clear()  // remove all sleep data, keep household and child
```

The seed deliberately includes the messy cases the charts have to survive: missed
`up_at` timestamps, two 2am wakes, a teething stretch, a travel week, and skipped
naps. Correlation should rank travel and teething as the biggest negatives.

To wipe everything and re-onboard, delete the `nightly` IndexedDB database in
DevTools → Application → Storage.

## Backend

Supabase project **nightly** (`hyxddkrmlaarzeyylqzy`, org UXbyAndrew, eu-west-1)
is provisioned, migrated and seeded. Credentials are in `.env.local`, which is
gitignored — anyone else cloning this repo copies `.env.example` and fills it in.

The app switches on magic-link sign-in, invites, and cross-device sync when those
env vars are present, and silently stays local-only when they aren't.

### One remaining manual step

Magic links redirect to `window.location.origin`, so every origin you sign in
from has to be allowlisted in **Authentication → URL Configuration**:

- Site URL: your deployed URL once it exists
- Redirect URLs: `http://localhost:5173/**` (and your deploy URL)

Without this the email link bounces with a redirect error.

## Design decisions worth knowing

- **Counters are opt-in.** While settling or in-crib the elapsed time is hidden
  behind "Tap to show how long". A parent watching a number climb at 3am is a
  design failure, so the number has to be asked for. It's revealed by default only
  once the child is asleep.
- **Validation warns, never blocks.** A session under five minutes, or a wake time
  before a sleep time, shows a warm advisory strip and still saves. Nothing stops
  a tired parent recording what actually happened.
- **Correlation states correlation.** Sample size is always visible, and any
  comparison with fewer than five days on either side is dimmed and labelled "not
  enough data yet" rather than shown as a finding.
- **Sessions belong to the day they started.** A night that runs past midnight
  stays filed under the evening, and renders as two segments on the day bar.

## Known gaps

- Fonts load from Google Fonts and are runtime-cached by the service worker. They
  survive airplane mode after first load, but a cold install needs one online
  visit. Self-host the three families if that matters.
- No background timer or live notification while a session runs — the counter is
  computed from stored timestamps, so it's correct on return, but the app has to
  be open to tick.
- Multi-timezone travel is unhandled: day boundaries use the device's local time.
- Day-level tags are written by the seed and read everywhere, but the UI for
  attaching one to a day from the timeline isn't built yet — only session tags are
  attachable in-app.
