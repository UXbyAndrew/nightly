import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, setPrefs } from '@/lib/db';
import { useSession } from '@/hooks';
import { newId, put } from '@/lib/writes';
import { nowIso } from '@/lib/time';
import { ACCENTS } from '@/data/accents';
import { DEFAULT_FAVOURITE_TAG_IDS, PRESET_TAGS } from '@/data/presetTags';
import { CheckIcon, EnvelopeIcon, MoonIcon } from '@/components/Icons';
import {
  findExistingHousehold,
  isSupabaseConfigured,
  sendMagicLink,
  signInWithPassword,
} from '@/lib/supabase';
import { pullChanges } from '@/lib/sync';
import type { Child, Household, HouseholdMember } from '@/types';

type Step = 'email' | 'sent' | 'household' | 'child' | 'done';

/**
 * Sign in → name the household → add the first child.
 *
 * When Supabase isn't configured the email step is skipped entirely, so the app
 * is fully usable on-device before any backend exists.
 */
export default function Onboarding() {
  const navigate = useNavigate();
  const { loading: authLoading, session } = useSession();
  // Null until auth resolves — rendering a step before then is what made a
  // magic-link return land back on the email screen.
  const [step, setStep] = useState<Step | null>(null);
  const [email, setEmail] = useState('');
  const [house, setHouse] = useState('');
  const [childName, setChildName] = useState('');
  const [birth, setBirth] = useState('');
  const [color, setColor] = useState(0);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The link is still the default; the password path exists because the built-in
  // mailer only allows two emails an hour.
  const [authMode, setAuthMode] = useState<'link' | 'password'>('link');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const canSubmit = authMode === 'link' ? !!email : !!email && !!password;

  // Choose the entry point once, as soon as the session is known.
  useEffect(() => {
    if (authLoading) return;

    if (step === null) {
      if (!isSupabaseConfigured()) {
        setStep('household');
        return;
      }
      if (!session) {
        setStep('email');
        return;
      }
      void (async () => {
        await setPrefs({ userId: session.user.id });
        // Already a member somewhere? Adopt that household instead of building
        // a second one — this is the reinstall / second-device path.
        const existing = await findExistingHousehold(session.user.id);
        if (existing) {
          await setPrefs({ householdId: existing });
          await pullChanges(existing);
          navigate('/log');
          return;
        }
        setStep('household');
      })();
      return;
    }

    // Signed in while sitting on the email screen (same tab): move on.
    if (session && (step === 'email' || step === 'sent')) setStep('household');
  }, [authLoading, session, step, navigate]);

  async function submit() {
    if (!canSubmit || busy) return;
    setError(null);
    setBusy(true);
    try {
      if (authMode === 'password') {
        const result = await signInWithPassword(email, password);
        // On success the session listener takes over and moves the step along.
        if (!result.ok) setError(result.error);
        return;
      }
      const result = await sendMagicLink(email);
      if (result.ok) setStep('sent');
      else if (result.error.toLowerCase().includes('rate limit'))
        setError("That's two emails this hour, which is the limit. Use a password instead.");
      else setError(result.error);
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!childName.trim()) return;

    const householdId = newId();
    const now = nowIso();

    await put<Household>('households', {
      id: householdId,
      name: house.trim() || 'Our household',
      created_at: now,
      updated_at: now,
    } as Household & { id: string; updated_at: string });

    // Straight from the session — reading it back from prefs races the auth
    // listener that writes it.
    const userId = session?.user.id ?? null;

    await put<HouseholdMember>('household_members', {
      id: newId(),
      household_id: householdId,
      user_id: userId ?? 'local',
      role: 'owner',
      display_name: null,
      email: session?.user.email ?? email ?? null,
      joined_at: now,
      updated_at: now,
      deleted_at: null,
    });

    await put<Child>('children', {
      id: newId(),
      household_id: householdId,
      name: childName.trim(),
      birth_date: birth || null,
      color,
      created_by: userId,
      archived: false,
      updated_at: now,
      deleted_at: null,
    });

    // Seed the preset library locally so there is something to tag with immediately.
    await db.tags.bulkPut(PRESET_TAGS);

    const kid = await db.children.where('household_id').equals(householdId).first();
    await setPrefs({
      householdId,
      activeChildId: kid?.id ?? null,
      favouriteTagIds: DEFAULT_FAVOURITE_TAG_IDS,
    });

    setStep('done');
    window.setTimeout(() => navigate('/log'), 2200);
  }

  const glow = step === 'email' || step === 'sent';

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-600"
        style={{
          background:
            'radial-gradient(110% 45% at 50% 105%, oklch(0.72 0.075 285 / .18) 0%, transparent 72%)',
          opacity: glow ? 1 : 0,
        }}
      />

      {step === 'email' && (
        <div
          className="relative flex min-h-0 flex-1 flex-col px-6 pt-10 pb-7"
          style={{ animation: 'n-fade-up .45s var(--ease-out) both' }}
        >
          <div className="flex flex-1 flex-col justify-center">
            <div className="mb-6 text-asleep">
              <MoonIcon size={42} />
            </div>
            <div className="serif text-[42px] font-medium leading-[1.08] tracking-[-0.025em]">
              Sleep,
              <br />
              written down.
            </div>
            <p className="mb-[30px] mt-[14px] text-base leading-[1.5] text-muted">
              One tap at 2am. Sense of it in the morning.
            </p>
            <div className="mb-2 text-[12.5px] font-semibold text-muted">Email</div>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-14 w-full rounded-[18px] border bg-surface px-4 text-[16.5px] outline-none transition-colors placeholder:text-faint"
              style={{
                borderColor: email
                  ? 'color-mix(in oklab, var(--asleep) 50%, var(--line))'
                  : 'var(--line)',
              }}
            />
            {authMode === 'password' && (
              <>
                <div className="mb-2 mt-[18px] text-[12.5px] font-semibold text-muted">
                  Password
                </div>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void submit();
                  }}
                  placeholder="••••••••"
                  className="h-14 w-full rounded-[18px] border bg-surface px-4 text-[16.5px] outline-none transition-colors placeholder:text-faint"
                  style={{
                    borderColor: password
                      ? 'color-mix(in oklab, var(--asleep) 50%, var(--line))'
                      : 'var(--line)',
                  }}
                />
              </>
            )}
            <p className="mx-[2px] mt-[11px] text-[12.5px] leading-[1.5] text-faint">
              {authMode === 'link'
                ? "We'll email a link. Nothing to remember."
                : 'Signing in with the password on your account.'}
            </p>
            {error && <p className="mx-[2px] mt-2 text-[12.5px] text-danger">{error}</p>}
          </div>
          <button
            onClick={() => void submit()}
            disabled={!canSubmit || busy}
            className="press flex h-[58px] shrink-0 items-center justify-center rounded-[19px] text-[16.5px] font-bold transition-colors duration-300"
            style={{
              background: canSubmit ? 'var(--text)' : 'var(--surface)',
              color: canSubmit ? 'var(--bg)' : 'var(--faint)',
            }}
          >
            {busy ? 'One moment…' : authMode === 'link' ? 'Send me a link' : 'Sign in'}
          </button>
          <button
            onClick={() => {
              setAuthMode(authMode === 'link' ? 'password' : 'link');
              setError(null);
            }}
            className="press mt-3 flex h-11 shrink-0 items-center justify-center text-[13.5px] font-semibold text-faint"
          >
            {authMode === 'link' ? 'Use a password instead' : 'Email me a link instead'}
          </button>
        </div>
      )}

      {step === 'sent' && (
        <div
          className="flex min-h-0 flex-1 flex-col px-6 pt-10 pb-7 text-center"
          style={{ animation: 'n-fade-up .45s var(--ease-out) both' }}
        >
          <div className="flex flex-1 flex-col items-center justify-center">
            <div
              className="mb-6 flex size-[70px] items-center justify-center rounded-full text-asleep"
              style={{
                background: 'color-mix(in oklab, var(--asleep) 22%, var(--bg))',
                animation: 'n-pop .5s var(--ease-out) both',
              }}
            >
              <EnvelopeIcon size={28} />
            </div>
            <div className="serif text-[28px] font-medium tracking-[-0.015em]">Check your email</div>
            <p className="mt-3 max-w-[275px] text-[15px] leading-[1.55] text-muted">
              We sent a sign-in link to{' '}
              <strong className="font-semibold text-text">{email}</strong>. It's good for 15 minutes.
            </p>
            <div className="mt-[22px] flex items-center gap-[7px] text-[13.5px] font-semibold text-faint">
              {[0, 0.2, 0.4].map((d) => (
                <span
                  key={d}
                  className="size-[5px] rounded-full bg-asleep"
                  style={{ animation: `n-dot 1.2s ease-in-out ${d}s infinite` }}
                />
              ))}
              <span className="ml-[5px]">Waiting for the link</span>
            </div>
            <button
              onClick={() => {
                setResent(true);
                sendMagicLink(email);
                window.setTimeout(() => setResent(false), 2400);
              }}
              className="press mt-[18px] flex min-h-11 items-center text-[14.5px] font-semibold text-muted"
            >
              {resent ? 'Link sent again' : 'Resend link'}
            </button>
          </div>
          <button
            onClick={() => setStep('email')}
            className="press flex h-[58px] shrink-0 items-center justify-center rounded-[19px] bg-surface text-[15.5px] font-semibold"
          >
            Use a different email
          </button>
        </div>
      )}

      {step === 'household' && (
        <div
          className="flex min-h-0 flex-1 flex-col px-6 pt-10 pb-7"
          style={{ animation: 'n-fade-up .45s var(--ease-out) both' }}
        >
          <div className="flex-1">
            <div className="label-caps mb-[14px]">Step 1 of 2</div>
            <div className="serif text-[32px] font-medium leading-[1.12] tracking-[-0.02em]">
              Name your household
            </div>
            <p className="mb-[26px] mt-[10px] text-[15px] leading-[1.5] text-muted">
              Everyone you invite logs into this one.
            </p>
            <input
              value={house}
              onChange={(e) => setHouse(e.target.value)}
              placeholder="Bramble Cottage"
              className="h-14 w-full rounded-[18px] border bg-surface px-4 text-[16.5px] outline-none placeholder:text-faint"
              style={{
                borderColor: house
                  ? 'color-mix(in oklab, var(--asleep) 50%, var(--line))'
                  : 'var(--line)',
              }}
            />
          </div>
          <button
            onClick={() => house.trim() && setStep('child')}
            disabled={!house.trim()}
            className="press flex h-[58px] shrink-0 items-center justify-center rounded-[19px] text-[16.5px] font-bold transition-colors duration-300"
            style={{
              background: house.trim() ? 'var(--text)' : 'var(--surface)',
              color: house.trim() ? 'var(--bg)' : 'var(--faint)',
            }}
          >
            Continue
          </button>
        </div>
      )}

      {step === 'child' && (
        <div
          className="flex min-h-0 flex-1 flex-col px-6 pt-10 pb-7"
          style={{ animation: 'n-fade-up .45s var(--ease-out) both' }}
        >
          <div className="scroll-y flex-1">
            <div className="label-caps mb-[14px]">Step 2 of 2</div>
            <div className="serif mb-[26px] text-[32px] font-medium leading-[1.12] tracking-[-0.02em]">
              Add your first child
            </div>

            <div className="mb-2 text-[12.5px] font-semibold text-muted">Name</div>
            <input
              value={childName}
              onChange={(e) => setChildName(e.target.value)}
              placeholder="Their name"
              className="h-14 w-full rounded-[18px] border bg-surface px-4 text-[16.5px] outline-none placeholder:text-faint"
              style={{
                borderColor: childName
                  ? 'color-mix(in oklab, var(--asleep) 50%, var(--line))'
                  : 'var(--line)',
              }}
            />

            <div className="mb-2 mt-[18px] text-[12.5px] font-semibold text-muted">Birth date</div>
            <input
              type="date"
              value={birth}
              onChange={(e) => setBirth(e.target.value)}
              className="num h-14 w-full rounded-[18px] border border-line bg-surface px-4 text-[16.5px] outline-none"
            />

            <div className="mb-3 mt-[22px] text-[12.5px] font-semibold text-muted">Their colour</div>
            <div className="flex flex-wrap gap-3">
              {ACCENTS.map((c, i) => (
                <button
                  key={c}
                  onClick={() => setColor(i)}
                  aria-label={`Colour ${i + 1}`}
                  className="press size-12 rounded-full"
                  style={{
                    background: c,
                    boxShadow: color === i ? `0 0 0 3px var(--bg), 0 0 0 5px ${c}` : 'none',
                    transition: 'box-shadow .3s var(--ease-out), transform .14s ease',
                  }}
                />
              ))}
            </div>
          </div>
          <button
            onClick={finish}
            disabled={!childName.trim()}
            className="press mt-4 flex h-[58px] shrink-0 items-center justify-center rounded-[19px] text-[16.5px] font-bold transition-colors duration-300"
            style={{
              background: childName.trim() ? 'var(--text)' : 'var(--surface)',
              color: childName.trim() ? 'var(--bg)' : 'var(--faint)',
            }}
          >
            Start logging
          </button>
        </div>
      )}

      {step === 'done' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-10 text-center">
          <span
            className="flex size-[84px] items-center justify-center rounded-full"
            style={{
              color: ACCENTS[color],
              background: `color-mix(in oklab, ${ACCENTS[color]} 20%, transparent)`,
              boxShadow: `inset 0 0 0 1.5px color-mix(in oklab, ${ACCENTS[color]} 45%, transparent)`,
              animation: 'n-pop .55s var(--ease-out) both',
            }}
          >
            <CheckIcon size={34} />
          </span>
          <div
            className="serif text-[30px] font-medium tracking-[-0.015em]"
            style={{ animation: 'n-fade-up .5s var(--ease-out) .1s both' }}
          >
            {house || 'Your household'} is ready
          </div>
          <div
            className="max-w-[250px] text-[15px] leading-[1.55] text-muted"
            style={{ animation: 'n-fade-up .5s var(--ease-out) .18s both' }}
          >
            Next time {childName} goes down, one tap logs it.
          </div>
        </div>
      )}
    </div>
  );
}
