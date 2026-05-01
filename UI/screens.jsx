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
  // Pin sized to match cap-height so it reads as a letter, with negative margins to tighten spacing.
  const pinW = size * 0.78;
  const pinH = size * 1.0;
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'flex-start',
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: size,
      fontWeight: 700,
      letterSpacing: '-0.05em',
      color: ink,
      lineHeight: 1,
    }}>
      <span>Pl</span>
      <span style={{
        position: 'relative',
        display: 'inline-block',
        width: pinW * 0.78,         // narrower visual footprint than full SVG
        height: size,
        marginLeft: -size * 0.04,
        marginRight: -size * 0.04,
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

function AuthScreen({ vibe, onContinue }) {
  const pal = T2.palette;
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState('input');

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

        {/* ── SF Hero image — fills bottom ~60% ─────────────────── */}
        <div style={{
          position: 'absolute',
          left: 0, right: 0, bottom: 0,
          top: 280,
          zIndex: 1,
          overflow: 'hidden',
        }}>
          <img
            src="assets/sf-hero.png"
            alt="Friends watching the SF skyline"
            style={{
              position: 'absolute',
              left: 0, right: 0, bottom: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center 35%',
              display: 'block',
              maskImage: 'linear-gradient(to bottom, transparent 0%, black 12%, black 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 12%, black 100%)',
            }}
          />
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
          {stage === 'input' ? (
            <div style={{
              display: 'flex',
              gap: 6,
              padding: 6,
              background: 'rgba(248,245,239,0.95)',
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
              borderRadius: T2.radii.pill,
              border: `1.5px solid ${pal.ink}`,
              boxShadow: vibe === 'playful'
                ? `4px 4px 0 ${pal.ink}`
                : '0 8px 24px rgba(42,36,32,0.22)',
              transform: vibe === 'playful' ? 'rotate(-0.5deg)' : 'none',
            }}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                style={{
                  flex: 1,
                  height: 44,
                  padding: '0 16px',
                  background: 'transparent',
                  border: 'none',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 15, color: pal.ink,
                  outline: 'none',
                  minWidth: 0,
                }}
              />
              <button
                onClick={() => email.includes('@') && setStage('sent')}
                disabled={!email.includes('@')}
                style={{
                  height: 44,
                  padding: '0 18px',
                  background: email.includes('@') ? pal.terracotta : pal.line,
                  color: email.includes('@') ? pal.cream : pal.inkMute,
                  border: 'none',
                  borderRadius: T2.radii.pill,
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 14, fontWeight: 600,
                  cursor: email.includes('@') ? 'pointer' : 'not-allowed',
                  whiteSpace: 'nowrap',
                }}>
                send link →
              </button>
            </div>
          ) : (
            <div style={{
              padding: 16,
              background: 'rgba(248,245,239,0.95)',
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
              borderRadius: T2.radii.lg,
              border: `1.5px solid ${pal.ink}`,
              boxShadow: vibe === 'playful' ? `4px 4px 0 ${pal.ink}` : '0 8px 24px rgba(42,36,32,0.22)',
              transform: vibe === 'playful' ? 'rotate(-0.5deg)' : 'none',
            }}>
              <div style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 10, color: pal.sageD,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                marginBottom: 6,
              }}>
                ✓ link sent
              </div>
              <div style={{
                fontFamily: 'Inter, sans-serif',
                fontSize: 17, fontWeight: 500,
                color: pal.ink, marginBottom: 4,
                letterSpacing: '-0.01em',
              }}>
                Check {email}
              </div>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: pal.inkSoft, marginBottom: 12 }}>
                Tap the link from your phone to come back.
              </div>
              <PrimaryButton onClick={onContinue} vibe={vibe} tone="ink">
                I clicked it →
              </PrimaryButton>
            </div>
          )}
        </div>
      </div>
    </ScreenShell>
  );
}


// ─────────────────────────────────────────────────────────────
// 2. Home — list of groups
// ─────────────────────────────────────────────────────────────
function HomeScreen({ vibe, onOpenGroup, onCreate, onProfile }) {
  const pal = T2.palette;

  return (
    <ScreenShell vibe={vibe} bg={pal.cream} padTop={50}>
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
          }}>Y</button>
      </div>

      <div style={{ padding: '0 24px' }}>
        <SectionLabel vibe={vibe}>Your groups</SectionLabel>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {SAMPLE_GROUPS.map((g) => (
            <button
              key={g.id}
              onClick={() => onOpenGroup(g.id)}
              style={{
                textAlign: 'left',
                padding: '16px',
                background: pal.creamSoft,
                border: `1px solid ${pal.line}`,
                borderRadius: vibe === 'playful' ? T2.radii.lg : T2.radii.lg,
                cursor: 'pointer',
                boxShadow: vibe === 'playful' ? `3px 3px 0 ${pal.ink}` : 'none',
                transform: vibe === 'playful' ? 'rotate(-0.2deg)' : 'none',
                fontFamily: 'inherit',
                width: '100%',
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 19, fontWeight: 500,
                  letterSpacing: '-0.01em', color: pal.ink,
                }}>{g.name}</div>
                <div style={{
                  padding: '3px 8px',
                  borderRadius: T2.radii.pill,
                  background: g.status === 'locked' ? pal.sageL : g.status === 'voting' ? pal.peachL : pal.lilacL,
                  color:      g.status === 'locked' ? pal.sageD : g.status === 'voting' ? '#9A7320'  : pal.lilacD,
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 9, fontWeight: 600,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                }}>
                  {g.status}
                </div>
              </div>
              {/* member dots */}
              <div style={{ display: 'flex', gap: -8, marginBottom: 8 }}>
                {Array.from({ length: g.members }).map((_, i) => (
                  <div key={i} style={{
                    width: 22, height: 22, borderRadius: T2.radii.pill,
                    background: ['terracottaL','sageL','lilacL','peachL'].map(k => pal[k])[i % 4],
                    border: `1.5px solid ${pal.cream}`,
                    marginLeft: i === 0 ? 0 : -6,
                  }} />
                ))}
              </div>
              <div style={{
                fontFamily: 'Inter, sans-serif', fontSize: 12,
                color: pal.inkSoft,
              }}>{g.last}</div>
            </button>
          ))}
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
  const [name, setName] = useState('Sunday Soft Life');
  const [copied, setCopied] = useState(false);
  const link = `plot.app/g/${name.toLowerCase().replace(/\s+/g, '-').slice(0, 14)}-${Math.floor(Math.random() * 9000 + 1000)}`;

  return (
    <ScreenShell vibe={vibe} bg={pal.cream} padTop={50}>
      <div style={{ padding: '8px 24px 0', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: 4, color: pal.ink, fontSize: 22, fontFamily: 'inherit',
        }}>←</button>
        <SectionLabel vibe={vibe}>New group</SectionLabel>
      </div>

      <div style={{ padding: '0 24px' }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Group name"
          style={{
            width: '100%',
            padding: '14px 0 8px',
            background: 'transparent',
            border: 'none',
            borderBottom: `1.5px solid ${pal.line}`,
            fontFamily: 'Inter, sans-serif',
            fontSize: 28, fontWeight: 500,
            letterSpacing: '-0.02em', color: pal.ink,
            outline: 'none',
            marginBottom: 28,
            boxSizing: 'border-box',
          }}
        />

        <SectionLabel vibe={vibe}>Share link</SectionLabel>
        <div style={{
          padding: 14,
          borderRadius: T2.radii.lg,
          background: pal.creamSoft,
          border: `1.5px solid ${pal.line}`,
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          transform: vibe === 'playful' ? 'rotate(-0.4deg)' : 'none',
          boxShadow: vibe === 'playful' ? `3px 3px 0 ${pal.ink}` : 'none',
        }}>
          <div style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 13,
            color: pal.ink,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{link}</div>
          <button
            onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }}
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

        <SectionLabel vibe={vibe}>Members · 1 of 8</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar name="You" color="terracotta" vibe={vibe} />
            <div>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 15, fontWeight: 500, color: pal.ink }}>You</div>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: pal.inkMute }}>creator</div>
            </div>
          </div>
          <div style={{
            padding: 14,
            border: `1.5px dashed ${pal.line}`,
            borderRadius: T2.radii.md,
            color: pal.inkMute,
            fontFamily: 'Inter, sans-serif', fontSize: 13,
            textAlign: 'center',
          }}>
            Send the link — friends join automatically.
          </div>
        </div>
      </div>

      <div style={{ padding: '24px 24px 0' }}>
        <PrimaryButton vibe={vibe} tone="terracotta" onClick={onCreated}>
          Continue →
        </PrimaryButton>
      </div>
    </ScreenShell>
  );
}

// ─────────────────────────────────────────────────────────────
// 4. Set My Prefs (the killer screen)
// ─────────────────────────────────────────────────────────────
function SetPrefsScreen({ vibe, iconStyle, density, onBack, onSubmit }) {
  const pal = T2.palette;
  const [selected, setSelected] = useState(['food', 'outdoors', 'arts']);
  const [budget, setBudget] = useState(2);
  const [distance, setDistance] = useState(4);
  const [vibeText, setVibeText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState(null);

  const toggle = (id) => setSelected((s) => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

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
        <SectionLabel vibe={vibe}>Sunday Soft Life · your prefs</SectionLabel>
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
          marginBottom: 22,
        }}>
          Pick a few. We'll mix with the group.
        </div>

        {/* Icon chip grid — 11 categories */}
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

function RecsScreen({ vibe, density, onBack, onLockedIn, votes, setVotes, recState, onShuffle }) {
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
    // Fire /feedback in the background. Failures are non-fatal — the vote
    // still updates locally even if the network drops.
    if (recState?.rec_id && vote) {
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
              {k} · {k === 'places' ? venues.length : events.length}
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
function GroupDecisionScreen({ vibe, votes, onBack, onMemories, recState }) {
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

  // Mock member votes
  const memberVotes = SAMPLE_MEMBERS.map((m, i) => ({
    ...m,
    vote: i === 4 ? 'yay' : (['yay','yay','yay','nahh'][i] || 'yay'),
  }));
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
            onClick={onMemories}
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
function MemoriesScreen({ vibe, onBack }) {
  const pal = T2.palette;
  const [open, setOpen] = useState(null);

  return (
    <ScreenShell vibe={vibe} bg={pal.cream} padTop={50}>
      <div style={{ padding: '8px 24px 0', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <button onClick={onBack} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: 4, color: pal.ink, fontSize: 22, fontFamily: 'inherit',
        }}>←</button>
        <SectionLabel vibe={vibe}>Memories</SectionLabel>
      </div>

      <div style={{ padding: '0 24px', marginBottom: 18 }}>
        <div style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: 28, fontWeight: 500,
          letterSpacing: '-0.02em',
          color: pal.ink,
          textWrap: 'pretty',
        }}>
          6 hangouts so far.
        </div>
      </div>

      <div style={{
        padding: '0 16px',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 8,
      }}>
        {SAMPLE_MEMORIES.map((m) => (
          <button
            key={m.id}
            onClick={() => setOpen(m)}
            style={{
              padding: 0, border: 'none', background: 'transparent',
              cursor: 'pointer', position: 'relative',
              transform: vibe === 'playful' ? `rotate(${(parseInt(m.id.slice(-1), 10) % 2 === 0 ? -0.6 : 0.5)}deg)` : 'none',
            }}>
            <StripedPlaceholder
              label={m.venue}
              height={140}
              tone={m.tone}
              vibe={vibe}
              radius={T2.radii.md}
            />
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
            }}>{m.date}</div>
          </button>
        ))}
      </div>

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
          <div style={{ width: '100%' }}>
            <StripedPlaceholder label={open.venue} height={400} tone={open.tone} vibe={vibe} radius={T2.radii.lg} />
            <div style={{ padding: '20px 4px 0', color: pal.cream }}>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 22, fontWeight: 500, letterSpacing: '-0.01em' }}>{open.venue}</div>
              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: 'rgba(247,239,226,0.6)', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 4 }}>{open.date} · with sunday soft life</div>
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
function ProfileScreen({ vibe, iconStyle, onBack }) {
  const pal = T2.palette;
  const [defaults, setDefaults] = useState(['food', 'outdoors', 'arts', 'wellness']);
  const [budget, setBudget] = useState(2);
  const [distance, setDistance] = useState(5);

  const toggle = (id) => setDefaults((s) => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  return (
    <ScreenShell vibe={vibe} bg={pal.cream} padTop={50}>
      <div style={{ padding: '8px 24px 0', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={onBack} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: 4, color: pal.ink, fontSize: 22, fontFamily: 'inherit',
        }}>←</button>
        <SectionLabel vibe={vibe}>Profile</SectionLabel>
      </div>

      <div style={{ padding: '0 24px' }}>
        {/* Avatar + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
          <Avatar name="You" color="terracotta" size={64} vibe={vibe} />
          <div>
            <div style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: 22, fontWeight: 500,
              letterSpacing: '-0.01em',
              color: pal.ink,
            }}>Maya R.</div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: pal.inkSoft }}>maya@gmail.com</div>
          </div>
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
  AuthScreen, HomeScreen, CreateGroupScreen,
  SetPrefsScreen, RecsScreen, GroupDecisionScreen,
  MemoriesScreen, ProfileScreen,
});
