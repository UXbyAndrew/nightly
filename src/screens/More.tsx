import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChildren, useHousehold, useInvites, useMembers, usePrefs } from '@/hooks';
import { clearLocalData, setPrefs } from '@/lib/db';
import { newId, put, softDelete } from '@/lib/writes';
import { ageLabel, nowIso } from '@/lib/time';
import { accentOf, ACCENTS } from '@/data/accents';
import { PrimaryButton, ScreenTitle, SecondaryButton, SectionLabel, Sheet } from '@/components/ui';
import { signOut } from '@/lib/supabase';
import type { Child, HouseholdInvite } from '@/types';

/** Household, members, invites, children, appearance. */
export default function More() {
  const navigate = useNavigate();
  const household = useHousehold();
  const members = useMembers();
  const children = useChildren();
  const prefs = usePrefs();
  const [addingChild, setAddingChild] = useState(false);

  const theme = prefs?.theme ?? 'dark';

  return (
    <div className="scroll-y min-h-0 flex-1 px-4 pt-3 pb-6">
      <ScreenTitle>{household?.name ?? 'Household'}</ScreenTitle>
      <div className="mt-[3px] mb-[18px] text-[13.5px] text-muted">
        Household · {members?.length ?? 1} {members?.length === 1 ? 'person' : 'people'} ·{' '}
        {children?.length ?? 0} {children?.length === 1 ? 'child' : 'children'}
      </div>

      <SectionLabel>Members</SectionLabel>
      <div className="mb-[10px] overflow-hidden rounded-[20px] bg-surface">
        {(members ?? []).map((m, i) => (
          <div
            key={m.id}
            className="flex min-h-[58px] items-center gap-3 px-[14px] py-[11px]"
            style={{ borderTop: i > 0 ? '1px solid var(--bg)' : undefined }}
          >
            <span className="flex size-[38px] shrink-0 items-center justify-center rounded-full bg-surface2 text-sm font-bold">
              {memberName(m, prefs?.userId).charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-semibold">
                {memberName(m, prefs?.userId)}
              </span>
              {m.email && <span className="mt-px block truncate text-[12.5px] text-faint">{m.email}</span>}
            </span>
            <span
              className="rounded-[7px] border border-line px-2 py-1 text-[11px] font-bold uppercase tracking-[0.05em]"
              style={{ color: m.role === 'owner' ? 'var(--ok)' : 'var(--faint)' }}
            >
              {m.role}
            </span>
          </div>
        ))}
        {(!members || members.length === 0) && (
          <div className="px-[14px] py-4 text-[13.5px] text-muted">Just you for now.</div>
        )}
      </div>
      <button
        onClick={() => navigate('/invite')}
        className="press mb-[22px] flex h-[52px] w-full items-center justify-center rounded-[17px] bg-surface2 text-[15px] font-semibold"
      >
        Invite a caregiver
      </button>

      <SectionLabel>Children</SectionLabel>
      <div className="mb-[22px] overflow-hidden rounded-[20px] bg-surface">
        {(children ?? []).map((c, i) => (
          <div
            key={c.id}
            className="flex min-h-[58px] items-center gap-3 px-[14px] py-[11px]"
            style={{ borderTop: i > 0 ? '1px solid var(--bg)' : undefined }}
          >
            <span
              className="size-3 shrink-0 rounded-full"
              style={{ background: accentOf(c.color) }}
            />
            <span className="flex-1">
              <span className="block text-[14.5px] font-semibold">{c.name}</span>
              <span className="mt-px block text-[12.5px] text-faint">{ageLabel(c.birth_date)}</span>
            </span>
            <button
              onClick={() => softDelete('children', c.id)}
              className="press text-[13px] text-muted"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          onClick={() => setAddingChild(true)}
          className="press flex min-h-[52px] w-full items-center gap-3 px-[14px] py-[13px] text-[14.5px] font-semibold text-muted"
        >
          <span className="flex size-[22px] items-center justify-center rounded-full border border-dashed border-faint text-[13px]">
            +
          </span>
          Add a child
        </button>
      </div>

      <SectionLabel>Appearance</SectionLabel>
      <div className="mb-[22px] flex gap-[5px] rounded-full bg-surface p-[5px]">
        {(['dark', 'light', 'system'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setPrefs({ theme: t })}
            className="press flex h-[42px] flex-1 items-center justify-center rounded-full text-sm font-semibold capitalize"
            style={{
              background: theme === t ? 'var(--surface2)' : 'transparent',
              color: theme === t ? 'var(--text)' : 'var(--muted)',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <button
        onClick={async () => {
          await signOut();
          await clearLocalData();
          window.location.href = '/';
        }}
        className="press flex h-[46px] w-full items-center justify-center text-[15px] font-semibold text-danger"
      >
        Sign out
      </button>

      <AddChildSheet open={addingChild} onClose={() => setAddingChild(false)} />
    </div>
  );
}

function AddChildSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const prefs = usePrefs();
  const [name, setName] = useState('');
  const [birth, setBirth] = useState('');
  const [color, setColor] = useState(0);

  async function create() {
    if (!name.trim() || !prefs?.householdId) return;
    await put<Child>('children', {
      id: newId(),
      household_id: prefs.householdId,
      name: name.trim(),
      birth_date: birth || null,
      color,
      created_by: prefs.userId,
      archived: false,
      updated_at: nowIso(),
      deleted_at: null,
    });
    setName('');
    setBirth('');
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="serif mb-4 text-2xl font-medium">Add a child</div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Their name"
        className="mb-3 h-14 w-full rounded-[18px] border border-line bg-surface2 px-4 text-[16.5px] outline-none placeholder:text-faint"
      />
      <input
        type="date"
        value={birth}
        onChange={(e) => setBirth(e.target.value)}
        className="num mb-4 h-14 w-full rounded-[18px] border border-line bg-surface2 px-4 text-[16.5px] outline-none"
      />
      <div className="label-caps mb-3">Their colour</div>
      <div className="mb-5 flex flex-wrap gap-3">
        {ACCENTS.map((c, i) => (
          <button
            key={c}
            onClick={() => setColor(i)}
            aria-label={`Colour ${i + 1}`}
            className="press size-12 rounded-full"
            style={{
              background: c,
              boxShadow: color === i ? `0 0 0 3px var(--surface), 0 0 0 5px ${c}` : 'none',
              transition: 'box-shadow .3s var(--ease-out), transform .14s ease',
            }}
          />
        ))}
      </div>
      <div className="flex gap-[10px]">
        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        <div className="flex-[1.3]">
          <PrimaryButton onClick={create} disabled={!name.trim()}>
            Add child
          </PrimaryButton>
        </div>
      </div>
    </Sheet>
  );
}

/** Invite screen — code, shareable link, and pending invites. */
export function Invite() {
  const navigate = useNavigate();
  const household = useHousehold();
  const invites = useInvites();
  const prefs = usePrefs();
  const [copied, setCopied] = useState(false);

  const active = invites?.[0];
  const link = active ? `${window.location.origin}/join/${active.code}` : '';

  async function generate() {
    if (!prefs?.householdId) return;
    await put<HouseholdInvite>('household_invites', {
      id: newId(),
      household_id: prefs.householdId,
      code: makeCode(),
      label: null,
      email: null,
      created_by: prefs.userId,
      expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      redeemed_by: null,
      redeemed_at: null,
      revoked_at: null,
      updated_at: nowIso(),
      deleted_at: null,
    });
  }

  async function share() {
    if (!link) return;
    if (navigator.share) {
      await navigator.share({ title: 'Join our household on Nightly', url: link }).catch(() => {});
      return;
    }
    await navigator.clipboard.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="scroll-y min-h-0 flex-1 px-4 pt-3">
      <button
        onClick={() => navigate(-1)}
        className="press flex min-h-11 items-center text-[14.5px] font-medium text-muted"
      >
        ← Settings
      </button>
      <div className="serif mt-[2px] text-[28px] font-medium tracking-[-0.015em]">
        Invite a caregiver
      </div>
      <p className="mt-[6px] mb-5 text-sm leading-[1.5] text-muted">
        They can log sleep and see everything you see. You stay the owner.
      </p>

      {active ? (
        <>
          <div className="mb-3 rounded-[26px] bg-surface px-5 py-6 text-center">
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-faint">
              Invite code
            </div>
            <div className="num my-[10px] text-[34px] font-semibold tracking-[0.06em]">
              {active.code}
            </div>
            <div className="text-[13px] text-muted">Expires in 48 hours</div>
            <div className="mt-5 flex gap-[9px]">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(link);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                }}
                className="press flex h-[50px] flex-1 items-center justify-center rounded-2xl bg-surface2 text-[14.5px] font-semibold"
              >
                {copied ? 'Copied' : 'Copy link'}
              </button>
              <button
                onClick={share}
                className="press flex h-[50px] flex-1 items-center justify-center rounded-2xl text-[14.5px] font-bold"
                style={{ background: 'var(--text)', color: 'var(--bg)' }}
              >
                Share
              </button>
            </div>
          </div>
          <div className="num break-all px-3 pb-[22px] text-center text-xs text-faint">{link}</div>

          <SectionLabel>Pending</SectionLabel>
          <div className="overflow-hidden rounded-[20px] bg-surface">
            {invites?.map((i) => (
              <div key={i.id} className="flex min-h-[58px] items-center gap-3 px-[14px] py-3">
                <span className="flex size-[38px] shrink-0 items-center justify-center rounded-full bg-surface2 text-sm font-bold text-muted">
                  ?
                </span>
                <span className="flex-1">
                  <span className="num block text-[14.5px] font-semibold">{i.code}</span>
                  <span className="mt-px block text-[12.5px] text-faint">
                    Expires {new Date(i.expires_at).toLocaleDateString()}
                  </span>
                </span>
                <button
                  onClick={() => softDelete('household_invites', i.id)}
                  className="press text-[13px] font-semibold text-danger"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="rounded-[26px] bg-surface px-5 py-8 text-center">
          <div className="serif mb-2 text-2xl font-medium">No active invite</div>
          <p className="mx-auto mb-5 max-w-[250px] text-sm leading-[1.5] text-muted">
            Generate a code for {household?.name ?? 'your household'}. It's good for 48 hours.
          </p>
          <PrimaryButton onClick={generate}>Generate invite code</PrimaryButton>
        </div>
      )}
    </div>
  );
}

/** Falls back to "You" rather than a generic "Member" for the signed-in caregiver. */
function memberName(
  m: { display_name: string | null; email: string | null; user_id: string },
  currentUserId: string | null | undefined,
): string {
  if (m.display_name) return m.display_name;
  if (m.email) return m.email;
  return m.user_id === (currentUserId ?? 'local') ? 'You' : 'Caregiver';
}

/** Human-friendly, unambiguous — no 0/O or 1/I to misread aloud at handover. */
function makeCode(): string {
  const words = ['MOON', 'DUSK', 'CALM', 'WREN', 'NEST', 'HUSH', 'DAWN', 'FERN'];
  const word = words[Math.floor(Math.random() * words.length)];
  const digits = String(Math.floor(1000 + Math.random() * 9000));
  return `${word}-${digits}`;
}
