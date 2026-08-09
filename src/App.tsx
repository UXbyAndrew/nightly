import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Header, TabBar } from '@/components/Chrome';
import { Sheet } from '@/components/ui';
import {
  useActiveChild,
  useChildren,
  useOnline,
  useOpenSession,
  usePendingWrites,
  usePrefs,
  setActiveChild,
} from '@/hooks';
import { setPrefs } from '@/lib/db';
import { stateOf } from '@/lib/sessions';
import { startSync } from '@/lib/sync';
import { getUserId, isSupabaseConfigured, supabase } from '@/lib/supabase';
import { accentOf } from '@/data/accents';
import { ageLabel } from '@/lib/time';
import QuickLog from '@/screens/QuickLog';
import Timeline from '@/screens/Timeline';
import Trends from '@/screens/Trends';
import Tags from '@/screens/Tags';
import More, { Invite } from '@/screens/More';
import SessionEditor from '@/screens/SessionEditor';
import Onboarding from '@/screens/Onboarding';
import Join from '@/screens/Join';

/**
 * App shell: theme, sync lifecycle, the onboarding gate, and the shared chrome.
 */
export default function App() {
  const prefs = usePrefs();
  const children = useChildren();
  const child = useActiveChild();
  const openSession = useOpenSession(child?.id);
  const pending = usePendingWrites();
  const online = useOnline();
  const location = useLocation();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const state = stateOf(openSession);

  // Theme. The night skin is the app's real home — 'dark' maps to it deliberately.
  useEffect(() => {
    const theme = prefs?.theme ?? 'dark';
    const resolve = () => {
      if (theme === 'light') return 'light';
      if (theme === 'dark') return 'night';
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'night';
    };
    document.documentElement.dataset.skin = resolve();

    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => (document.documentElement.dataset.skin = resolve());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [prefs?.theme]);

  // Capture the signed-in user id so created rows carry a real created_by.
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    void getUserId().then((id) => {
      if (id) void setPrefs({ userId: id });
    });
    const { data } = supabase!.auth.onAuthStateChange((_e, session) => {
      if (session?.user?.id) void setPrefs({ userId: session.user.id });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => startSync(), []);

  if (!prefs) return null;

  const onboarded = !!prefs.householdId && (children?.length ?? 0) > 0;
  const isJoin = location.pathname.startsWith('/join/');
  const isOnboarding = location.pathname === '/welcome';

  if (!onboarded && !isJoin && !isOnboarding) return <Navigate to="/welcome" replace />;

  // Onboarding and join run without the app chrome.
  if (isOnboarding || isJoin) {
    return (
      <div className="flex h-full flex-col">
        <StatusBarSpacer />
        <Routes>
          <Route path="/welcome" element={<Onboarding />} />
          <Route path="/join/:code" element={<Join />} />
        </Routes>
      </div>
    );
  }

  const fullScreen = location.pathname.startsWith('/session/') || location.pathname === '/invite';

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <StatusBarSpacer />
      {!fullScreen && (
        <Header
          child={child}
          pendingWrites={pending}
          online={online}
          syncEnabled={isSupabaseConfigured()}
          onOpenSwitcher={() => setSwitcherOpen(true)}
        />
      )}

      <Routes>
        <Route path="/" element={<Navigate to="/log" replace />} />
        <Route path="/log" element={<QuickLog />} />
        <Route path="/timeline" element={<Timeline />} />
        <Route path="/trends" element={<Trends />} />
        <Route path="/tags" element={<Tags />} />
        <Route path="/more" element={<More />} />
        <Route path="/invite" element={<Invite />} />
        <Route path="/session/:id" element={<SessionEditor />} />
        <Route path="*" element={<Navigate to="/log" replace />} />
      </Routes>

      {!fullScreen && <TabBar dim={state === 'settling' || state === 'asleep'} />}

      <ChildSwitcher open={switcherOpen} onClose={() => setSwitcherOpen(false)} />
    </div>
  );
}

/** Keeps content clear of the notch when installed to the home screen. */
function StatusBarSpacer() {
  return <div className="shrink-0" style={{ height: 'env(safe-area-inset-top)' }} />;
}

function ChildSwitcher({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const children = useChildren();
  const active = useActiveChild();

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="label-caps px-1 pb-[10px]">Logging for</div>
      {(children ?? []).map((c) => {
        const on = c.id === active?.id;
        return (
          <button
            key={c.id}
            onClick={async () => {
              await setActiveChild(c.id);
              onClose();
            }}
            className="press mb-[6px] flex min-h-[62px] w-full items-center gap-3 rounded-[18px] px-[15px] text-left"
            style={{ background: on ? 'var(--surface2)' : 'transparent' }}
          >
            <span
              className="size-[13px] shrink-0 rounded-full"
              style={{ background: accentOf(c.color) }}
            />
            <span className="flex-1">
              <span className="block text-base font-semibold">{c.name}</span>
              <span className="mt-px block text-[12.5px] text-faint">{ageLabel(c.birth_date)}</span>
            </span>
            {on && <span className="text-base text-ok">✓</span>}
          </button>
        );
      })}
      <button
        onClick={() => {
          onClose();
          navigate('/more');
        }}
        className="press flex h-[50px] w-full items-center justify-center rounded-2xl bg-surface2 text-[14.5px] font-semibold"
      >
        Add a child
      </button>
    </Sheet>
  );
}
