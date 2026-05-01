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
  const [screen, setScreen] = useState('prefs'); // open on the killer screen first
  const [votes, setVotes] = useState({});

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

  // We pull a bigger pool from the LLM than we show so the user can
  // "Shuffle" through different picks without a fresh /recommend round-trip.
  const RECS_POOL_SIZE = 10;
  const RECS_VISIBLE = 5;

  // Submit handler — called by SetPrefsScreen with the user's chosen prefs.
  // Fires /recommend and /events in parallel so the user only waits for
  // the slower of the two (LLM rerank ~800ms, BQ ~300ms).
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
      case 'home':     return <HomeScreen {...props} onOpenGroup={() => setScreen('prefs')} onCreate={() => setScreen('create')} onProfile={() => setScreen('profile')} />;
      case 'create':   return <CreateGroupScreen {...props} onBack={() => setScreen('home')} onCreated={() => setScreen('prefs')} />;
      case 'prefs':    return <SetPrefsScreen {...props} onBack={() => setScreen('home')} onSubmit={handleSubmitPrefs} />;
      case 'recs':     return <RecsScreen {...props} recState={recState} votes={votes} setVotes={setVotes} onShuffle={handleShuffle} onBack={() => setScreen('prefs')} onLockedIn={() => setScreen('decision')} />;
      case 'decision': return <GroupDecisionScreen {...props} recState={recState} votes={votes} onBack={() => setScreen('recs')} onMemories={() => setScreen('memories')} />;
      case 'memories': return <MemoriesScreen {...props} onBack={() => setScreen('decision')} />;
      case 'profile':  return <ProfileScreen {...props} onBack={() => setScreen('home')} />;
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
