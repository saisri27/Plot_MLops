// Plot — App entry
const { useState, useEffect } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "vibe": "editorial",
  "iconStyle": "outline",
  "density": "loose",
  "showFrame": true
}/*EDITMODE-END*/;

const SCREENS = [
  { id: 'auth',     label: 'Auth' },
  { id: 'join',     label: 'Join group' },
  { id: 'home',     label: 'Home' },
  { id: 'create',   label: 'Create group' },
  { id: 'prefs',    label: 'Set prefs' },
  { id: 'recs',     label: 'Recommendations' },
  { id: 'decision', label: 'Group decision' },
  { id: 'memories', label: 'Memories' },
  { id: 'profile',  label: 'Profile' },
];

function PlotApp() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  // Boot screen depends on URL state — see initial-screen logic below.
  const [screen, setScreen] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('join')) return 'join';
    return window.PLOT_API.getCurrentGroup() ? 'home' : 'prefs';
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

  // We pull a small pool from the LLM than we show so the user can
  // "Shuffle" through different picks without a fresh /recommend round-trip.
  // Pool=8 keeps the first call fast (~6–8 s) while still supporting one
  // shuffle round (cards 6-8 plus 2 from a fresh refetch).
  const RECS_POOL_SIZE = 8;
  const RECS_VISIBLE = 5;

  // Submit handler — called by SetPrefsScreen with the user's chosen prefs.
  // Two paths:
  //   * SOLO  → POST /recommend directly with this user's prefs
  //   * GROUP → POST /groups/{id}/prefs (save my prefs), then POST
  //             /groups/{id}/recommend (server merges all members' prefs).
  // Both paths shape recState identically so the rest of the UI doesn't
  // care which mode it's in.
  async function handleSubmitPrefs(prefs) {
    setRecState({
      loading: true, error: null, venues: [], events: [],
      rec_id: null, used_llm: false, llm_model: null,
      llm_latency_ms: null, last_prefs: prefs,
      pool_offset: 0,
    });
    setScreen('recs');
    setVotes({});
    try {
      let recRes, eventRes;
      if (currentGroup && currentGroup.id) {
        // Group mode: save my prefs to the group, then ask the server to
        // merge all members' prefs and rank. We still call /events
        // separately because group recs don't include events.
        await window.PLOT_API.setGroupPrefs(currentGroup.id, prefs);
        [recRes, eventRes] = await Promise.all([
          window.PLOT_API.groupRecommend(currentGroup.id, RECS_POOL_SIZE).catch((e) => ({ _err: e })),
          window.PLOT_API.events(prefs, RECS_POOL_SIZE).catch(() => ({ events: [] })),
        ]);
      } else {
        // Solo mode (unchanged behavior)
        [recRes, eventRes] = await Promise.all([
          window.PLOT_API.recommend(prefs, RECS_POOL_SIZE).catch((e) => ({ _err: e })),
          window.PLOT_API.events(prefs, RECS_POOL_SIZE).catch(() => ({ events: [] })),
        ]);
      }
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

  // Profile / Home → "leave group" returns to solo mode. We don't delete
  // the group server-side (other members keep planning); just clear our
  // local context.
  function handleLeaveGroup() {
    setCurrentGroup(null);
    setScreen('home');
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

  // Map screen id → element
  const screenEl = (() => {
    const props = { vibe: tweaks.vibe, iconStyle: tweaks.iconStyle, density: tweaks.density };
    switch (screen) {
      case 'auth':     return <AuthScreen {...props} onContinue={() => setScreen('home')} />;
      case 'join':     return <JoinGroupScreen {...props} token={pendingInviteToken} onBack={() => setScreen('home')} onJoined={handleJoinedGroup} />;
      case 'home':     return <HomeScreen {...props} currentGroup={currentGroup} onOpenGroup={() => setScreen('prefs')} onCreate={() => setScreen('create')} onProfile={() => setScreen('profile')} />;
      case 'create':   return <CreateGroupScreen {...props} onBack={() => setScreen('home')} onCreated={handleCreatedGroup} />;
      case 'prefs':    return <SetPrefsScreen {...props} currentGroup={currentGroup} onBack={() => setScreen('home')} onSubmit={handleSubmitPrefs} />;
      case 'recs':     return <RecsScreen {...props} currentGroup={currentGroup} recState={recState} votes={votes} setVotes={setVotes} onShuffle={handleShuffle} onBack={() => setScreen('prefs')} onLockedIn={() => setScreen('decision')} />;
      case 'decision': return <GroupDecisionScreen {...props} currentGroup={currentGroup} recState={recState} votes={votes} onBack={() => setScreen('recs')} onMemories={() => setScreen('memories')} onWentThere={handleWentThere} />;
      case 'memories': return <MemoriesScreen {...props} onBack={() => setScreen('decision')} />;
      case 'profile':  return <ProfileScreen {...props} currentGroup={currentGroup} onLeaveGroup={handleLeaveGroup} onBack={() => setScreen('home')} />;
      default: return null;
    }
  })();

  return (
    <div style={{
      minHeight: '100vh',
      background: '#1A1612',
      color: pal.cream,
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      padding: '32px 20px',
      fontFamily: 'Inter, system-ui, sans-serif',
      position: 'relative',
    }}>
      {/* Backdrop type label */}
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
        {/* Phone */}
        <div data-screen-label={SCREENS.find(s => s.id === screen)?.label || screen}>
          <IOSDevice width={375} height={812}>
            <div style={{ width: '100%', height: '100%' }}>
              {screenEl}
            </div>
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
