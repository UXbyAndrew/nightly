import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { setPrefs } from '@/lib/db';
import { isSupabaseConfigured, redeemInvite } from '@/lib/supabase';
import { pullChanges } from '@/lib/sync';

/** What an invited caregiver sees when they open the link. */
export default function Join() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    if (!code) return;
    setBusy(true);
    setError(null);

    const result = await redeemInvite(code);
    if (!result.ok || !result.householdId) {
      setError(result.error ?? 'That invite could not be redeemed.');
      setBusy(false);
      return;
    }

    await setPrefs({ householdId: result.householdId });
    // Populate this device before showing an empty app.
    await pullChanges(result.householdId);
    navigate('/log');
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col px-6 pt-10 pb-7">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <span
          className="serif mb-[22px] flex size-[60px] items-center justify-center rounded-full text-2xl font-medium text-incrib"
          style={{ background: 'color-mix(in oklab, var(--incrib) 22%, var(--bg))' }}
        >
          {code?.charAt(0) ?? '?'}
        </span>
        <div className="serif text-[28px] font-medium tracking-[-0.015em]">Join a household</div>
        <p className="mx-auto mt-3 mb-6 max-w-[285px] text-[15px] leading-[1.55] text-muted">
          You've been invited to help log sleep. Accepting adds you as a caregiver.
        </p>
        <div className="num rounded-2xl bg-surface px-6 py-[15px] text-[22px] font-semibold tracking-[0.08em]">
          {code}
        </div>
        {!isSupabaseConfigured() && (
          <p className="mt-4 max-w-[285px] text-[12.5px] leading-[1.5] text-warn">
            This device isn't connected to a backend yet, so invites can't be redeemed.
          </p>
        )}
        {error && <p className="mt-4 max-w-[285px] text-[12.5px] text-danger">{error}</p>}
      </div>

      <div className="flex shrink-0 flex-col gap-[9px]">
        <button
          onClick={accept}
          disabled={busy || !isSupabaseConfigured()}
          className="press flex h-[58px] items-center justify-center rounded-[19px] text-[16.5px] font-bold disabled:opacity-50"
          style={{ background: 'var(--text)', color: 'var(--bg)' }}
        >
          {busy ? 'Joining…' : 'Accept invite'}
        </button>
        <button
          onClick={() => navigate('/log')}
          className="press flex h-12 items-center justify-center text-[14.5px] font-semibold text-muted"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
