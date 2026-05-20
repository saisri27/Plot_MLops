// Plot — App entry
const { useState, useEffect, useRef } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "vibe": "editorial",
  "iconStyle": "outline",
  "density": "loose",
  "showFrame": true
}/*EDITMODE-END*/;

const SCREENS = [
  { id: 'auth',          label: 'Sign in' },
  { id: 'profile-setup', label: 'Profile setup' },
  { id: 'join',          label: 'Join group' },
  { id: 'home',          label: 'Home' },
  { id: 'create',        label: 'Create group' },
  { id: 'prefs',         label: 'Set prefs' },
  { id: 'lobby',         label: 'Waiting room' },
  { id: 'recs',          label: 'Recommendations' },
  { id: 'decision',      label: 'Group decision' },
  { id: 'memories',      label: 'Memories' },
  { id: 'profile',       label: 'Profile' },
];

function PlotApp() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  // Boot screen routing — three-stage check:
  //   1. No session (not signed in) → AuthScreen (email + password).
  //   2. Signed in but no profile name yet → ProfileSetupScreen.
  //   3. Otherwise → wherever the URL says, with Home as the default.
  // Home is the right landing page even for first-timers without a group:
  // it shows an empty-state CTA to create one. Solo SetPrefs is reachable
  // by tapping "+ New" in the bottom nav once the user knows the app.
  const [screen, setScreen] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const session = window.PLOT_API.getSession();
    if (!session || !session.email) return 'auth';
    const profile = window.PLOT_API.getLocalProfile();
    if (!(profile && profile.name)) return 'profile-setup';
    if (params.get('join')) return 'join';
    return 'home';
  });
  const [votes, setVotes] = useState({});

  // The active group, if the user is planning with friends. Persists in
  // localStorage so a refresh keeps the user in the group instead of
  // dropping them back to solo. Shape: {id, name, invite_token,
  // my_display_name}.
  const [currentGroup, _setCurrentGroup] = useState(() => window.PLOT_API.getCurrentGroup());
  function setCurrentGroup(g) {
    _setCurrentGroup(g);
    if (g) window.PLOT_API.setCurrentGroup(g);
    else window.PLOT_API.clearCurrentGroup();
  }

  // Pending invite token from the URL (?join=...), captured on first mount
  // so we can fetch the group preview lazily once JoinGroupScreen renders.
  const [pendingInviteToken] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('join') || null;
  });

  // App-level state shared across screens. Filled in by SetPrefs on submit
  // and consumed by Recs / Group Decision. No backend persistence yet —
  // refresh wipes this. Good enough for the 4-day demo.
  const [recState, setRecState] = useState({
    loading: false,
    error: null,
    venues: [],     // /recommend response.recommendations
    events: [],     // /events response.events
    rec_id: null,   // Supabase recommendation_log.id, used by /feedback
    used_llm: false,
    llm_model: null,
    llm_latency_ms: null,
    last_prefs: null,
  });

  // Pull more from the LLM than we show so "↻ Shuffle" can rotate to a
  // fresh five without a network round-trip. Pool=10 gives one full
  // shuffle pass (cards 1-5 → cards 6-10) before we have to refetch.
  // Warm latency is ~9–11 s for top_k=10, well inside the 25 s api.js
  // timeout we set earlier.
  const RECS_POOL_SIZE = 10;
  const RECS_VISIBLE = 5;

  // Group lobby state — what every member's phone polls. The lobby screen
  // reads this; the polling effect below keeps it fresh every ~4 s.
  const [lobbyState, setLobbyState] = useState(null);
  const lastSeenRecIdRef = useRef(null);

  // Submit handler — called by SetPrefsScreen with the user's chosen prefs.
  // Two flows now:
  //   * SOLO  → POST /recommend immediately, jump to Recs.
  //   * GROUP → POST /groups/{id}/prefs to save MY prefs, then route to
  //             the lobby. The lobby polls until any member taps "Get our
  //             recs", at which point everyone transitions to Recs together.
  async function handleSubmitPrefs(prefs) {
    setVotes({});
    if (currentGroup && currentGroup.id) {
      // Group flow — save my prefs, head to the lobby.
      try {
        await window.PLOT_API.setGroupPrefs(currentGroup.id, prefs);
      } catch (err) {
        // Saving prefs is best-effort; we still go to the lobby because
        // the user can retry from there or others can trigger recs.
        // eslint-disable-next-line no-console
        console.warn('setGroupPrefs failed, going to lobby anyway:', err);
      }
      setRecState({
        loading: false, error: null, venues: [], events: [],
        rec_id: null, used_llm: false, llm_model: null,
        llm_latency_ms: null, last_prefs: prefs,
        pool_offset: 0,
      });
      setScreen('lobby');
      return;
    }

    // Solo flow — straight to recs (unchanged behavior).
    setRecState({
      loading: true, error: null, venues: [], events: [],
      rec_id: null, used_llm: false, llm_model: null,
      llm_latency_ms: null, last_prefs: prefs,
      pool_offset: 0,
    });
    setScreen('recs');
    try {
      const [recRes, eventRes] = await Promise.all([
        window.PLOT_API.recommend(prefs, RECS_POOL_SIZE).catch((e) => ({ _err: e })),
        window.PLOT_API.events(prefs, RECS_POOL_SIZE).catch(() => ({ events: [] })),
      ]);
      if (recRes && recRes._err) throw recRes._err;
      setRecState((s) => ({
        ...s,
        loading: false,
        venues: recRes.recommendations || [],
        events: eventRes.events || [],
        rec_id: recRes.rec_id || null,
        used_llm: !!recRes.used_llm,
        llm_model: recRes.llm_model || null,
        llm_latency_ms: recRes.llm_latency_ms || null,
      }));
    } catch (err) {
      setRecState((s) => ({ ...s, loading: false, error: String(err.message || err) }));
    }
  }

  // Triggered from the lobby by any member tapping "Get our recs".
  // Runs the LLM once on the merged prefs; everyone else's poll picks up
  // last_rec_id and hydrates from the same response.
  async function handleGroupRecsTrigger() {
    if (!currentGroup || !currentGroup.id) return;
    setRecState((s) => ({ ...s, loading: true, error: null }));
    try {
      const [recRes, eventRes] = await Promise.all([
        window.PLOT_API.groupRecommend(currentGroup.id, RECS_POOL_SIZE).catch((e) => ({ _err: e })),
        // Events use the user's own prefs — they're not group-merged in
        // the backend yet. Best-effort.
        recState.last_prefs
          ? window.PLOT_API.events(recState.last_prefs, RECS_POOL_SIZE).catch(() => ({ events: [] }))
          : Promise.resolve({ events: [] }),
      ]);
      if (recRes && recRes._err) throw recRes._err;
      setRecState((s) => ({
        ...s,
        loading: false,
        venues: recRes.recommendations || [],
        events: eventRes.events || [],
        rec_id: recRes.rec_id || null,
        used_llm: !!recRes.used_llm,
        llm_model: recRes.llm_model || null,
        llm_latency_ms: recRes.llm_latency_ms || null,
        pool_offset: 0,
      }));
      lastSeenRecIdRef.current = recRes.rec_id || null;
      setScreen('recs');
    } catch (err) {
      setRecState((s) => ({ ...s, loading: false, error: String(err.message || err) }));
    }
  }

  // Lobby polling: every 4 s while the user is on the lobby OR recs screen
  // in group mode, fetch the latest /groups/{id} state. Two reasons to do
  // this even outside the lobby:
  //   1. Recs screen needs to keep the votes tally fresh (other members
  //      yay/nahh-ing show up here).
  //   2. If a different member kicked off a fresh "Get our recs" while
  //      we were on the recs screen, we'd want to re-hydrate.
  useEffect(() => {
    if (!currentGroup || !currentGroup.id) return undefined;
    if (screen !== 'lobby' && screen !== 'recs' && screen !== 'decision') return undefined;

    let cancelled = false;
    async function tick() {
      try {
        const state = await window.PLOT_API.getGroupState(currentGroup.id);
        if (cancelled) return;
        setLobbyState(state);

        // If the server has an active rec we haven't seen yet, hydrate
        // recState from it and route the user into recs. This is how
        // members who didn't tap "Get our recs" themselves get pulled in.
        const ar = state && state.active_rec;
        if (ar && ar.rec_id && lastSeenRecIdRef.current !== ar.rec_id) {
          lastSeenRecIdRef.current = ar.rec_id;
          // Members who didn't trigger this rec won't have events
          // pre-fetched. Their own /events will fire on the recs screen
          // if needed; for now we just hydrate venues.
          setRecState((s) => ({
            ...s,
            loading: false,
            error: null,
            venues: ar.recommendations || [],
            // Don't clobber events that the trigger-er already loaded;
            // for non-triggerers, this stays empty until /events fires.
            events: s.events && s.events.length ? s.events : [],
            rec_id: ar.rec_id,
            used_llm: !!ar.used_llm,
            llm_model: ar.llm_model || null,
            llm_latency_ms: ar.llm_latency_ms || null,
            pool_offset: 0,
          }));
          if (screen === 'lobby') setScreen('recs');
        }
      } catch (e) {
        // Network blips during polling are non-fatal — try again next tick
      }
    }

    tick();
    const id = setInterval(tick, 4000);
    return () => { cancelled = true; clearInterval(id); };
  }, [screen, currentGroup && currentGroup.id]);

  // After a successful join (from JoinGroupScreen) — set context and
  // route the user into the prefs flow so they can contribute their
  // preferences to the group.
  function handleJoinedGroup(group) {
    setCurrentGroup(group);
    // Strip ?join=… from the URL so a refresh doesn't re-trigger the
    // join landing.
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    setScreen('prefs');
  }

  // CreateGroupScreen → API → set context → land on prefs.
  function handleCreatedGroup(group) {
    setCurrentGroup(group);
    setScreen('prefs');
  }

  // Wipe everything that's tied to the previous group so the next group's
  // polled state, recs, and votes don't bleed over. Used by both
  // handleSwitchGroup and handleLeaveGroup.
  function _clearGroupSessionState() {
    setLobbyState(null);
    setVotes({});
    setRecState({
      loading: false, error: null, venues: [], events: [],
      rec_id: null, used_llm: false, llm_model: null,
      llm_latency_ms: null, last_prefs: null,
      pool_offset: 0,
    });
    lastSeenRecIdRef.current = null;
  }

  // HomeScreen tapped one of the user's groups. Switch the active group
  // (this is the bug-fix: previously onOpenGroup just navigated, so prefs/
  // votes silently fired against whichever group was active before),
  // wipe stale state, then route into the prefs flow.
  function handleSwitchGroup(group) {
    if (!group || !group.id) {
      setScreen('prefs');
      return;
    }
    if (!currentGroup || currentGroup.id !== group.id) {
      _clearGroupSessionState();
      setCurrentGroup(group);
    }
    setScreen('prefs');
  }

  // Profile / Home → "leave group" returns to solo mode. We don't delete
  // the group server-side (other members keep planning); just clear our
  // local context AND any stale per-group state. Best-effort call to the
  // backend to delete our group_members row — if the network fails we still
  // clear locally so the user isn't stuck staring at a group they wanted
  // to leave. They'll re-appear in the list on next refresh if the API
  // call didn't actually land, which is the right safety behavior.
  async function handleLeaveGroup() {
    const gid = currentGroup && currentGroup.id;
    _clearGroupSessionState();
    setCurrentGroup(null);
    setScreen('home');
    if (gid) {
      try {
        await window.PLOT_API.leaveGroup(gid);
      } catch (e) {
        console.warn('leaveGroup API failed (non-fatal):', e);
      }
    }
  }

  // "We went" tap on Group Decision: log the strongest feedback signal
  // (visited) to Supabase AND save a local memory for the UI gallery.
  // Both are best-effort: a network failure on /feedback shouldn't stop
  // the user from seeing the memory in the next screen.
  async function handleWentThere(locked) {
    if (!locked) {
      setScreen('memories');
      return;
    }
    // Save locally first so the UI is always responsive
    const memory = window.PLOT_API.addMemory({
      name: locked.name,
      category: locked.category,
      link: locked.link || null,
      image: locked.image || null,
      reason: locked.reason || '',
      rec_id: recState?.rec_id || null,
    });
    // Then fire-and-forget the feedback call — failure is non-fatal
    if (recState?.rec_id) {
      window.PLOT_API.feedback(recState.rec_id, locked.name, 'visited').catch(() => {});
    }
    setScreen('memories');
    return memory;
  }

  // Cycle the visible window through the cached pool. After we've shown
  // every pick at least once, fall back to a fresh /recommend so the
  // user is never stuck on the same set.
  async function handleShuffle() {
    if (!recState.last_prefs) return;
    const totalCached = Math.max(recState.venues.length, recState.events.length);
    const nextOffset = (recState.pool_offset || 0) + RECS_VISIBLE;

    if (nextOffset < totalCached) {
      // We still have unseen picks in the cached pool — just slide the
      // window. No network call.
      setRecState((s) => ({ ...s, pool_offset: nextOffset }));
      setVotes({});
      return;
    }

    // Pool exhausted: fetch a new round so the user sees genuinely new picks.
    await handleSubmitPrefs(recState.last_prefs);
  }

  const pal = window.PLOT_TOKENS.palette;

  // Detect mobile-sized viewports. On a phone we render the app fullscreen
  // — no fake-iPhone bezel, no side dev nav, no "prototype 375×812"
  // backdrop label. The IOSDevice frame + side nav + tweaks panel are
  // a desktop preview tool only; on a real phone they made the app
  // shrink to a tiny bezel inside the user's actual screen and showed a
  // hardcoded 9:41 status-bar time that didn't match the device clock.
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 700
  );
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mql = window.matchMedia('(max-width: 700px)');
    const handler = (e) => setIsMobileViewport(e.matches);
    if (mql.addEventListener) mql.addEventListener('change', handler);
    else mql.addListener(handler);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', handler);
      else mql.removeListener(handler);
    };
  }, []);

  // Map screen id → element
  const screenEl = (() => {
    const props = { vibe: tweaks.vibe, iconStyle: tweaks.iconStyle, density: tweaks.density };
    switch (screen) {
      case 'auth':     return <AuthScreen {...props} onContinue={() => {
        // After signing in / signing up: if this user hasn't filled in
        // their profile yet, go to ProfileSetup. Otherwise drop them on
        // Home (or Join, if the URL had an invite token).
        const profile = window.PLOT_API.getLocalProfile();
        if (!(profile && profile.name)) { setScreen('profile-setup'); return; }
        if (pendingInviteToken) setScreen('join');
        else setScreen('home');
      }} />;
      case 'profile-setup': return <ProfileSetupScreen {...props} onContinue={() => {
        // After the user fills in name / pronouns / DOB / avatar, drop
        // them on Home — that's the proper landing screen with the
        // bottom nav so they can pick what to do next.
        if (pendingInviteToken) setScreen('join');
        else setScreen('home');
      }} />;
      case 'join':     return <JoinGroupScreen {...props} token={pendingInviteToken} onBack={() => setScreen('home')} onJoined={handleJoinedGroup} />;
      case 'home':     return <HomeScreen {...props} currentGroup={currentGroup} onOpenGroup={handleSwitchGroup} onCreate={() => setScreen('create')} onProfile={() => setScreen('profile')} />;
      case 'create':   return <CreateGroupScreen {...props} onBack={() => setScreen('home')} onCreated={handleCreatedGroup} />;
      case 'prefs':    return <SetPrefsScreen {...props} currentGroup={currentGroup} onBack={() => setScreen('home')} onSubmit={handleSubmitPrefs} />;
      case 'lobby':    return <WaitingRoomScreen {...props} currentGroup={currentGroup} lobbyState={lobbyState} onTriggerRecs={handleGroupRecsTrigger} onBack={() => setScreen('prefs')} loading={recState.loading} />;
      case 'recs':     return <RecsScreen {...props} currentGroup={currentGroup} recState={recState} lobbyState={lobbyState} votes={votes} setVotes={setVotes} onShuffle={handleShuffle} onBack={() => setScreen(currentGroup ? 'lobby' : 'prefs')} onLockedIn={() => setScreen('decision')} />;
      case 'decision': return <GroupDecisionScreen {...props} currentGroup={currentGroup} lobbyState={lobbyState} recState={recState} votes={votes} onBack={() => setScreen('recs')} onMemories={() => setScreen('memories')} onWentThere={handleWentThere} />;
      case 'memories': return <MemoriesScreen {...props} onBack={() => setScreen('home')} />;
      case 'profile':  return <ProfileScreen {...props} currentGroup={currentGroup} onLeaveGroup={handleLeaveGroup} onBack={() => setScreen('home')} />;
      default: return null;
    }
  })();

  // Re-usable inner content (works in both mobile-fullscreen and
  // desktop-bezel modes).
  const phoneInner = (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {screenEl}
      {/* Persistent bottom-tab nav — only on the "destination"
          screens (Home / Memories / Profile). Hidden on transactional
          flows where the screen-level action button owns the bottom. */}
      {['home', 'memories', 'profile'].includes(screen) && (
        <BottomNav
          active={screen}
          vibe={tweaks.vibe}
          onChange={(tab) => {
            if (tab === 'create') setScreen('create');
            else setScreen(tab);
          }}
        />
      )}
      {/* Global toast notification host. Mounted once at root; any code
          can fire toasts via window.plotToast(msg, kind). */}
      <ToastHost />
      {/* Global confetti host. Mounted at root so window.plotConfetti()
          works even when the firing screen navigates away mid-animation. */}
      <ConfettiHost />
      {/* Global coin-shower host — fires from BudgetChip taps via
          window.plotCoinShower(count). Same pattern as ConfettiHost. */}
      <CoinShowerHost />
    </div>
  );

  // Mobile: fullscreen render, no fake-iPhone bezel, no dev panels. The
  // user's real device is the phone; nothing else makes sense on a small
  // viewport.
  if (isMobileViewport) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        background: pal.cream,
        color: pal.ink,
        fontFamily: '"Bricolage Grotesque", system-ui, sans-serif',
        overflow: 'hidden',
      }}>
        {phoneInner}
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#1A1612',
      color: pal.cream,
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      padding: '32px 20px',
      fontFamily: '"Bricolage Grotesque", system-ui, sans-serif',
      position: 'relative',
    }}>
      {/* Backdrop type label — desktop preview only */}
      <div style={{
        position: 'fixed',
        top: 24, left: 28,
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        fontSize: 11,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'rgba(247,239,226,0.45)',
      }}>
        plot · prototype · 375×812
      </div>

      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'center' }}>
        {/* Phone bezel — desktop preview only */}
        <div data-screen-label={SCREENS.find(s => s.id === screen)?.label || screen}>
          <IOSDevice width={375} height={812}>
            {phoneInner}
          </IOSDevice>
        </div>

        {/* Side nav — screen list */}
        <div style={{ minWidth: 200, marginTop: 60 }}>
          <div style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 10,
            color: 'rgba(247,239,226,0.5)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            marginBottom: 12,
          }}>
            Screens
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {SCREENS.map((s, i) => {
              const active = s.id === screen;
              return (
                <button
                  key={s.id}
                  onClick={() => setScreen(s.id)}
                  style={{
                    textAlign: 'left',
                    padding: '8px 12px',
                    background: active ? 'rgba(247,239,226,0.12)' : 'transparent',
                    border: 'none',
                    borderLeft: `2px solid ${active ? pal.terracotta : 'rgba(247,239,226,0.2)'}`,
                    color: active ? pal.cream : 'rgba(247,239,226,0.6)',
                    fontFamily: 'Inter, sans-serif',
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}>
                  <span style={{
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: 10,
                    opacity: 0.6,
                  }}>{String(i + 1).padStart(2, '0')}</span>
                  {s.label}
                </button>
              );
            })}
          </div>

          <div style={{
            marginTop: 24,
            padding: 12,
            background: 'rgba(247,239,226,0.06)',
            borderRadius: 10,
            fontFamily: 'Inter, sans-serif',
            fontSize: 12,
            color: 'rgba(247,239,226,0.7)',
            lineHeight: 1.5,
          }}>
            Toggle <strong style={{ color: pal.cream }}>Tweaks</strong> in the toolbar to switch between <em>Editorial</em> and <em>Playful-zine</em> directions, change icon style, and density.
          </div>
        </div>
      </div>

      {/* Tweaks panel */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="Visual direction">
          <TweakRadio
            label="Vibe"
            value={tweaks.vibe}
            onChange={(v) => setTweak('vibe', v)}
            options={[
              { value: 'editorial', label: 'Editorial' },
              { value: 'playful',   label: 'Playful' },
            ]}
          />
        </TweakSection>

        <TweakSection label="Components">
          <TweakRadio
            label="Icon chip"
            value={tweaks.iconStyle}
            onChange={(v) => setTweak('iconStyle', v)}
            options={[
              { value: 'outline', label: 'Outline' },
              { value: 'filled',  label: 'Filled' },
              { value: 'auto',    label: 'Auto' },
            ]}
          />
          <TweakRadio
            label="Density"
            value={tweaks.density}
            onChange={(v) => setTweak('density', v)}
            options={[
              { value: 'loose', label: 'Loose' },
              { value: 'tight', label: 'Tight' },
            ]}
          />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<PlotApp />);
