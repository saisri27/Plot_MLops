// Plot — Screens
// Auth, Home, CreateGroup, SetPrefs, Recommendations, GroupDecision, Memories, Profile

const T2 = window.PLOT_TOKENS;
const { useState, useEffect, useMemo } = React;

// ─────────────────────────────────────────────────────────────
// Sample data
// ─────────────────────────────────────────────────────────────
const SAMPLE_VENUES = [
  { id: 'v1', name: 'Trick Dog',     category: 'food',     distance: '1.2 mi', rating: 4.6, price: 3, reason: 'Killer cocktails, calm corners for catching up.' },
  { id: 'v2', name: 'Dolores Park',  category: 'outdoors', distance: '0.8 mi', rating: 4.8, price: 1, reason: 'Golden-hour sun for everyone.' },
  { id: 'v3', name: 'The Riddler',   category: 'food',     distance: '2.1 mi', rating: 4.5, price: 3, reason: 'All-bubbles bar, perfect for a slow night.' },
  { id: 'v4', name: 'Kabuki Springs',category: 'wellness', distance: '3.4 mi', rating: 4.7, price: 3, reason: 'Soak, steam, no phones — recovery hangout.' },
  { id: 'v5', name: 'Foreign Cinema',category: 'food',     distance: '1.6 mi', rating: 4.5, price: 4, reason: 'Patio dinner with a movie projected on the wall.' },
];

const SAMPLE_EVENTS = [
  { id: 'e1', name: 'Outside Lands DJ Set',    category: 'music', distance: '2.4 mi', rating: 4.4, price: 2, date: 'FRI 8:00', reason: 'Open-air dance floor, no cover before 9.' },
  { id: 'e2', name: 'Off the Grid: Fort Mason',category: 'food',  distance: '1.9 mi', rating: 4.6, price: 2, date: 'FRI 5:00', reason: 'Picnic-style food trucks on the marina.' },
  { id: 'e3', name: 'SF MOMA Late Night',      category: 'arts',  distance: '2.8 mi', rating: 4.7, price: 2, date: 'SAT 6:00', reason: 'Galleries open after dark with a bar.' },
  { id: 'e4', name: 'Stern Grove Festival',    category: 'music', distance: '4.2 mi', rating: 4.8, price: 1, date: 'SUN 2:00', reason: 'Free concert in a redwood amphitheater.' },
];

const SAMPLE_MEMBERS = [
  { id: 'm1', name: 'Maya',  color: 'terracotta' },
  { id: 'm2', name: 'Jordan',color: 'sage' },
  { id: 'm3', name: 'Priya', color: 'lilac' },
  { id: 'm4', name: 'Ben',   color: 'peach' },
  { id: 'm5', name: 'You',   color: 'terracotta' },
];

const SAMPLE_GROUPS = [
  { id: 'g1', name: 'Sunday Soft Life',  members: 4, last: 'Locked in: Trick Dog · 2h ago',  status: 'locked' },
  { id: 'g2', name: 'mission gays',      members: 5, last: '3 of 5 voted on Foreign Cinema', status: 'voting' },
  { id: 'g3', name: 'birthday krew',     members: 7, last: 'Maya created · just now',        status: 'new' },
];

const SAMPLE_MEMORIES = [
  { id: 'mem1', venue: 'Trick Dog',       date: 'Mar 14', tone: 'terracotta' },
  { id: 'mem2', venue: 'Dolores Park',    date: 'Feb 22', tone: 'sage' },
  { id: 'mem3', venue: 'Foreign Cinema',  date: 'Feb 09', tone: 'lilac' },
  { id: 'mem4', venue: 'Kabuki Springs',  date: 'Jan 28', tone: 'peach' },
  { id: 'mem5', venue: 'The Riddler',     date: 'Jan 14', tone: 'terracotta' },
  { id: 'mem6', venue: 'Stern Grove',     date: 'Dec 03', tone: 'sage' },
];

window.PLOT_DATA = { SAMPLE_VENUES, SAMPLE_EVENTS, SAMPLE_MEMBERS, SAMPLE_GROUPS, SAMPLE_MEMORIES };

// ─────────────────────────────────────────────────────────────
// Screen wrapper — gives us scrollable area below the status bar
// ─────────────────────────────────────────────────────────────
function ScreenShell({ children, header, footer, vibe = 'editorial', bg, padTop = 56, padBottom = 40, scrollKey }) {
  const pal = T2.palette;
  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: bg || pal.cream,
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
    }}>
      {header && (
        <div style={{
          position: 'absolute',
          top: padTop, left: 0, right: 0,
          zIndex: 5,
        }}>
          {header}
        </div>
      )}
      <div
        key={scrollKey}
        style={{
          flex: 1,
          overflowY: 'auto',
          paddingTop: padTop,
          paddingBottom: padBottom,
          WebkitOverflowScrolling: 'touch',
        }}>
        {children}
      </div>
      {footer && (
        <div style={{
          position: 'absolute',
          bottom: 24, left: 0, right: 0,
          padding: '12px 20px 0',
          background: `linear-gradient(to top, ${bg || pal.cream} 60%, ${(bg || pal.cream) + '00'})`,
          paddingBottom: 12,
        }}>
          {footer}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 1. Auth
// ─────────────────────────────────────────────────────────────
function PlotWordmark({ size = 56, ink, terracotta, vibe }) {
  // P-l-o-t with the "o" replaced by a navigator map-pin glyph
  // Pin sized to match cap-height so it reads as a letter. Letter-
  // spacing slightly positive (was -0.05em which made the letters
  // collide with the pin glyph; +0.005em now gives the wordmark
  // air without making it feel airy).
  const pinW = size * 0.78;
  const pinH = size * 1.0;
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'flex-start',
      fontFamily: '"Bricolage Grotesque", system-ui, sans-serif',
      fontSize: size,
      fontWeight: 700,
      letterSpacing: '0.005em',
      color: ink,
      lineHeight: 1,
    }}>
      <span>Pl</span>
      <span style={{
        position: 'relative',
        display: 'inline-block',
        // Slightly wider footprint + small symmetric margins so the
        // pin glyph sits with breathing room on both sides.
        width: pinW * 0.84,
        height: size,
        marginLeft: size * 0.025,
        marginRight: size * 0.025,
        verticalAlign: 'top',
      }}>
        <svg
          viewBox="0 0 100 130"
          width={pinW}
          height={pinH}
          style={{
            position: 'absolute',
            left: '50%',
            top: -size * 0.04,
            transform: 'translateX(-50%)',
            overflow: 'visible',
          }}>
          <path
            d="M 50 4 C 76 4, 96 24, 96 50 C 96 78, 60 110, 50 126 C 40 110, 4 78, 4 50 C 4 24, 24 4, 50 4 Z"
            fill={ink}
          />
          <circle cx="50" cy="48" r="17" fill={terracotta} />
        </svg>
      </span>
      <span>t</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Join group landing — what a friend sees when they tap an invite link
// (URL contains ?join=<token>). Fetches the group preview, asks for a
// display name, calls /groups/{id}/join, then the parent routes them
// into the prefs flow.
// ─────────────────────────────────────────────────────────────
function JoinGroupScreen({ vibe, token, onBack, onJoined }) {
  const pal = T2.palette;
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [name, setName] = useState(() => window.PLOT_API.getDisplayName());
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState(null);
  // True when the polled group state confirms the current user is already
  // in the members list — we then show a "you're already in" CTA instead
  // of the join form, so re-opening an invite link doesn't make the user
  // re-type their name.
  const [alreadyMember, setAlreadyMember] = useState(false);

  useEffect(() => {
    if (!token) {
      setPreviewError('No invite token in the URL.');
      return;
    }
    let cancelled = false;
    const myUserId = window.PLOT_API.getUserId();
    window.PLOT_API.peekGroupByToken(token)
      .then(async (p) => {
        if (cancelled) return;
        setPreview(p);
        // Fetch full state once so we can detect "already a member" and
        // skip the form entirely. Best-effort: a network blip means we
        // just show the form like before.
        try {
          const full = await window.PLOT_API.getGroupState(p.id);
          if (cancelled) return;
          const member = (full.members || []).find((m) => m.user_id === myUserId);
          if (member) {
            setAlreadyMember(true);
            // Pre-fill the name field with their stored display_name in
            // case they want to keep using it / re-confirm.
            if (member.display_name) setName(member.display_name);
          }
        } catch (e) { /* non-fatal */ }
      })
      .catch((e) => { if (!cancelled) setPreviewError(String(e.message || e)); });
    return () => { cancelled = true; };
  }, [token]);

  async function handleJoin() {
    if (!preview || !name.trim() || joining) return;
    setJoining(true);
    setJoinError(null);
    const trimmed = name.trim();
    window.PLOT_API.setDisplayName(trimmed);
    try {
      await window.PLOT_API.joinGroupAPI(preview.id, trimmed);
      onJoined({
        id: preview.id,
        name: preview.name,
        invite_token: preview.invite_token,
        my_display_name: trimmed,
      });
    } catch (err) {
      setJoinError(String(err.message || err));
      setJoining(false);
    }
  }

  return (
    <ScreenShell vibe={vibe} bg={pal.cream} padTop={50}>
      <div style={{ padding: '8px 24px 0', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={onBack} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: 4, color: pal.ink, fontSize: 22, fontFamily: 'inherit',
        }}>←</button>
        <SectionLabel vibe={vibe}>You've been invited</SectionLabel>
      </div>

      <div style={{ padding: '0 24px', flex: 1 }}>
        {previewError && (
          <div style={{
            padding: 16,
            borderRadius: T2.radii.md,
            background: pal.terracottaL,
            color: pal.terracottaD,
            fontFamily: 'Inter, sans-serif',
            fontSize: 13,
            marginBottom: 24,
          }}>
            {previewError}
          </div>
        )}

        {!preview && !previewError && (
          <div style={{
            padding: 24,
            textAlign: 'center',
            color: pal.inkSoft,
            fontFamily: 'Inter, sans-serif',
            fontSize: 14,
          }}>
            <div style={{
              width: 24, height: 24, margin: '0 auto 16px',
              border: `2.5px solid ${pal.line}`,
              borderTopColor: pal.terracotta,
              borderRadius: '50%',
              animation: 'plotspin 0.9s linear infinite',
            }} />
            Loading invite…
            <style>{`@keyframes plotspin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {preview && (
          <>
            <div style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: 32, fontWeight: 500,
              letterSpacing: '-0.02em',
              color: pal.ink,
              lineHeight: 1.1,
              textWrap: 'pretty',
              marginBottom: 8,
            }}>
              {alreadyMember ? `You're in ${preview.name}` : `Join ${preview.name}`}
            </div>
            <div style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: 14, color: pal.inkSoft, marginBottom: 28,
            }}>
              {alreadyMember
                ? `Already a member as ${name || 'you'}. Hop straight in.`
                : `${preview.member_count} ${preview.member_count === 1 ? 'person' : 'people'} in so far · come pick a spot`}
            </div>

            {alreadyMember && (
              // Skip the form entirely when the device's user_id is
              // already in this group's members. Re-opening the invite
              // link from the same phone now just re-enters the group.
              <PrimaryButton
                vibe={vibe}
                tone="terracotta"
                onClick={() => onJoined({
                  id: preview.id,
                  name: preview.name,
                  invite_token: preview.invite_token,
                  my_display_name: name || window.PLOT_API.getDisplayName() || 'You',
                })}
              >
                Continue →
              </PrimaryButton>
            )}

            {!alreadyMember && <>
            <div style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: 12, fontWeight: 600,
              color: pal.inkMute,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}>
              your name
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              autoFocus
              style={{
                width: '100%',
                padding: '12px 0',
                background: 'transparent',
                border: 'none',
                borderBottom: `1.5px solid ${pal.line}`,
                fontFamily: 'Inter, sans-serif',
                fontSize: 22, fontWeight: 500,
                color: pal.ink,
                outline: 'none',
                marginBottom: 24,
                boxSizing: 'border-box',
              }}
            />

            {joinError && (
              <div style={{
                padding: 12,
                borderRadius: T2.radii.md,
                background: pal.terracottaL,
                color: pal.terracottaD,
                fontFamily: 'Inter, sans-serif',
                fontSize: 12,
                marginBottom: 16,
              }}>
                {joinError}
              </div>
            )}

            <PrimaryButton
              vibe={vibe}
              tone="terracotta"
              onClick={handleJoin}
              disabled={!name.trim() || joining}
            >
              {joining ? 'Joining…' : `Join ${preview.name} →`}
            </PrimaryButton>
            </>}
          </>
        )}
      </div>
    </ScreenShell>
  );
}

// ─────────────────────────────────────────────────────────────
// Waiting Room — group lobby. Polls group state via the parent's effect,
// shows who's set their prefs vs who's still picking, and exposes the
// "Get our recs" CTA. The copy is intentionally friend-group casual,
// not corporate.
// ─────────────────────────────────────────────────────────────
function WaitingRoomScreen({ vibe, currentGroup, lobbyState, onTriggerRecs, onBack, loading }) {
  const pal = T2.palette;
  const [copied, setCopied] = useState(false);

  const members = (lobbyState && lobbyState.members) || [];
  const ready = members.filter((m) => m.prefs && m.prefs.categories && m.prefs.categories.length);
  const stillPicking = members.filter((m) => !m.prefs || !m.prefs.categories || !m.prefs.categories.length);
  const allReady = members.length > 0 && stillPicking.length === 0;
  const enoughReady = ready.length >= 1;
  const myUserId = window.PLOT_API.getUserId();

  // Adaptive header — different copy depending on lobby state.
  // Order matters: most specific case first.
  let headline = 'Lobby';
  let subline = 'Send the link if you haven\'t already.';
  if (members.length === 0) {
    headline = 'Group\'s quiet…';
    subline = 'Send the link to the crew.';
  } else if (members.length === 1 && ready.length === 1 && ready[0].user_id === myUserId) {
    headline = 'You\'re first in.';
    subline = 'Where is everyone?';
  } else if (allReady && ready.length === 1) {
    headline = 'All set.';
    subline = 'You\'re solo for now — fire it up or wait for the gang.';
  } else if (allReady) {
    headline = 'Everyone\'s in.';
    subline = 'Pick a spot together.';
  } else if (stillPicking.length === 1) {
    const name = stillPicking[0].display_name || 'them';
    headline = `Just waiting on ${name}…`;
    subline = `(always the last one)`;
  } else if (stillPicking.length > 1) {
    headline = `${stillPicking.length} more to pick.`;
    subline = "Send 'em a poke.";
  }

  const shareUrl = currentGroup
    ? `${window.location.origin}${window.location.pathname}?join=${encodeURIComponent(currentGroup.invite_token)}`
    : '';

  async function handleCopy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch (e) { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleShare() {
    if (!shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${currentGroup.name} on Plot`,
          text: 'come pick a spot with us',
          url: shareUrl,
        });
      } catch (e) { /* user cancelled */ }
    } else {
      handleCopy();
    }
  }

  return (
    <ScreenShell
      vibe={vibe}
      bg={pal.cream}
      padTop={50}
      padBottom={enoughReady ? 100 : 40}
      footer={enoughReady ? (
        <PrimaryButton
          vibe={vibe}
          tone={allReady ? 'terracotta' : 'ink'}
          onClick={onTriggerRecs}
          disabled={loading}
        >
          {loading
            ? 'Asking the LLM…'
            : allReady
              ? 'Get our recs →'
              : `Pick anyway · ${ready.length} ready →`}
        </PrimaryButton>
      ) : null}
    >
      <div style={{ padding: '8px 24px 0', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={onBack} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: 4, color: pal.ink, fontSize: 22, fontFamily: 'inherit',
        }}>←</button>
        <SectionLabel vibe={vibe}>{currentGroup ? currentGroup.name : 'Lobby'}</SectionLabel>
      </div>

      <div style={{ padding: '0 24px' }}>
        <div style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: 32, fontWeight: 500,
          letterSpacing: '-0.02em',
          color: pal.ink,
          lineHeight: 1.1,
          textWrap: 'pretty',
          marginBottom: 6,
        }}>
          {headline}
        </div>
        <div style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: 14, color: pal.inkSoft,
          marginBottom: 28,
        }}>
          {subline}
        </div>

        {/* Member list — ready members with a green dot, still-picking with a pulsing one */}
        {members.length > 0 && (
          <>
            <SectionLabel vibe={vibe}>{members.length} in the group</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {members.map((m) => {
                const isReady = m.prefs && m.prefs.categories && m.prefs.categories.length;
                const isYou = m.user_id === myUserId;
                const colors = ['terracotta', 'sage', 'lilac', 'peach'];
                const color = colors[Math.abs(_hashStr(m.user_id)) % colors.length];
                return (
                  <div key={m.user_id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px',
                    borderRadius: T2.radii.md,
                    background: isReady ? pal.sageL : pal.creamSoft,
                    border: `1px solid ${isReady ? pal.sage : pal.line}`,
                  }}>
                    <Avatar name={m.display_name} color={color} size={36} vibe={vibe} />
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontFamily: 'Inter, sans-serif',
                        fontSize: 15, fontWeight: 500,
                        color: pal.ink,
                      }}>{m.display_name}{isYou ? ' (you)' : ''}</div>
                      <div style={{
                        fontFamily: 'Inter, sans-serif',
                        fontSize: 12,
                        color: isReady ? pal.sageD : pal.inkMute,
                      }}>
                        {isReady ? 'ready' : 'still picking…'}
                      </div>
                    </div>
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: isReady ? pal.sageD : pal.peachD,
                      animation: isReady ? 'none' : 'plotpulse 1.6s ease-in-out infinite',
                    }} />
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Share-link reminder so people can keep adding friends from the lobby */}
        {currentGroup && (
          <>
            <SectionLabel vibe={vibe}>Share the link again</SectionLabel>
            <div style={{
              padding: 14,
              borderRadius: T2.radii.lg,
              background: pal.creamSoft,
              border: `1.5px solid ${pal.line}`,
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}>
              <div style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 11,
                color: pal.ink,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                flex: 1,
              }}>{shareUrl}</div>
              <button
                onClick={handleCopy}
                style={{
                  padding: '6px 12px',
                  borderRadius: T2.radii.pill,
                  border: `1.5px solid ${pal.ink}`,
                  background: copied ? pal.sage : pal.cream,
                  color: copied ? pal.cream : pal.ink,
                  fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', flexShrink: 0,
                }}>{copied ? '✓' : 'copy'}</button>
            </div>
            <button
              onClick={handleShare}
              style={{
                width: '100%',
                padding: '10px 0',
                borderRadius: T2.radii.pill,
                border: `1.5px solid ${pal.ink}`,
                background: 'transparent',
                color: pal.ink,
                fontFamily: 'Inter, sans-serif',
                fontSize: 13, fontWeight: 600,
                cursor: 'pointer',
                marginBottom: 12,
              }}>Send via Messages / WhatsApp</button>
          </>
        )}
      </div>

      {/* Pulse animation for the "still picking" status dot */}
      <style>{`
        @keyframes plotpulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.3); }
        }
      `}</style>
    </ScreenShell>
  );
}

// Tiny hash so member colors stay stable across renders without
// importing a real hash library.
function _hashStr(s) {
  let h = 0;
  for (let i = 0; i < (s || '').length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h;
}

function AuthScreen({ vibe, onContinue }) {
  const pal = T2.palette;
  // Looks like a real login: email + password + sign in / sign up tabs.
  // Doesn't actually validate the password — it's stored locally as a
  // cosmetic session marker for the demo. Profile fields (name / DOB /
  // pronouns / avatar) are collected on a separate post-auth screen.
  const existingSession = (typeof window !== 'undefined' && window.PLOT_API.getSession()) || null;
  const [mode, setMode] = useState('signin');                       // 'signin' | 'signup'
  const [email, setEmail] = useState(existingSession?.email || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const validPassword = password.length >= 6;
  const canSubmit = validEmail && validPassword && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    // No server round-trip yet — just persist the session locally.
    // When real Supabase Auth lands, this becomes:
    //   await supabase.auth.signInWithPassword({email, password})
    // and we read the JWT-derived user_id from the session.
    window.PLOT_API.setSession(email.trim());
    setSubmitting(false);
    onContinue();
  }

  return (
    <ScreenShell vibe={vibe} bg={pal.cream}>
      <div style={{
        position: 'relative',
        height: 'calc(100% - 40px)',
        overflow: 'hidden',
      }}>
        {/* ── Decorative organic blobs ───────────────────────────── */}
        {/* Top-right terracotta blob */}
        <svg viewBox="0 0 220 220" style={{
          position: 'absolute', top: -70, right: -55,
          width: 240, height: 240, zIndex: 0, pointerEvents: 'none',
        }}>
          <path d="M 130 10 C 200 20, 230 80, 200 140 C 175 195, 95 200, 60 165 C 30 130, 50 70, 95 35 C 110 22, 120 14, 130 10 Z"
                fill={pal.terracotta} />
        </svg>

        {/* Left lilac blob */}
        <svg viewBox="0 0 200 280" style={{
          position: 'absolute', top: 90, left: -90,
          width: 180, height: 240, zIndex: 0, pointerEvents: 'none',
        }}>
          <path d="M 100 20 C 160 30, 195 110, 175 180 C 155 245, 80 265, 40 230 C 5 195, 5 95, 40 50 C 60 28, 80 18, 100 20 Z"
                fill={pal.lilac} opacity="0.55" />
        </svg>

        {/* Decorative spark marks (right side, near top) */}
        <svg width="38" height="38" viewBox="0 0 34 34" style={{
          position: 'absolute', top: 96, right: 36, zIndex: 1,
        }}>
          <line x1="6" y1="20" x2="14" y2="12" stroke={pal.ink} strokeWidth="2.5" strokeLinecap="round" />
          <line x1="14" y1="22" x2="22" y2="14" stroke={pal.ink} strokeWidth="2.5" strokeLinecap="round" />
          <line x1="22" y1="24" x2="30" y2="16" stroke={pal.ink} strokeWidth="2.5" strokeLinecap="round" />
        </svg>

        {/* Wordmark — top left */}
        <div style={{
          position: 'absolute',
          top: 56, left: 24,
          zIndex: 3,
        }}>
          <PlotWordmark size={52} ink={pal.ink} terracotta={pal.terracotta} vibe={vibe} />
        </div>

        {/* Tagline — sits in the cream zone, above the photo */}
        <div style={{
          position: 'absolute',
          top: 134, left: 24, right: 80,
          zIndex: 3,
          fontFamily: 'Inter, sans-serif',
          fontSize: 26,
          fontWeight: 500,
          letterSpacing: '-0.025em',
          color: pal.ink,
          lineHeight: 1.1,
          textWrap: 'balance',
        }}>
          Plan with your people, in two taps.
        </div>

        {/* tiny meta line */}
        <div style={{
          position: 'absolute',
          top: 230, left: 24,
          zIndex: 3,
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 10,
          color: pal.inkSoft,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}>
          sf · friend group hangouts
        </div>

        {/* ── SF skyline silhouette — inline SVG so it never 404s.
              Reads as an intentional editorial illustration (Golden
              Gate Bridge + downtown silhouette + bay) rather than a
              missing photo placeholder. Fills the bottom ~60% of the
              splash like the original photo did. ──────────────────── */}
        <div style={{
          position: 'absolute',
          left: 0, right: 0, bottom: 0,
          top: 280,
          zIndex: 1,
          overflow: 'hidden',
        }}>
          {/* Sky gradient — peachy SF golden-hour */}
          <div style={{
            position: 'absolute', inset: 0,
            background: `linear-gradient(to bottom, ${pal.peachL} 0%, ${pal.terracottaL} 55%, ${pal.cream} 100%)`,
            maskImage: 'linear-gradient(to bottom, transparent 0%, black 18%, black 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 18%, black 100%)',
          }} />
          {/* Skyline + bridge silhouette */}
          <svg
            viewBox="0 0 375 360"
            preserveAspectRatio="xMidYEnd slice"
            style={{
              position: 'absolute',
              left: 0, right: 0, bottom: 0,
              width: '100%', height: '100%',
              display: 'block',
            }}
            aria-label="San Francisco skyline at golden hour">
            {/* Faint sun disc */}
            <circle cx="295" cy="120" r="42" fill={pal.peach} opacity="0.55" />
            {/* Hills behind */}
            <path d="M0 240 C 60 200, 120 215, 180 220 C 240 225, 300 195, 375 215 L 375 360 L 0 360 Z"
                  fill={pal.sage} opacity="0.55" />
            {/* Closer rolling hills */}
            <path d="M0 270 C 50 240, 110 255, 175 260 C 250 268, 310 245, 375 260 L 375 360 L 0 360 Z"
                  fill={pal.sageD} opacity="0.7" />
            {/* Golden Gate Bridge — left tower + cables */}
            <g fill={pal.terracottaD} stroke={pal.terracottaD}>
              <rect x="40" y="180" width="6" height="120" />
              <rect x="34" y="178" width="18" height="6" />
              <rect x="34" y="200" width="18" height="6" />
              <path d="M46 184 Q 100 226, 155 234" stroke={pal.terracottaD} strokeWidth="2" fill="none" />
              <path d="M46 230 L 155 254" stroke={pal.terracottaD} strokeWidth="1.5" fill="none" />
              {/* Right tower */}
              <rect x="155" y="220" width="5" height="80" />
              <rect x="151" y="219" width="13" height="5" />
              <rect x="151" y="236" width="13" height="5" />
              {/* Bridge deck */}
              <rect x="0" y="296" width="375" height="3" />
            </g>
            {/* Downtown buildings — boxy abstract */}
            <g fill={pal.ink}>
              <rect x="195" y="240" width="14" height="60" />
              <rect x="212" y="225" width="11" height="75" />
              <rect x="226" y="232" width="12" height="68" />
              <rect x="241" y="218" width="14" height="82" />
              <rect x="258" y="244" width="9" height="56" />
              <rect x="270" y="228" width="13" height="72" />
              <rect x="286" y="248" width="10" height="52" />
              <rect x="299" y="222" width="14" height="78" />
              <rect x="316" y="240" width="11" height="60" />
              <rect x="330" y="232" width="13" height="68" />
              <rect x="346" y="246" width="11" height="54" />
              {/* Coit Tower-ish little tower */}
              <rect x="178" y="234" width="8" height="66" />
              <circle cx="182" cy="232" r="5" />
            </g>
            {/* Tiny window dots warm-lit */}
            <g fill={pal.peach}>
              {[
                [200,260],[202,275],[218,250],[218,270],[230,255],[230,275],
                [246,238],[246,260],[246,280],[262,265],[275,260],[275,280],
                [290,272],[305,245],[305,275],[321,260],[336,250],[336,275],[350,270],
                [180,250],[182,272],
              ].map(([x,y], i) => <rect key={i} x={x} y={y} width="2" height="2" />)}
            </g>
            {/* Bay water glints */}
            <g stroke={pal.cream} strokeWidth="1" opacity="0.45">
              <line x1="20" y1="320" x2="55" y2="320" />
              <line x1="80" y1="335" x2="120" y2="335" />
              <line x1="160" y1="328" x2="195" y2="328" />
              <line x1="220" y1="338" x2="255" y2="338" />
              <line x1="280" y1="325" x2="320" y2="325" />
            </g>
          </svg>
        </div>

        {/* Decorative bottom-left peach blob (in front of photo) */}
        <svg viewBox="0 0 200 160" style={{
          position: 'absolute', bottom: -25, left: -45,
          width: 140, height: 110, zIndex: 3, pointerEvents: 'none',
          opacity: 0.85,
        }}>
          <path d="M 30 30 C 80 10, 150 20, 170 70 C 185 110, 145 145, 90 145 C 40 145, 5 110, 15 70 C 18 50, 22 38, 30 30 Z"
                fill={pal.peachL} />
          <g fill={pal.ink} opacity="0.55">
            {[0,1,2,3].map(r => [0,1,2,3].map(c => (
              <circle key={`${r}-${c}`} cx={40 + c*14} cy={70 + r*14} r="1.6" />
            )))}
          </g>
        </svg>

        {/* Bottom-right sage blob */}
        <svg viewBox="0 0 200 160" style={{
          position: 'absolute', bottom: -45, right: -50,
          width: 140, height: 110, zIndex: 3, pointerEvents: 'none',
          opacity: 0.9,
        }}>
          <path d="M 50 30 C 100 15, 170 30, 175 80 C 180 130, 130 150, 80 145 C 30 140, 5 100, 20 65 C 28 48, 38 35, 50 30 Z"
                fill={pal.sage} />
        </svg>

        {/* ── Compact form pill at very bottom ───────────────────── */}
        <div style={{
          position: 'absolute',
          left: 16, right: 16,
          bottom: 22,
          zIndex: 5,
        }}>
          {/* Compact frosted card with three fields. Stacks vertically so
              it stays readable on small phones; matches the splash visual
              language the rest of the screen has. */}
          <div style={{
            padding: 14,
            background: 'rgba(248,245,239,0.95)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            borderRadius: T2.radii.lg,
            border: `1.5px solid ${pal.ink}`,
            boxShadow: vibe === 'playful'
              ? `4px 4px 0 ${pal.ink}`
              : '0 8px 24px rgba(42,36,32,0.22)',
            transform: vibe === 'playful' ? 'rotate(-0.5deg)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}>
            {/* Sign in / Sign up tabs — purely cosmetic right now since
                the underlying flow is the same for both, but visually
                this matches what users expect from a real auth screen. */}
            <div style={{
              display: 'flex', gap: 4, padding: 3,
              background: 'rgba(0,0,0,0.04)',
              borderRadius: T2.radii.pill,
              marginBottom: 4,
            }}>
              {['signin', 'signup'].map((m) => {
                const active = mode === m;
                return (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    style={{
                      flex: 1, height: 32,
                      borderRadius: T2.radii.pill,
                      border: 'none',
                      background: active ? pal.cream : 'transparent',
                      color: active ? pal.ink : pal.inkSoft,
                      fontFamily: 'Inter, sans-serif',
                      fontSize: 12, fontWeight: 600,
                      letterSpacing: '0.02em',
                      boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                    }}>
                    {m === 'signin' ? 'Sign in' : 'Sign up'}
                  </button>
                );
              })}
            </div>

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              autoFocus
              autoComplete="email"
              style={{
                width: '100%',
                height: 44,
                padding: '0 12px',
                background: pal.cream,
                border: `1px solid ${pal.line}`,
                borderRadius: T2.radii.md,
                fontFamily: 'Inter, sans-serif',
                fontSize: 15, fontWeight: 500, color: pal.ink,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password (min 6 chars)"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              style={{
                width: '100%',
                height: 44,
                padding: '0 12px',
                background: pal.cream,
                border: `1px solid ${pal.line}`,
                borderRadius: T2.radii.md,
                fontFamily: 'Inter, sans-serif',
                fontSize: 15, fontWeight: 500, color: pal.ink,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />

            {error && (
              <div style={{
                fontFamily: 'Inter, sans-serif',
                fontSize: 11,
                color: pal.terracottaD,
              }}>
                {error}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              style={{
                width: '100%',
                height: 46,
                background: canSubmit ? pal.terracotta : pal.line,
                color: canSubmit ? pal.cream : pal.inkMute,
                border: 'none',
                borderRadius: T2.radii.pill,
                fontFamily: 'Inter, sans-serif',
                fontSize: 15, fontWeight: 600,
                cursor: canSubmit ? 'pointer' : 'default',
              }}>
              {submitting
                ? (mode === 'signin' ? 'Signing in…' : 'Creating account…')
                : (mode === 'signin' ? 'Sign in →' : 'Create account →')}
            </button>

            <div style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: 11,
              color: pal.inkMute,
              textAlign: 'center',
              marginTop: 2,
            }}>
              {mode === 'signin'
                ? <span>Forgot password? <span style={{ textDecoration: 'underline', cursor: 'pointer' }}>Reset</span></span>
                : <span>By continuing you agree to be a fun friend.</span>}
            </div>
          </div>

        </div>
      </div>
    </ScreenShell>
  );
}


// ─────────────────────────────────────────────────────────────
// 1b. ProfileSetupScreen — shown once, right after a first-time
// sign-up, to collect the user's name, pronouns, DOB, and (optional)
// avatar. Subsequent edits happen on the regular ProfileScreen.
// ─────────────────────────────────────────────────────────────
function ProfileSetupScreen({ vibe, onContinue }) {
  const pal = T2.palette;
  const existing = window.PLOT_API.getLocalProfile() || {};
  const [name, setName] = useState(existing.name || window.PLOT_API.getDisplayName() || '');
  const [pronouns, setPronouns] = useState(existing.pronouns || '');
  const [dob, setDob] = useState(existing.date_of_birth || '');
  const [avatar, setAvatar] = useState(existing.avatar || null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = React.useRef(null);

  function pickPhoto() {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  }

  async function onPhotoChosen(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const dataURL = await window.PLOT_API.compressImageFile(file, 480, 0.78);
      setAvatar(dataURL);
    } catch (err) { /* ignore — keep existing avatar */ }
  }

  async function handleSubmit() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await window.PLOT_API.saveProfile({
        name: name.trim(),
        pronouns: pronouns || null,
        date_of_birth: dob || null,
        avatar: avatar || null,
      });
    } catch (e) { /* saveProfile is itself best-effort */ }
    setSaving(false);
    onContinue();
  }

  return (
    <ScreenShell vibe={vibe} bg={pal.cream} padTop={50}>
      <div style={{ padding: '8px 24px 0', marginBottom: 24 }}>
        <SectionLabel vibe={vibe}>Welcome to Plot</SectionLabel>
      </div>

      <div style={{ padding: '0 24px' }}>
        <div style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: 30, fontWeight: 500,
          letterSpacing: '-0.02em', color: pal.ink,
          lineHeight: 1.1, marginBottom: 6,
        }}>
          Tell us about you.
        </div>
        <div style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: 14, color: pal.inkSoft, marginBottom: 28,
        }}>
          This is how your friends will see you in the group.
        </div>

        {/* Avatar — tap to upload */}
        <div style={{
          display: 'flex', justifyContent: 'center', marginBottom: 22,
        }}>
          <button
            onClick={pickPhoto}
            aria-label="Add a profile photo"
            style={{
              width: 96, height: 96, borderRadius: '50%',
              border: `2px dashed ${avatar ? 'transparent' : pal.terracotta}`,
              background: avatar ? pal.cream : pal.terracottaL,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0, overflow: 'hidden',
              boxShadow: avatar ? '0 4px 12px rgba(42,36,32,0.10)' : 'none',
            }}>
            {avatar ? (
              <img src={avatar} alt="Your photo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{
                fontFamily: 'Inter, sans-serif',
                fontSize: 11, fontWeight: 600,
                color: pal.terracottaD,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}>+ Photo</span>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="user"
            onChange={onPhotoChosen}
            style={{ display: 'none' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoFocus
            maxLength={80}
            style={{
              width: '100%', height: 46, padding: '0 14px',
              background: pal.cream, border: `1px solid ${pal.line}`,
              borderRadius: T2.radii.md,
              fontFamily: 'Inter, sans-serif', fontSize: 16, fontWeight: 500,
              color: pal.ink, outline: 'none', boxSizing: 'border-box',
            }}
          />
          <select
            value={pronouns}
            onChange={(e) => setPronouns(e.target.value)}
            style={{
              width: '100%', height: 46, padding: '0 12px',
              background: pal.cream, border: `1px solid ${pal.line}`,
              borderRadius: T2.radii.md,
              fontFamily: 'Inter, sans-serif', fontSize: 14, color: pal.ink,
              outline: 'none', boxSizing: 'border-box',
            }}>
            <option value="">Pronouns (optional)</option>
            <option value="she/her">she/her</option>
            <option value="he/him">he/him</option>
            <option value="they/them">they/them</option>
            <option value="prefer not to say">prefer not to say</option>
          </select>
          <input
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            placeholder="Birthday (optional)"
            style={{
              width: '100%', height: 46, padding: '0 12px',
              background: pal.cream, border: `1px solid ${pal.line}`,
              borderRadius: T2.radii.md,
              fontFamily: 'Inter, sans-serif', fontSize: 14, color: pal.ink,
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginTop: 28 }}>
          <PrimaryButton
            vibe={vibe}
            tone="terracotta"
            onClick={handleSubmit}
            disabled={!name.trim() || saving}
          >
            {saving ? 'Saving…' : 'Continue →'}
          </PrimaryButton>
        </div>
      </div>
    </ScreenShell>
  );
}


// ─────────────────────────────────────────────────────────────
// 2. Home — list of groups
// ─────────────────────────────────────────────────────────────
function HomeScreen({ vibe, currentGroup, onOpenGroup, onCreate, onProfile }) {
  const pal = T2.palette;
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const myUserId = window.PLOT_API.getUserId();

  // Fetch the user's real groups from the backend on mount and whenever
  // currentGroup changes (creating / joining one bumps the list). Failures
  // fall back to "no groups yet" rather than blocking the screen.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    window.PLOT_API.listMyGroups()
      .then((res) => { if (!cancelled) { setGroups(res.groups || []); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(String(e.message || e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [currentGroup && currentGroup.id]);

  // Remove a group from this user's view. Creators get a destructive
  // "Delete for everyone" path (backend enforces 403 if user_id mismatch);
  // non-creators get the softer "Leave" path that only removes their
  // group_members row. Both are confirmed with a native prompt and
  // optimistically remove the card before the API call lands.
  async function handleRemove(g, evt) {
    evt.stopPropagation();
    const isCreator = g.created_by === myUserId;
    const promptText = isCreator
      ? `Delete "${g.name}"? This removes the group for everyone — can't be undone.`
      : `Leave "${g.name}"? You'll stop seeing it on your Plans tab.`;
    if (!window.confirm(promptText)) return;
    setDeletingId(g.id);
    const prev = groups;
    setGroups((s) => s.filter((x) => x.id !== g.id));
    try {
      if (isCreator) {
        await window.PLOT_API.deleteGroup(g.id);
        try { window.plotToast && window.plotToast(`Deleted "${g.name}"`, 'success'); } catch (e) { /* ignore */ }
      } else {
        await window.PLOT_API.leaveGroup(g.id);
        try { window.plotToast && window.plotToast(`Left "${g.name}"`, 'info'); } catch (e) { /* ignore */ }
      }
    } catch (e) {
      setGroups(prev);
      try { window.plotToast && window.plotToast(`Couldn't ${isCreator ? 'delete' : 'leave'} group`, 'error'); } catch (er) { /* ignore */ }
    } finally {
      setDeletingId(null);
    }
  }

  function handleOpen(g) {
    // Set this as the active group and route into the prefs flow.
    onOpenGroup({
      id: g.id,
      name: g.name,
      invite_token: g.invite_token,
      my_display_name: window.PLOT_API.getDisplayName() || 'You',
    });
  }

  return (
    <ScreenShell vibe={vibe} bg={pal.cream} padTop={50} padBottom={96}>
      {/* Top bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 24px 20px',
      }}>
        <PlotWordmark size={26} ink={pal.ink} terracotta={pal.terracotta} vibe={vibe} />
        <button
          onClick={onProfile}
          style={{
            width: 36, height: 36, borderRadius: T2.radii.pill,
            background: pal.terracottaL, color: pal.terracottaD,
            border: `1.5px solid ${pal.terracotta}`,
            fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600,
            cursor: 'pointer',
          }}>{(window.PLOT_API.getDisplayName() || 'Y').slice(0, 1).toUpperCase()}</button>
      </div>

      <div style={{ padding: '0 24px' }}>
        <SectionLabel vibe={vibe}>Your groups</SectionLabel>

        {loading && (
          <div style={{
            padding: 24, textAlign: 'center',
            fontFamily: 'Inter, sans-serif', fontSize: 13, color: pal.inkSoft,
          }}>Pulling your plans…</div>
        )}

        {!loading && error && (
          <div style={{
            padding: 16, borderRadius: T2.radii.md,
            background: pal.terracottaL, color: pal.terracottaD,
            fontFamily: 'Inter, sans-serif', fontSize: 12,
            marginBottom: 12,
          }}>
            Couldn't load your groups — {error}
          </div>
        )}

        {!loading && !error && groups.length === 0 && (
          <div style={{
            padding: 24,
            borderRadius: T2.radii.md,
            background: pal.creamSoft,
            border: `1px dashed ${pal.line}`,
            color: pal.inkSoft,
            fontFamily: 'Inter, sans-serif', fontSize: 13,
            textAlign: 'center',
            marginBottom: 12,
          }}>
            ✨ Your plans live here. Tap "new group" below and round up the crew.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {groups.map((g) => {
            const isActive = currentGroup && currentGroup.id === g.id;
            return (
              <button
                key={g.id}
                onClick={() => handleOpen(g)}
                style={{
                  position: 'relative',
                  textAlign: 'left',
                  padding: '14px 16px',
                  paddingRight: 48,
                  background: isActive ? pal.terracottaL : pal.creamSoft,
                  border: `1px solid ${isActive ? pal.terracotta : pal.line}`,
                  borderRadius: T2.radii.lg,
                  cursor: 'pointer',
                  boxShadow: vibe === 'playful' ? `3px 3px 0 ${pal.ink}` : 'none',
                  transform: vibe === 'playful' ? 'rotate(-0.2deg)' : 'none',
                  fontFamily: 'inherit',
                  width: '100%',
                }}>
                {/* Avatar-left / content-right row. Mail / Slack pattern. */}
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <GroupAvatar name={g.name} size={44} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{
                        fontFamily: 'Inter, sans-serif',
                        fontSize: 17, fontWeight: 600,
                        letterSpacing: '-0.01em',
                        color: pal.ink,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>{g.name}</div>
                      {isActive && (
                        <div style={{
                          padding: '3px 8px',
                          borderRadius: T2.radii.pill,
                          background: pal.terracotta,
                          color: pal.cream,
                          fontFamily: '"JetBrains Mono", monospace',
                          fontSize: 9, fontWeight: 600,
                          letterSpacing: '0.06em', textTransform: 'uppercase',
                          flexShrink: 0,
                        }}>active</div>
                      )}
                    </div>
                    <div style={{
                      marginTop: 4,
                      fontFamily: 'Inter, sans-serif', fontSize: 12,
                      color: pal.inkSoft,
                    }}>
                      {g.member_count} member{g.member_count === 1 ? '' : 's'}
                      {g.last_rec_id ? ' · planning a hangout' : ' · no recs yet'}
                    </div>
                    {/* Simple date chip — lives inside the content column
                        so it lines up under the member-count line, not under
                        the avatar. */}
                    {g.event_date && (() => {
                      const [yy, mm, dd] = g.event_date.split('-').map(Number);
                      const event = new Date(yy, mm - 1, dd);
                      const opts = event.getFullYear() === new Date().getFullYear()
                        ? { weekday: 'short', month: 'short', day: 'numeric' }
                        : { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
                      const label = event.toLocaleDateString(undefined, opts);
                      return (
                        <div style={{
                          marginTop: 6,
                          display: 'inline-block',
                          padding: '3px 9px',
                          borderRadius: T2.radii.pill,
                          background: pal.lilacL || pal.creamSoft,
                          color: pal.lilacD || pal.inkSoft,
                          fontFamily: 'Inter, sans-serif',
                          fontSize: 11,
                          fontWeight: 600,
                          letterSpacing: '0.01em',
                        }}>📅 {label}</div>
                      );
                    })()}
                  </div>
                </div>
                {/* Remove button — always visible. Creators get destructive
                    delete (removes for everyone); other members get the
                    softer leave (removes themselves only). Stops the click
                    bubbling so tapping it doesn't ALSO open the group. */}
                {(() => {
                  const isCreator = g.created_by === myUserId;
                  return (
                    <button
                      onClick={(evt) => handleRemove(g, evt)}
                      disabled={deletingId === g.id}
                      aria-label={isCreator ? `Delete ${g.name}` : `Leave ${g.name}`}
                      title={isCreator ? 'Delete group (you created it)' : 'Leave group'}
                      style={{
                        position: 'absolute',
                        top: 10,
                        right: 10,
                        width: 30, height: 30,
                        borderRadius: T2.radii.pill,
                        border: `1px solid ${pal.line}`,
                        background: pal.creamSoft,
                        color: pal.inkSoft,
                        fontFamily: 'inherit',
                        fontSize: 15,
                        lineHeight: 1,
                        cursor: deletingId === g.id ? 'wait' : 'pointer',
                        opacity: deletingId === g.id ? 0.4 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                      }}>{isCreator ? '🗑' : '↗'}</button>
                  );
                })()}
              </button>
            );
          })}
        </div>

        {/* Create CTA */}
        <button
          onClick={onCreate}
          style={{
            width: '100%',
            marginTop: 14,
            padding: 18,
            border: `1.5px dashed ${pal.terracotta}`,
            borderRadius: T2.radii.lg,
            background: 'transparent',
            color: pal.terracottaD,
            fontFamily: 'Inter, sans-serif',
            fontSize: 15, fontWeight: 600,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
          <span style={{ fontSize: 18 }}>＋</span> new group
        </button>
      </div>
    </ScreenShell>
  );
}

// ─────────────────────────────────────────────────────────────
// 3. Create + Invite Group
// ─────────────────────────────────────────────────────────────
function CreateGroupScreen({ vibe, onBack, onCreated }) {
  const pal = T2.palette;
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState(() => window.PLOT_API.getDisplayName());
  const [eventDate, setEventDate] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);   // {id, name, invite_token, event_date}
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  // The native date picker needs `today` as its min value so users can't
  // schedule a hangout in the past. Computed once at mount.
  const todayISO = new Date().toISOString().slice(0, 10);

  // Build the public share URL from the invite_token. We point at this
  // exact deployed UI (whatever origin the user is on right now) so the
  // link works regardless of which Cloud Run revision is live.
  const shareUrl = created
    ? `${window.location.origin}${window.location.pathname}?join=${encodeURIComponent(created.invite_token)}`
    : '';

  async function handleCreate() {
    if (!name.trim() || !displayName.trim() || creating) return;
    setCreating(true);
    setError(null);
    const trimmedName = name.trim();
    const trimmedDisplay = displayName.trim();
    window.PLOT_API.setDisplayName(trimmedDisplay);
    try {
      const g = await window.PLOT_API.createGroup(trimmedName, trimmedDisplay, eventDate || null);
      setCreated(g);
      try { window.plotToast && window.plotToast(`"${g.name}" created — share the invite!`, 'success'); } catch (e) { /* ignore */ }
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setCreating(false);
    }
  }

  async function handleCopy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch (e) {
      // clipboard API blocked — fall back to a temp textarea
      const ta = document.createElement('textarea');
      ta.value = shareUrl;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e2) { /* give up */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // Native share sheet (iOS/Android). Falls back to copy if unavailable.
  async function handleShare() {
    if (!shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${created.name} on Plot`,
          text: `${displayName} invited you to plan a hangout.`,
          url: shareUrl,
        });
      } catch (e) { /* user cancelled — no-op */ }
    } else {
      handleCopy();
    }
  }

  function handleContinue() {
    if (!created) return;
    onCreated({
      id: created.id,
      name: created.name,
      invite_token: created.invite_token,
      my_display_name: displayName.trim(),
    });
  }

  return (
    <ScreenShell vibe={vibe} bg={pal.cream} padTop={50}>
      <div style={{ padding: '8px 24px 0', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: 4, color: pal.ink, fontSize: 22, fontFamily: 'inherit',
        }}>←</button>
        <SectionLabel vibe={vibe}>{created ? 'Group ready' : 'New group'}</SectionLabel>
      </div>

      <div style={{ padding: '0 24px' }}>
        {!created ? (
          <>
            <div style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: 12, fontWeight: 600,
              color: pal.inkMute,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}>group name</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sunday Soft Life"
              autoFocus
              maxLength={80}
              style={{
                width: '100%',
                padding: '12px 0 8px',
                background: 'transparent',
                border: 'none',
                borderBottom: `1.5px solid ${pal.line}`,
                fontFamily: 'Inter, sans-serif',
                fontSize: 26, fontWeight: 500,
                letterSpacing: '-0.02em', color: pal.ink,
                outline: 'none',
                marginBottom: 24,
                boxSizing: 'border-box',
              }}
            />

            <div style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: 12, fontWeight: 600,
              color: pal.inkMute,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}>your name</div>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your name"
              maxLength={40}
              style={{
                width: '100%',
                padding: '10px 0',
                background: 'transparent',
                border: 'none',
                borderBottom: `1.5px solid ${pal.line}`,
                fontFamily: 'Inter, sans-serif',
                fontSize: 18, fontWeight: 500,
                color: pal.ink,
                outline: 'none',
                marginBottom: 24,
                boxSizing: 'border-box',
              }}
            />

            <div style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: 12, fontWeight: 600,
              color: pal.inkMute,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}>when's the hangout? <span style={{ textTransform: 'none', fontSize: 11, fontWeight: 400, opacity: 0.7 }}>(optional)</span></div>
            <input
              type="date"
              value={eventDate}
              min={todayISO}
              onChange={(e) => setEventDate(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 0',
                background: 'transparent',
                border: 'none',
                borderBottom: `1.5px solid ${pal.line}`,
                fontFamily: 'Inter, sans-serif',
                fontSize: 18, fontWeight: 500,
                color: pal.ink,
                outline: 'none',
                marginBottom: 24,
                boxSizing: 'border-box',
                // iOS Safari styles the placeholder as light grey by default;
                // override so it matches the rest of the form when empty.
                colorScheme: 'light',
              }}
            />

            {error && (
              <div style={{
                padding: 12,
                borderRadius: T2.radii.md,
                background: pal.terracottaL,
                color: pal.terracottaD,
                fontFamily: 'Inter, sans-serif',
                fontSize: 12,
                marginBottom: 16,
              }}>
                {error}
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: 28, fontWeight: 500,
              letterSpacing: '-0.02em',
              color: pal.ink,
              lineHeight: 1.1,
              marginBottom: 6,
            }}>
              {created.name}
            </div>
            <div style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: 13, color: pal.inkSoft, marginBottom: 22,
            }}>
              Send this to your usual suspects. They tap the link, type their name, in.
            </div>

            <SectionLabel vibe={vibe}>Share link</SectionLabel>
            <div style={{
              padding: 14,
              borderRadius: T2.radii.lg,
              background: pal.creamSoft,
              border: `1.5px solid ${pal.line}`,
              marginBottom: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              transform: vibe === 'playful' ? 'rotate(-0.4deg)' : 'none',
              boxShadow: vibe === 'playful' ? `3px 3px 0 ${pal.ink}` : 'none',
            }}>
              <div style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 11,
                color: pal.ink,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                flex: 1,
              }}>{shareUrl}</div>
              <button
                onClick={handleCopy}
                style={{
                  padding: '6px 12px',
                  borderRadius: T2.radii.pill,
                  border: `1.5px solid ${pal.ink}`,
                  background: copied ? pal.sage : pal.cream,
                  color: copied ? pal.cream : pal.ink,
                  fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', flexShrink: 0,
                }}>{copied ? '✓ copied' : 'copy'}</button>
            </div>

            <button
              onClick={handleShare}
              style={{
                width: '100%',
                padding: '12px 0',
                marginBottom: 24,
                borderRadius: T2.radii.pill,
                border: `1.5px solid ${pal.ink}`,
                background: pal.ink,
                color: pal.cream,
                fontFamily: 'Inter, sans-serif',
                fontSize: 14, fontWeight: 600,
                cursor: 'pointer',
              }}>Share via… (Messages, WhatsApp)</button>
          </>
        )}
      </div>

      <div style={{ padding: '24px 24px 0' }}>
        {!created ? (
          <PrimaryButton
            vibe={vibe}
            tone="terracotta"
            onClick={handleCreate}
            disabled={!name.trim() || !displayName.trim() || creating}
          >
            {creating ? 'Creating…' : 'Create group →'}
          </PrimaryButton>
        ) : (
          <PrimaryButton vibe={vibe} tone="terracotta" onClick={handleContinue}>
            Continue — set my prefs →
          </PrimaryButton>
        )}
      </div>
    </ScreenShell>
  );
}

// ─────────────────────────────────────────────────────────────
// 4. Set My Prefs (the killer screen)
// ─────────────────────────────────────────────────────────────
// Vibe presets — quick-tap chips that pre-fill the entire prefs form.
// One tap sets categories + budget + distance + a sample vibe text the user
// can edit. Reduces "what do I even pick?" friction for first-time users.
const VIBE_PRESETS = [
  { id: 'date',      label: 'Date night',     emoji: '🌙',
    categories: ['food', 'arts'],            budget: 3, distance: 5,
    vibe: 'romantic cocktail spot, quiet enough to talk' },
  { id: 'brunch',    label: 'Friend brunch',  emoji: '🥐',
    categories: ['food', 'outdoors'],        budget: 2, distance: 8,
    vibe: 'chill weekend brunch with patio energy' },
  { id: 'solo',      label: 'Solo recharge',  emoji: '🧘',
    categories: ['wellness', 'outdoors'],    budget: 1, distance: 3,
    vibe: 'calm and restorative, low-budget' },
  { id: 'night',     label: 'Night out',      emoji: '🪩',
    categories: ['night', 'food', 'music'],  budget: 3, distance: 4,
    vibe: 'lively bar, music, going late' },
];

function SetPrefsScreen({ vibe, iconStyle, density, currentGroup, onBack, onSubmit }) {
  const pal = T2.palette;
  const [selected, setSelected] = useState(['food', 'outdoors', 'arts']);
  const [budget, setBudget] = useState(2);
  const [distance, setDistance] = useState(4);
  const [vibeText, setVibeText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState(null);
  const [activePreset, setActivePreset] = useState(null);

  const toggle = (id) => {
    setActivePreset(null); // any manual edit deselects the preset
    setSelected((s) => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  };

  // One-tap pre-fill from a preset. Overrides existing selections —
  // expected behavior since the user explicitly picked the preset.
  function applyPreset(p) {
    setActivePreset(p.id);
    setSelected(p.categories);
    setBudget(p.budget);
    setDistance(p.distance);
    setVibeText(p.vibe);
    setParseError(null);
  }

  // Vibe → /parse → prefill chips/budget/distance from the LLM result.
  // Lenient: if the call fails or the model returns junk, we just keep
  // whatever the user already had selected.
  async function handleParse() {
    if (!vibeText.trim() || parsing) return;
    setParsing(true);
    setParseError(null);
    try {
      const res = await window.PLOT_API.parse(vibeText.trim());
      // Map canonical category names back to chip ids
      const ids = (res.categories || [])
        .map((c) => window.PLOT_API.apiNameToChipId(c))
        .filter(Boolean);
      if (ids.length) setSelected(ids);
      if (res.budget) {
        setBudget(res.budget === 'low' ? 1 : res.budget === 'high' ? 3 : 2);
      }
      if (res.max_distance_km) {
        setDistance(Math.max(1, Math.min(20, Math.round(res.max_distance_km))));
      }
    } catch (err) {
      setParseError(String(err.message || err));
    } finally {
      setParsing(false);
    }
  }

  // Convert the budget tier (1/2/3) to the canonical low/medium/high.
  const BUDGET_TIER_TO_NAME = { 1: 'low', 2: 'medium', 3: 'high' };

  function handleSubmit() {
    if (!onSubmit || selected.length === 0) return;
    onSubmit({
      budget: BUDGET_TIER_TO_NAME[budget] || 'medium',
      categories: window.PLOT_API.chipIdsToCategories(selected),
      max_distance_km: distance,
      vibe_text: vibeText.trim() || null,
    });
  }

  return (
    <ScreenShell
      vibe={vibe}
      bg={pal.cream}
      padTop={50}
      padBottom={92}
      footer={
        <PrimaryButton vibe={vibe} tone="terracotta" onClick={handleSubmit} disabled={selected.length === 0}>
          Find us a hangout →
        </PrimaryButton>
      }
    >
      <div style={{ padding: '8px 24px 0', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={onBack} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: 4, color: pal.ink, fontSize: 22, fontFamily: 'inherit',
        }}>←</button>
        <SectionLabel vibe={vibe}>
          {currentGroup ? `${currentGroup.name} · your prefs` : 'Solo · your prefs'}
        </SectionLabel>
      </div>

      <div style={{ padding: '0 24px' }}>
        <div style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: 26, fontWeight: 500,
          letterSpacing: '-0.02em',
          color: pal.ink,
          lineHeight: 1.15,
          marginBottom: 4,
          textWrap: 'pretty',
        }}>
          What's calling you?
        </div>
        <div style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: 13, color: pal.inkSoft,
          marginBottom: 16,
        }}>
          Pick a few. We'll mix with the group.
        </div>

        {/* Vibe presets — one tap pre-fills categories + budget + distance + vibe text */}
        <div style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 10, fontWeight: 600,
          color: pal.inkMute,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          marginBottom: 8,
        }}>Quick start</div>
        <div style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 22,
        }}>
          {VIBE_PRESETS.map((p) => {
            const isActive = activePreset === p.id;
            return (
              <button
                key={p.id}
                onClick={() => applyPreset(p)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 12px',
                  borderRadius: T2.radii.pill,
                  border: `1.5px solid ${isActive ? pal.terracotta : pal.line}`,
                  background: isActive ? pal.terracottaL : pal.creamSoft,
                  color: isActive ? pal.terracottaD : pal.ink,
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 13, fontWeight: 600,
                  cursor: 'pointer',
                  letterSpacing: '-0.01em',
                }}>
                <span style={{ fontSize: 15, lineHeight: 1 }}>{p.emoji}</span>
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Icon chip grid — 10 categories */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: density === 'tight' ? 8 : 14,
          rowGap: density === 'tight' ? 14 : 18,
          marginBottom: 28,
        }}>
          {T2.categories.map((cat) => (
            <IconChip
              key={cat.id}
              category={cat}
              selected={selected.includes(cat.id)}
              onClick={() => toggle(cat.id)}
              vibe={vibe}
              iconStyle={iconStyle}
              size={density === 'tight' ? 'sm' : 'md'}
            />
          ))}
        </div>

        <SectionLabel vibe={vibe}>Budget</SectionLabel>
        <div style={{ marginBottom: 24 }}>
          <BudgetChip value={budget} onChange={setBudget} vibe={vibe} />
        </div>

        <SectionLabel vibe={vibe}>Travel · how far</SectionLabel>
        <div style={{ marginBottom: 24 }}>
          <DistanceSlider value={distance} onChange={setDistance} vibe={vibe} />
        </div>

        <SectionLabel vibe={vibe}>The vibe</SectionLabel>
        <VibeInput
          value={vibeText}
          onChange={setVibeText}
          onParse={handleParse}
          vibe={vibe}
          parsing={parsing}
        />
        {parseError && (
          <div style={{
            marginTop: 8,
            fontFamily: 'Inter, sans-serif',
            fontSize: 12,
            color: pal.terracottaD,
          }}>
            Couldn't parse the vibe — kept your existing picks.
          </div>
        )}
      </div>
    </ScreenShell>
  );
}

// ─────────────────────────────────────────────────────────────
// 5. Recommendations — Places / Events tabs
// ─────────────────────────────────────────────────────────────
// Map API budget tier ('low'/'medium'/'high') -> $ count for VenueCard.price.
const PRICE_LEVEL_TO_TIER = { low: 1, medium: 2, high: 3 };

// Adapt an API venue (returned by /recommend) to VenueCard's expected shape.
function adaptVenue(v) {
  return {
    id: v.name,                                           // unique enough for keys
    name: v.name,
    category: window.PLOT_API.apiNameToChipId(v.category) || 'food',
    distance: v.distance_km != null ? `${v.distance_km.toFixed(1)} km` : '',
    rating: v.rating || 0,
    price: PRICE_LEVEL_TO_TIER[v.price_level] || 2,
    reason: v.reason || '',
    link: v.google_maps_uri || null,                      // tap-through target
  };
}

// Adapt an API event (returned by /events) to VenueCard's expected shape.
function adaptEvent(e) {
  // start_datetime_utc is ISO; cut to "FRI 8:00" style for the card date badge.
  let dateStr = '';
  if (e.start_datetime_utc) {
    const d = new Date(e.start_datetime_utc);
    if (!isNaN(d)) {
      const day = ['SUN','MON','TUE','WED','THU','FRI','SAT'][d.getDay()];
      const hr = d.getHours();
      const min = String(d.getMinutes()).padStart(2, '0');
      dateStr = `${day} ${hr}:${min}`;
    }
  }
  // Events don't always have rating/price; show what we have.
  const priceTier =
    e.price_min == null ? 2 :
    e.price_min < 25 ? 1 :
    e.price_min < 75 ? 2 :
    e.price_min < 200 ? 3 : 4;
  return {
    id: e.name,
    name: e.name,
    category: window.PLOT_API.apiNameToChipId(e.category) || 'music',
    distance: e.distance_km != null ? `${e.distance_km.toFixed(1)} km` : '',
    rating: 0,             // Ticketmaster doesn't expose ratings
    price: priceTier,
    reason: e.venue_name || '',
    date: dateStr,
    link: e.event_url || null,                            // tap-through target
    image: e.image_url || null,                           // real Ticketmaster photo
  };
}

function RecsScreen({ vibe, density, currentGroup, onBack, onLockedIn, votes, setVotes, recState, onShuffle }) {
  const pal = T2.palette;
  const [tab, setTab] = useState('places');

  // The full pool the LLM returned this round. We slice a 5-card window
  // out of it; tapping Shuffle slides the window forward in app.jsx.
  const VISIBLE = 5;
  const offset = recState?.pool_offset || 0;
  const allVenues = (recState?.venues || []).map(adaptVenue);
  const allEvents = (recState?.events || []).map(adaptEvent);
  const venues = allVenues.slice(offset, offset + VISIBLE);
  const events = allEvents.slice(offset, offset + VISIBLE);
  const list = tab === 'places' ? venues : events;
  const totalForTab = tab === 'places' ? allVenues.length : allEvents.length;
  const canShuffle = totalForTab > VISIBLE;

  const setVote = (id, vote) => {
    setVotes((prev) => ({ ...prev, [id]: prev[id] === vote ? null : vote }));
    if (!vote) return;
    // Haptic feedback — yay = warm double-pulse, nahh = short single buzz.
    // Best-effort: navigator.vibrate is iOS-Safari-supported as of 16+ and
    // Android everywhere; a missing API just silently no-ops.
    try {
      if (navigator.vibrate) {
        navigator.vibrate(vote === 'yay' ? [25, 30, 35] : 18);
      }
    } catch (e) { /* unsupported */ }
    // Fire the vote in the background. Failures are non-fatal — the vote
    // still updates locally even if the network drops. In group mode we
    // route through /groups/{id}/vote so other members' phones see it on
    // their next poll; solo mode keeps the existing /feedback behavior.
    if (currentGroup && currentGroup.id) {
      window.PLOT_API.groupVote(currentGroup.id, id, vote).catch(() => {});
    } else if (recState?.rec_id) {
      window.PLOT_API.feedback(recState.rec_id, id, vote).catch(() => {});
    }
  };

  const yayCount = Object.values(votes).filter(v => v === 'yay').length;

  return (
    <ScreenShell
      vibe={vibe}
      bg={pal.cream}
      padTop={50}
      padBottom={yayCount > 0 ? 100 : 40}
      scrollKey={tab}
      footer={yayCount > 0 ? (
        <PrimaryButton vibe={vibe} tone="ink" onClick={onLockedIn}>
          Lock in · {yayCount} yay{yayCount !== 1 ? 's' : ''} →
        </PrimaryButton>
      ) : null}
    >
      <div style={{ padding: '8px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <button onClick={onBack} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: 4, color: pal.ink, fontSize: 22, fontFamily: 'inherit',
        }}>←</button>
        <SectionLabel vibe={vibe}>
          {recState?.used_llm ? 'LLM ranked' : 'rules ranked'} · {recState?.llm_latency_ms ? `${recState.llm_latency_ms}ms` : ''}
        </SectionLabel>
        <div style={{ width: 30 }} />
      </div>

      <div style={{ padding: '0 24px', marginBottom: 16 }}>
        <div style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: 28, fontWeight: 500,
          letterSpacing: '-0.02em',
          color: pal.ink,
          lineHeight: 1.1,
          textWrap: 'pretty',
        }}>
          Hand-picked for the crew.
        </div>
      </div>

      {/* Tabs */}
      <div style={{ padding: '0 24px', marginBottom: 16 }}>
        <div style={{
          display: 'flex',
          padding: 4,
          background: pal.creamDeep,
          borderRadius: T2.radii.pill,
          gap: 4,
        }}>
          {['places', 'events'].map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              style={{
                flex: 1,
                height: 38,
                borderRadius: T2.radii.pill,
                border: 'none',
                background: tab === k ? pal.cream : 'transparent',
                color: tab === k ? pal.ink : pal.inkMute,
                fontFamily: 'Inter, sans-serif',
                fontSize: 14, fontWeight: 600,
                letterSpacing: '0.01em',
                cursor: 'pointer',
                boxShadow: tab === k ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                textTransform: 'capitalize',
              }}>
              {k} · <Count to={k === 'places' ? venues.length : events.length} />
            </button>
          ))}
        </div>
      </div>

      {/* Loading / error / empty / cards */}
      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {recState?.loading && (
          <div style={{
            padding: 32, textAlign: 'center',
            fontFamily: 'Inter, sans-serif', fontSize: 14, color: pal.inkSoft,
          }}>
            <div style={{
              width: 24, height: 24, margin: '0 auto 16px',
              border: `2.5px solid ${pal.line}`,
              borderTopColor: pal.terracotta,
              borderRadius: '50%',
              animation: 'plotspin 0.9s linear infinite',
            }} />
            Asking the LLM for picks…
          </div>
        )}
        {!recState?.loading && recState?.error && (
          <div style={{
            padding: 16, borderRadius: T2.radii.md,
            background: pal.terracottaL, color: pal.terracottaD,
            fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 500,
            textAlign: 'center',
          }}>
            Something went wrong fetching picks.<br />
            <span style={{ fontSize: 11, opacity: 0.7, fontFamily: '"JetBrains Mono", monospace' }}>
              {recState.error}
            </span>
          </div>
        )}
        {!recState?.loading && !recState?.error && list.length === 0 && (
          <div style={{
            padding: 32, textAlign: 'center',
            fontFamily: 'Inter, sans-serif', fontSize: 14, color: pal.inkSoft,
          }}>
            {tab === 'places'
              ? 'No places match your prefs. Try a wider distance or more categories.'
              : 'No upcoming events match. Music & Live Shows / Arts & Culture / Sports & Recreation produce events.'}
          </div>
        )}
        {!recState?.loading && list.map((v) => (
          <VenueCard
            key={v.id}
            venue={v}
            vibe={vibe}
            density={density}
            vote={votes[v.id] || null}
            onYay={() => setVote(v.id, 'yay')}
            onNahh={() => setVote(v.id, 'nahh')}
          />
        ))}
        {/* Big visible shuffle button BELOW the cards. The user wanted it
            "down a bit, big and visible" — header version was too cramped
            and the disabled state looked broken. Down here it reads as a
            primary action: "didn't like these? show me different ones."
            We hide it entirely when there's nothing to shuffle to (saves
            real estate vs. a greyed-out button). */}
        {!recState?.loading && !recState?.error && list.length > 0 && canShuffle && (
          <button
            onClick={onShuffle}
            aria-label="Shuffle picks"
            style={{
              marginTop: 6,
              padding: '16px 20px',
              background: pal.cream,
              border: `1.5px solid ${pal.ink}`,
              borderRadius: T2.radii.pill,
              color: pal.ink,
              fontFamily: 'Inter, sans-serif',
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: '0.01em',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 2px 6px rgba(42, 36, 32, 0.06)',
              width: '100%',
            }}>
            <span style={{ fontSize: 18 }}>↻</span>
            Shuffle — show me 5 different
          </button>
        )}
        {!recState?.loading && !recState?.error && list.length > 0 && (
          <div style={{
            padding: 24,
            textAlign: 'center',
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 10,
            color: pal.inkMute,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            — end of picks —
          </div>
        )}
      </div>

      {/* spinner keyframes */}
      <style>{`@keyframes plotspin { to { transform: rotate(360deg); } }`}</style>
    </ScreenShell>
  );
}

// ─────────────────────────────────────────────────────────────
// 6. Group Decision — locked-in pick + member votes
// ─────────────────────────────────────────────────────────────
function GroupDecisionScreen({ vibe, votes, onBack, onMemories, onWentThere, recState, currentGroup, lobbyState }) {
  const pal = T2.palette;

  // Find the user's first yay venue from the real Recs data they just voted on.
  // Falls back to the highest-ranked venue if no yay yet, then to a sample
  // (purely so this screen renders something during static prototype tours).
  const yayName = Object.keys(votes).find(k => votes[k] === 'yay');
  const realVenues = (recState?.venues || []).map(adaptVenue);
  const realEvents = (recState?.events || []).map(adaptEvent);
  const realPool = [...realVenues, ...realEvents];
  const locked =
    realPool.find(v => v.id === yayName) ||
    realPool[0] ||
    SAMPLE_VENUES[0];
  const cat = T2.categories.find(c => c.id === locked.category);

  // Real member votes — built from polled lobby state in group mode, or
  // just the current user's own vote in solo mode. No more SAMPLE_MEMBERS
  // ghost names voting on a venue they were never invited to.
  const myUserId = window.PLOT_API.getUserId();
  const memberColors = ['terracotta', 'sage', 'lilac', 'peach'];
  function _hashId(s) {
    let h = 0;
    for (let i = 0; i < (s || '').length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return h;
  }
  let memberVotes;
  if (currentGroup && lobbyState && lobbyState.members) {
    // Group mode: every member of the group, with their latest vote on
    // the locked-in venue (if any). lobbyState.votes is already ordered
    // newest-first by the backend, so the first hit per user wins.
    const latestVoteFor = {};
    for (const v of (lobbyState.votes || [])) {
      if (v.venue_name === locked.name && !(v.user_id in latestVoteFor)) {
        latestVoteFor[v.user_id] = v.signal;
      }
    }
    memberVotes = lobbyState.members.map((m) => ({
      id: m.user_id,
      name: m.user_id === myUserId ? 'You' : m.display_name,
      color: memberColors[Math.abs(_hashId(m.user_id)) % memberColors.length],
      vote: latestVoteFor[m.user_id] || null,
    }));
  } else {
    // Solo mode: only the user is in the "group" of one.
    memberVotes = [{
      id: myUserId,
      name: 'You',
      color: 'terracotta',
      vote: votes[locked.name] || null,
    }];
  }
  const yayCount = memberVotes.filter(m => m.vote === 'yay').length;

  return (
    <ScreenShell
      vibe={vibe}
      bg={pal.cream}
      padTop={50}
      padBottom={92}
      footer={
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => {
              // Celebrate: confetti + 3-pulse buzz + toast. The confetti is
              // fired via window.plotConfetti() which is hosted at app root,
              // so the burst keeps rendering even after we navigate away.
              try { window.plotConfetti && window.plotConfetti(); } catch (e) { /* unsupported */ }
              try { navigator.vibrate && navigator.vibrate([30, 40, 50]); } catch (e) { /* unsupported */ }
              try { window.plotToast && window.plotToast('Memory saved 🎉', 'success'); } catch (e) { /* unsupported */ }
              onWentThere ? onWentThere(locked) : onMemories && onMemories();
            }}
            style={{
              flex: 1, height: 52,
              borderRadius: vibe === 'playful' ? T2.radii.lg : T2.radii.pill,
              border: `1.5px solid ${pal.ink}`,
              background: pal.cream,
              color: pal.ink,
              fontFamily: 'Inter, sans-serif',
              fontSize: 15, fontWeight: 600,
              whiteSpace: 'nowrap',
              cursor: 'pointer',
            }}>
            We went →
          </button>
          <PrimaryButton vibe={vibe} tone="terracotta">
            Add to calendar
          </PrimaryButton>
        </div>
      }
    >
      <div style={{ padding: '8px 24px 0', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={onBack} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: 4, color: pal.ink, fontSize: 22, fontFamily: 'inherit',
        }}>←</button>
        <SectionLabel vibe={vibe}>Sunday Soft Life</SectionLabel>
      </div>

      <div style={{ padding: '0 20px' }}>
        {/* Big "locked in" badge */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          borderRadius: T2.radii.pill,
          background: pal.sage,
          color: pal.cream,
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          marginBottom: 12,
          marginLeft: 4,
          whiteSpace: 'nowrap',
          transform: vibe === 'playful' ? 'rotate(-2deg)' : 'none',
          boxShadow: vibe === 'playful' ? `2px 2px 0 ${pal.ink}` : 'none',
        }}>
          <span>★</span> locked in
        </div>

        {/* Hero image */}
        <div style={{ marginBottom: 16, position: 'relative' }}>
          <StripedPlaceholder
            label={locked.name}
            height={300}
            tone={cat.color}
            vibe={vibe}
            radius={T2.radii.xl}
          />
          {/* category icon */}
          <div style={{
            position: 'absolute',
            top: 14, left: 14,
            width: 44, height: 44,
            borderRadius: vibe === 'playful' ? 12 : T2.radii.pill,
            background: pal.cream,
            border: `1.5px solid ${pal[cat.color]}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: pal[cat.color + 'D'],
            fontSize: 20,
          }}>
            <CategoryIcon id={cat.id} size={22} color={pal[cat.color + 'D']} fillStyle="outline" />
          </div>
        </div>

        {/* Name + meta */}
        <div style={{ padding: '0 4px 8px', marginBottom: 20 }}>
          <div style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 32, fontWeight: 500,
            letterSpacing: '-0.025em',
            color: pal.ink,
            lineHeight: 1.05,
            marginBottom: 6,
            textWrap: 'pretty',
          }}>
            {locked.name}
          </div>
          <div style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 13,
            color: pal.inkSoft,
            letterSpacing: '0.01em',
          }}>
            {locked.distance} · {locked.rating}★ · {'$'.repeat(locked.price)}
            {locked.date && ` · ${locked.date}`}
          </div>
        </div>

        {/* Member votes */}
        <div style={{
          padding: 16,
          background: pal.creamSoft,
          borderRadius: T2.radii.lg,
          border: `1px solid ${pal.line}`,
          marginBottom: 20,
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 14,
          }}>
            <div style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: 14, fontWeight: 600,
              color: pal.ink,
            }}>
              {yayCount} of {memberVotes.length} said yay
            </div>
            <div style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 10,
              color: pal.inkMute,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}>
              just now
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {memberVotes.map((m) => (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <Avatar name={m.name} color={m.color} vote={m.vote} vibe={vibe} />
                <span style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 11,
                  color: pal.inkSoft,
                  fontWeight: 500,
                }}>{m.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ScreenShell>
  );
}

// ─────────────────────────────────────────────────────────────
// 7. Memories
// ─────────────────────────────────────────────────────────────
// Tile shown in the grid for one stored memory. The "wallpaper" image
// renders edge-to-edge if the user has uploaded one or if it's an event
// (Ticketmaster image_url). Otherwise we fall back to the colored
// category tile + icon, same visual language as the rec card.
function MemoryTile({ m, onOpen, onAddPhoto, vibe }) {
  const pal = T2.palette;
  const cat = T2.categories.find((c) => c.id === m.category);
  const tintL = pal[(cat?.color || 'sage') + 'L'];
  const tintD = pal[(cat?.color || 'sage') + 'D'];
  const wallpaper = m.photo || m.image || null;

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => onOpen(m)}
        style={{
          width: '100%',
          padding: 0,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          position: 'relative',
          height: 140,
          borderRadius: T2.radii.md,
          overflow: 'hidden',
        }}>
        {wallpaper ? (
          <img
            src={wallpaper}
            alt={m.name}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            background: tintL,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1px solid ${pal.line}`,
            borderRadius: T2.radii.md,
          }}>
            <CategoryIcon id={cat?.id || 'food'} size={56} color={tintD} fillStyle="outline" />
          </div>
        )}
        <div style={{
          position: 'absolute',
          bottom: 10, right: 10,
          padding: '3px 7px',
          background: pal.ink,
          color: pal.cream,
          borderRadius: 4,
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 9, fontWeight: 500,
          letterSpacing: '0.06em',
        }}>{(m.visited_at || '').slice(5, 10)}</div>
        <div style={{
          position: 'absolute',
          top: 8, left: 8,
          padding: '4px 8px',
          background: 'rgba(255,255,255,0.92)',
          color: pal.ink,
          borderRadius: T2.radii.pill,
          fontFamily: 'Inter, sans-serif',
          fontSize: 10, fontWeight: 600,
          maxWidth: 'calc(100% - 16px)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>{m.name}</div>
      </button>
      {!m.photo && (
        <button
          onClick={(e) => { e.stopPropagation(); onAddPhoto(m); }}
          aria-label="Add memory photo"
          style={{
            position: 'absolute',
            bottom: 10, left: 10,
            width: 32, height: 32,
            borderRadius: T2.radii.pill,
            background: pal.cream,
            border: `1.5px solid ${pal.ink}`,
            color: pal.ink,
            fontFamily: 'Inter, sans-serif',
            fontSize: 16,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
          }}>
          📷
        </button>
      )}
    </div>
  );
}

function MemoriesScreen({ vibe, onBack }) {
  const pal = T2.palette;
  const [memories, setMemories] = useState(() => window.PLOT_API.getMemories());
  const [open, setOpen] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  // 'environment' = back camera, 'user' = front (selfie). Persisted in state
  // so the toggle survives modal opens. Two parallel hidden inputs let the
  // browser pick the right camera the moment user taps.
  const [cameraFacing, setCameraFacing] = useState('environment');
  const fileInputBackRef = React.useRef(null);
  const fileInputFrontRef = React.useRef(null);
  const targetMemoryRef = React.useRef(null);

  // Trigger the hidden <input type=file> for a specific memory. We have two
  // inputs (one capture=environment, one capture=user) and pick which to
  // click based on the cameraFacing state — that's the only reliable way
  // to swap camera direction since the capture attribute is read at click.
  function startAddPhoto(memory) {
    targetMemoryRef.current = memory;
    setUploadError(null);
    const ref = cameraFacing === 'user' ? fileInputFrontRef : fileInputBackRef;
    if (ref.current) {
      ref.current.value = '';
      ref.current.click();
    }
  }

  async function handleFileSelected(e) {
    const file = e.target.files && e.target.files[0];
    const target = targetMemoryRef.current;
    if (!file || !target) return;
    setUploading(true);
    setUploadError(null);
    try {
      const dataURL = await window.PLOT_API.compressImageFile(file, 900, 0.72);
      window.PLOT_API.setMemoryPhoto(target.id, dataURL);
      const fresh = window.PLOT_API.getMemories();
      setMemories(fresh);
      const updated = fresh.find((m) => m.id === target.id);
      if (open && open.id === target.id && updated) setOpen(updated);
      try { window.plotToast && window.plotToast('Photo saved 📸', 'success'); } catch (e) { /* ignore */ }
    } catch (err) {
      setUploadError(String(err.message || err));
    } finally {
      setUploading(false);
      targetMemoryRef.current = null;
    }
  }

  return (
    <ScreenShell vibe={vibe} bg={pal.cream} padTop={50} padBottom={96}>
      <div style={{ padding: '8px 24px 0', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <button onClick={onBack} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: 4, color: pal.ink, fontSize: 22, fontFamily: 'inherit',
        }}>←</button>
        <SectionLabel vibe={vibe}>Memories</SectionLabel>
        {/* Camera-direction toggle. Sits on the right of the header so it's
            visible whenever the user is about to tap a photo button. The
            current direction is reflected by which side of the pill is filled. */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            aria-label="Toggle camera direction"
            onClick={() => setCameraFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '6px 10px',
              borderRadius: T2.radii.pill,
              border: `1px solid ${pal.line}`,
              background: pal.creamSoft,
              color: pal.ink,
              fontFamily: 'inherit',
              fontSize: 12, fontWeight: 600,
              cursor: 'pointer',
            }}>
            <span style={{
              display: 'inline-block',
              width: 20, textAlign: 'center',
              transform: cameraFacing === 'user' ? 'scaleX(-1)' : 'none',
            }}>📷</span>
            <span style={{ letterSpacing: '0.02em' }}>
              {cameraFacing === 'user' ? 'Selfie' : 'Back'}
            </span>
          </button>
        </div>
      </div>

      <div style={{ padding: '0 24px', marginBottom: 18 }}>
        <div style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: 28, fontWeight: 500,
          letterSpacing: '-0.02em',
          color: pal.ink,
          textWrap: 'pretty',
        }}>
          {memories.length === 0
            ? 'Nothing here yet.'
            : `${memories.length} hangout${memories.length === 1 ? '' : 's'} so far.`}
        </div>
        {uploadError && (
          <div style={{
            marginTop: 8,
            fontFamily: 'Inter, sans-serif',
            fontSize: 12,
            color: pal.terracottaD,
          }}>
            Couldn't add photo — {uploadError}
          </div>
        )}
        {uploading && (
          <div style={{
            marginTop: 8,
            fontFamily: 'Inter, sans-serif',
            fontSize: 12,
            color: pal.inkSoft,
          }}>
            Saving photo…
          </div>
        )}
      </div>

      {memories.length === 0 ? (
        <div style={{ padding: '0 24px' }}>
          <div style={{
            padding: 24,
            borderRadius: T2.radii.md,
            background: pal.creamSoft,
            border: `1px dashed ${pal.line}`,
            color: pal.inkSoft,
            fontFamily: 'Inter, sans-serif',
            fontSize: 13,
            textAlign: 'center',
          }}>
            📸 Your hangout receipts live here. Tap "We went →" after a plan and it lands here — bad decisions encouraged.
          </div>
        </div>
      ) : (
        <div style={{
          padding: '0 16px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
        }}>
          {memories.map((m) => (
            <MemoryTile
              key={m.id}
              m={m}
              vibe={vibe}
              onOpen={setOpen}
              onAddPhoto={startAddPhoto}
            />
          ))}
        </div>
      )}

      {/* Two hidden file inputs — one for each camera direction. We can't
          dynamically change the capture attribute after click; React renders
          both and startAddPhoto clicks whichever matches cameraFacing. */}
      <input
        ref={fileInputBackRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelected}
        style={{ display: 'none' }}
      />
      <input
        ref={fileInputFrontRef}
        type="file"
        accept="image/*"
        capture="user"
        onChange={handleFileSelected}
        style={{ display: 'none' }}
      />

      {open && (
        <div
          onClick={() => setOpen(null)}
          style={{
            position: 'absolute',
            inset: 0, zIndex: 100,
            background: 'rgba(26,22,18,0.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}>
          <div style={{ width: '100%' }} onClick={(e) => e.stopPropagation()}>
            {(() => {
              const wallpaper = open.photo || open.image;
              if (wallpaper) {
                return (
                  <img
                    src={wallpaper}
                    alt={open.name}
                    style={{
                      width: '100%', height: 400, objectFit: 'cover',
                      borderRadius: T2.radii.lg, display: 'block',
                    }}
                  />
                );
              }
              const cat = T2.categories.find((c) => c.id === open.category);
              const tintL = pal[(cat?.color || 'sage') + 'L'];
              const tintD = pal[(cat?.color || 'sage') + 'D'];
              return (
                <div style={{
                  width: '100%', height: 400,
                  background: tintL,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: T2.radii.lg,
                }}>
                  <CategoryIcon id={cat?.id || 'food'} size={140} color={tintD} fillStyle="outline" />
                </div>
              );
            })()}
            <div style={{ padding: '20px 4px 0', color: pal.cream }}>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 22, fontWeight: 500, letterSpacing: '-0.01em' }}>{open.name}</div>
              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: 'rgba(247,239,226,0.6)', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 4 }}>
                {(open.visited_at || '').slice(0, 10)} · we went
              </div>
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                onClick={() => startAddPhoto(open)}
                style={{
                  padding: '12px 18px',
                  borderRadius: T2.radii.pill,
                  background: pal.cream,
                  color: pal.ink,
                  border: 'none',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 14, fontWeight: 600,
                  cursor: 'pointer',
                }}>
                {open.photo ? 'Replace photo' : '📷 Add photo'}
              </button>
              {open.link && (
                <a
                  href={open.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    padding: '12px 18px',
                    borderRadius: T2.radii.pill,
                    background: 'transparent',
                    color: pal.cream,
                    border: `1.5px solid ${pal.cream}`,
                    fontFamily: 'Inter, sans-serif',
                    fontSize: 14, fontWeight: 600,
                    textDecoration: 'none',
                  }}>
                  Maps ↗
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </ScreenShell>
  );
}

// ─────────────────────────────────────────────────────────────
// 8. Profile
// ─────────────────────────────────────────────────────────────
function ProfileScreen({ vibe, iconStyle, currentGroup, onLeaveGroup, onBack }) {
  const pal = T2.palette;
  const [defaults, setDefaults] = useState(['food', 'outdoors', 'arts', 'wellness']);
  const [budget, setBudget] = useState(2);
  const [distance, setDistance] = useState(5);

  // Editable profile fields — backed by the same /users/{id}/profile
  // endpoints as the onboarding screen.
  const localProfile = window.PLOT_API.getLocalProfile() || {};
  const [name, setName] = useState(localProfile.name || window.PLOT_API.getDisplayName() || '');
  const [pronouns, setPronouns] = useState(localProfile.pronouns || '');
  const [dob, setDob] = useState(localProfile.date_of_birth || '');
  const [avatar, setAvatar] = useState(localProfile.avatar || null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSavedAt, setProfileSavedAt] = useState(null);
  const displayName = name || 'You';
  const sessionEmail = window.PLOT_API.getEmail();
  const fileInputRef = React.useRef(null);

  const toggle = (id) => setDefaults((s) => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  function pickAvatar() {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  }

  async function onAvatarChosen(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const dataURL = await window.PLOT_API.compressImageFile(file, 480, 0.78);
      setAvatar(dataURL);
      // Persist immediately so the change survives a refresh even if the
      // user doesn't tap Save afterwards. Avatar is local-only for now.
      window.PLOT_API.setLocalAvatar(dataURL);
    } catch (err) { /* ignore — keep existing avatar */ }
  }

  async function handleSaveProfile() {
    if (!name.trim() || savingProfile) return;
    setSavingProfile(true);
    try {
      await window.PLOT_API.saveProfile({
        name: name.trim(),
        pronouns: pronouns || null,
        date_of_birth: dob || null,
        avatar: avatar || null,
      });
      setProfileSavedAt(Date.now());
    } catch (e) {
      // Cache locally regardless so the UI doesn't lose the edit.
      window.PLOT_API.setDisplayName(name.trim());
    } finally {
      setSavingProfile(false);
    }
  }

  function handleSignOut() {
    window.PLOT_API.clearSession();
    // Hard reload — easiest way to drop back to the AuthScreen and reset
    // any in-memory React state cleanly.
    window.location.reload();
  }

  return (
    <ScreenShell vibe={vibe} bg={pal.cream} padTop={50} padBottom={96}>
      <div style={{ padding: '8px 24px 0', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={onBack} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: 4, color: pal.ink, fontSize: 22, fontFamily: 'inherit',
        }}>←</button>
        <SectionLabel vibe={vibe}>Profile</SectionLabel>
      </div>

      <div style={{ padding: '0 24px' }}>
        {/* Header — uploadable avatar (tap to change) + display name +
            session email. Sits right under the page title so the avatar
            reads as the "logo" of this profile. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 22 }}>
          <button
            onClick={pickAvatar}
            aria-label="Change profile photo"
            style={{
              width: 72, height: 72, borderRadius: '50%',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              overflow: 'hidden',
              background: 'transparent',
              flexShrink: 0,
              boxShadow: '0 4px 12px rgba(42,36,32,0.10)',
            }}>
            {avatar ? (
              <img
                src={avatar}
                alt={displayName}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            ) : (
              // No upload yet — fall back to the colored letter Avatar
              // primitive so the layout still has a visual anchor.
              <Avatar name={displayName} color="terracotta" size={72} vibe={vibe} />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="user"
            onChange={onAvatarChosen}
            style={{ display: 'none' }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: 22, fontWeight: 500,
              letterSpacing: '-0.01em',
              color: pal.ink,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>{displayName}</div>
            <div style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: 12, color: pal.inkSoft,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {sessionEmail || 'no email'}
            </div>
            <button
              onClick={handleSignOut}
              style={{
                marginTop: 4,
                padding: 0,
                background: 'transparent',
                border: 'none',
                color: pal.terracottaD,
                fontFamily: 'Inter, sans-serif',
                fontSize: 11, fontWeight: 600,
                textDecoration: 'underline',
                cursor: 'pointer',
              }}>Sign out</button>
          </div>
        </div>

        {/* Active group indicator + leave-group button. Visible only when
            the user is currently in a group; tapping leave drops them
            back to solo mode (the group still exists for other members). */}
        {currentGroup && (
          <div style={{
            padding: 14,
            borderRadius: T2.radii.lg,
            background: pal.terracottaL,
            border: `1.5px solid ${pal.terracotta}`,
            marginBottom: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}>
            <div>
              <div style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 9, fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: pal.terracottaD,
                marginBottom: 4,
              }}>active group</div>
              <div style={{
                fontFamily: 'Inter, sans-serif',
                fontSize: 16, fontWeight: 500,
                color: pal.ink,
              }}>{currentGroup.name}</div>
            </div>
            <button
              onClick={onLeaveGroup}
              style={{
                padding: '8px 14px',
                borderRadius: T2.radii.pill,
                border: `1.5px solid ${pal.ink}`,
                background: pal.cream,
                color: pal.ink,
                fontFamily: 'Inter, sans-serif',
                fontSize: 12, fontWeight: 600,
                cursor: 'pointer',
                flexShrink: 0,
              }}>Leave</button>
          </div>
        )}

        {/* Editable profile — name, pronouns, DOB. Same fields the
            onboarding screen collected; users can update them anytime. */}
        <SectionLabel vibe={vibe}>About you</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            maxLength={80}
            style={{
              width: '100%',
              height: 44,
              padding: '0 12px',
              background: pal.cream,
              border: `1px solid ${pal.line}`,
              borderRadius: T2.radii.md,
              fontFamily: 'Inter, sans-serif',
              fontSize: 15, fontWeight: 500, color: pal.ink,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              value={pronouns}
              onChange={(e) => setPronouns(e.target.value)}
              style={{
                flex: 1,
                height: 44,
                padding: '0 10px',
                background: pal.cream,
                border: `1px solid ${pal.line}`,
                borderRadius: T2.radii.md,
                fontFamily: 'Inter, sans-serif',
                fontSize: 13, color: pal.ink,
                outline: 'none',
                boxSizing: 'border-box',
              }}>
              <option value="">Pronouns (optional)</option>
              <option value="she/her">she/her</option>
              <option value="he/him">he/him</option>
              <option value="they/them">they/them</option>
              <option value="prefer not to say">prefer not to say</option>
            </select>
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              placeholder="Birthday"
              style={{
                flex: 1,
                height: 44,
                padding: '0 10px',
                background: pal.cream,
                border: `1px solid ${pal.line}`,
                borderRadius: T2.radii.md,
                fontFamily: 'Inter, sans-serif',
                fontSize: 13, color: pal.ink,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <button
            onClick={handleSaveProfile}
            disabled={!name.trim() || savingProfile}
            style={{
              alignSelf: 'flex-start',
              padding: '8px 16px',
              borderRadius: T2.radii.pill,
              border: `1.5px solid ${pal.ink}`,
              background: profileSavedAt && Date.now() - profileSavedAt < 2000 ? pal.sage : pal.cream,
              color: profileSavedAt && Date.now() - profileSavedAt < 2000 ? pal.cream : pal.ink,
              fontFamily: 'Inter, sans-serif',
              fontSize: 13, fontWeight: 600,
              cursor: name.trim() ? 'pointer' : 'default',
            }}>
            {savingProfile
              ? 'Saving…'
              : profileSavedAt && Date.now() - profileSavedAt < 2000
                ? '✓ Saved'
                : 'Save'}
          </button>
        </div>

        <SectionLabel vibe={vibe}>Default categories</SectionLabel>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 14,
          rowGap: 18,
          marginBottom: 28,
        }}>
          {T2.categories.map((cat) => (
            <IconChip
              key={cat.id}
              category={cat}
              selected={defaults.includes(cat.id)}
              onClick={() => toggle(cat.id)}
              vibe={vibe}
              iconStyle={iconStyle}
              size="md"
            />
          ))}
        </div>

        <SectionLabel vibe={vibe}>Default budget</SectionLabel>
        <div style={{ marginBottom: 24 }}>
          <BudgetChip value={budget} onChange={setBudget} vibe={vibe} />
        </div>

        <SectionLabel vibe={vibe}>Default travel</SectionLabel>
        <div style={{ marginBottom: 36 }}>
          <DistanceSlider value={distance} onChange={setDistance} vibe={vibe} />
        </div>
      </div>
    </ScreenShell>
  );
}

// Export
Object.assign(window, {
  AuthScreen, ProfileSetupScreen,
  JoinGroupScreen, WaitingRoomScreen, HomeScreen, CreateGroupScreen,
  SetPrefsScreen, RecsScreen, GroupDecisionScreen,
  MemoriesScreen, ProfileScreen,
});
