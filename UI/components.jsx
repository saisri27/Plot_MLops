// Plot — Components
// IconChip, StripedPlaceholder, VenueCard, YayNahh, VibeInput, BudgetChip, DistanceSlider

const T = window.PLOT_TOKENS;

// ─────────────────────────────────────────────────────────────
// CategoryIcon — line-art SVG per category, brand-tinted, single color.
// Replaces emoji rendering for a calmer, more aesthetic chip system.
// All icons share the same 24×24 viewBox and 1.6 stroke for consistency.
// ─────────────────────────────────────────────────────────────
function CategoryIcon({ id, size = 28, color = T.palette.lilacD }) {
  const sw = 1.6;
  const p = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: sw,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  switch (id) {
    case 'food': // coffee cup with steam
      return (
        <svg {...p}>
          <path d="M5 9h12v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9z" />
          <path d="M17 10h2a2 2 0 0 1 0 4h-2" />
          <path d="M8 4c0 1.2 1 1.2 1 2.5M11 4c0 1.2 1 1.2 1 2.5" />
        </svg>
      );
    case 'outdoors': // mountain peaks + sun
      return (
        <svg {...p}>
          <path d="M3 19l5-9 4 6 3-4 6 7" />
          <circle cx="17" cy="6" r="1.6" />
        </svg>
      );
    case 'ent': // ticket
      return (
        <svg {...p}>
          <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8z" />
          <path d="M14 7v10" strokeDasharray="2 2" />
        </svg>
      );
    case 'arts': // paint brush + palette dot
      return (
        <svg {...p}>
          <path d="M14 4l6 6-7 7-3 1 1-3 3-3" />
          <path d="M9 14l-4 4-1 3 3-1 4-4" />
          <circle cx="6" cy="6" r="1" />
        </svg>
      );
    case 'night': // moon
      return (
        <svg {...p}>
          <path d="M20 14a8 8 0 1 1-8-10 6 6 0 0 0 8 10z" />
        </svg>
      );
    case 'sports': // ball with seam
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12c4 0 8-2 9-9" />
          <path d="M21 12c-4 0-8 2-9 9" />
        </svg>
      );
    case 'wellness': // lotus / leaf
      return (
        <svg {...p}>
          <path d="M12 21c-5-3-8-7-8-12 4 0 7 3 8 7 1-4 4-7 8-7 0 5-3 9-8 12z" />
          <path d="M12 16v5" />
        </svg>
      );
    case 'shop': // shopping bag
      return (
        <svg {...p}>
          <path d="M5 8h14l-1 12H6L5 8z" />
          <path d="M9 8V6a3 3 0 0 1 6 0v2" />
        </svg>
      );
    case 'pets': // paw print
      return (
        <svg {...p}>
          <circle cx="6.5" cy="9" r="1.4" />
          <circle cx="10" cy="6" r="1.4" />
          <circle cx="14" cy="6" r="1.4" />
          <circle cx="17.5" cy="9" r="1.4" />
          <path d="M8 16c0-2.5 2-4 4-4s4 1.5 4 4-1.5 4-4 4-4-1.5-4-4z" />
        </svg>
      );
    case 'music': // beamed eighth notes
      return (
        <svg {...p}>
          <circle cx="7" cy="18" r="2" />
          <circle cx="17" cy="16" r="2" />
          <path d="M9 18V6l10-2v12" />
          <path d="M9 8l10-2" />
        </svg>
      );
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Striped placeholder — honest design-y stand-in for imagery
// ─────────────────────────────────────────────────────────────
function StripedPlaceholder({ label, height = 200, tone = 'terracotta', radius = T.radii.md, vibe = 'editorial' }) {
  const pal = T.palette;
  const tones = {
    terracotta: { bg: pal.terracottaL, stripe: pal.terracotta, ink: pal.terracottaD },
    sage:       { bg: pal.sageL,       stripe: pal.sage,       ink: pal.sageD },
    lilac:      { bg: pal.lilacL,      stripe: pal.lilac,      ink: pal.lilacD },
    peach:      { bg: pal.peachL,      stripe: pal.peachD,     ink: '#7A5520' },
    cream:      { bg: pal.creamDeep,   stripe: pal.line,       ink: pal.inkSoft },
  }[tone] || { bg: pal.creamDeep, stripe: pal.line, ink: pal.inkSoft };

  // Editorial = subtle diagonal stripes; Playful = chunkier with overlay ring
  const stripeWidth = vibe === 'playful' ? 14 : 10;
  const angle = vibe === 'playful' ? 135 : 45;

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height,
      borderRadius: radius,
      overflow: 'hidden',
      background: `repeating-linear-gradient(${angle}deg, ${tones.bg} 0 ${stripeWidth}px, ${tones.stripe}33 ${stripeWidth}px ${stripeWidth * 2}px)`,
      border: vibe === 'playful' ? `1.5px solid ${tones.ink}` : 'none',
    }}>
      {/* corner tag with monospace label */}
      <div style={{
        position: 'absolute',
        bottom: 10, left: 10,
        padding: '4px 8px',
        background: pal.cream,
        color: tones.ink,
        fontFamily: '"JetBrains Mono", ui-monospace, Menlo, monospace',
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: '0.04em',
        borderRadius: 4,
        textTransform: 'uppercase',
      }}>
        {label}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Icon Chip — 11-category system, default/selected/pressed states
// ─────────────────────────────────────────────────────────────
function IconChip({ category, selected = false, onClick, size = 'md', vibe = 'editorial', iconStyle = 'outline', loading = false, showLabel = true }) {
  const cat = typeof category === 'string'
    ? T.categories.find(c => c.id === category)
    : category;
  if (!cat) return null;

  const pal = T.palette;
  const tint = pal[cat.color];
  const tintL = pal[cat.color + 'L'];
  const tintD = pal[cat.color + 'D'];

  const sizes = {
    sm: { circle: 36, icon: 16, gap: 4, label: 10 },
    md: { circle: 56, icon: 22, gap: 6, label: 11 },
    lg: { circle: 72, icon: 28, gap: 8, label: 12 },
  }[size];

  const isFilled = iconStyle === 'filled' || (iconStyle === 'auto' && vibe === 'playful');
  const isPill = iconStyle === 'pill';

  // Pill style — horizontal chip
  if (isPill) {
    return (
      <button
        onClick={onClick}
        disabled={loading}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 12px',
          borderRadius: T.radii.pill,
          border: `1.5px solid ${selected ? tintD : pal.line}`,
          background: selected ? tintL : pal.cream,
          color: selected ? tintD : pal.ink,
          fontFamily: '"Bricolage Grotesque", system-ui, sans-serif',
          fontSize: 13,
          fontWeight: 500,
          cursor: 'pointer',
          transition: 'all 120ms ease',
        }}>
        <CategoryIcon id={cat.id} size={16} color={selected ? tintD : tint} fillStyle={isFilled ? 'filled' : 'outline'} />
        {showLabel && cat.label.split(' ')[0]}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: sizes.gap,
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: loading ? 'wait' : 'pointer',
        opacity: loading ? 0.4 : 1,
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}>
      <div style={{
        width: sizes.circle,
        height: sizes.circle,
        borderRadius: vibe === 'playful' ? T.radii.lg : T.radii.pill,
        // Selected state: tinted background ring around the chip so the
        // emoji-as-icon stays readable against any device's emoji
        // rendering (Apple, Google, Microsoft all differ slightly).
        background: selected ? tintL : pal.creamSoft,
        border: `${vibe === 'playful' ? 2 : 1.5}px solid ${selected ? tintD : pal.line}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transform: selected && vibe === 'playful' ? 'rotate(-3deg)' : 'none',
        transition: 'all 150ms ease',
        boxShadow: selected && vibe === 'playful'
          ? `3px 3px 0 ${tintD}`
          : selected
            ? `0 2px 8px ${tint}33`
            : 'none',
      }}>
        {/* Line-art SVG icon, brand-tinted. Single-color minimalist
            illustrations for a calmer, more aesthetic chip system. */}
        <CategoryIcon
          id={cat.id}
          size={Math.round(sizes.circle * 0.55)}
          color={selected ? tintD : pal.lilacD}
        />
        <span role="img" aria-label={cat.label} style={{ position: 'absolute', left: -9999 }}>
          {cat.emoji}
        </span>
      </div>
      {showLabel && (
        <span style={{
          fontFamily: '"Bricolage Grotesque", system-ui, sans-serif',
          fontSize: sizes.label,
          fontWeight: 500,
          letterSpacing: '0.02em',
          color: selected ? pal.ink : pal.inkSoft,
          textAlign: 'center',
          lineHeight: 1.2,
          maxWidth: sizes.circle + 16,
        }}>
          {cat.label.split(' & ')[0]}
        </span>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Yay / Nahh buttons — big, opinionated, paired
// ─────────────────────────────────────────────────────────────
function YayNahhButtons({ onYay, onNahh, vibe = 'editorial', vote = null, size = 'lg' }) {
  const pal = T.palette;
  const isLg = size === 'lg';

  const Btn = ({ kind, label, glyph, onClick }) => {
    const isYay = kind === 'yay';
    const tint = isYay ? pal.yay : pal.nahh;
    const tintL = isYay ? pal.sageL : pal.terracottaL;
    const isSelected = vote === kind;
    const isOther = vote && vote !== kind;

    return (
      <button
        onClick={onClick}
        style={{
          flex: 1,
          height: isLg ? 56 : 44,
          borderRadius: vibe === 'playful' ? T.radii.lg : T.radii.pill,
          border: `${vibe === 'playful' ? 2 : 1.5}px solid ${tint}`,
          background: isSelected ? tint : (isOther ? pal.creamSoft : tintL),
          color: isSelected ? pal.cream : tint,
          fontFamily: '"Bricolage Grotesque", system-ui, sans-serif',
          fontSize: isLg ? 17 : 14,
          fontWeight: 600,
          letterSpacing: '0.01em',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          transition: 'all 150ms ease',
          opacity: isOther ? 0.5 : 1,
          transform: isSelected && vibe === 'playful' ? 'rotate(-1.5deg)' : 'none',
          boxShadow: isSelected && vibe === 'playful' ? `3px 3px 0 ${pal.ink}` : 'none',
          WebkitTapHighlightColor: 'transparent',
        }}>
        <span style={{ fontSize: isLg ? 20 : 16 }}>{glyph}</span>
        {label}
      </button>
    );
  };

  return (
    <div style={{ display: 'flex', gap: 10, width: '100%' }}>
      <Btn kind="nahh" label="nahh" glyph="✕" onClick={onNahh} />
      <Btn kind="yay" label="yay" glyph="✓" onClick={onYay} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Venue / Event Card
// ─────────────────────────────────────────────────────────────
function VenueCard({ venue, vibe = 'editorial', density = 'loose', onYay, onNahh, vote = null }) {
  const pal = T.palette;
  const cat = T.categories.find(c => c.id === venue.category);
  const tint = pal[cat.color];
  const tintL = pal[cat.color + 'L'];
  const tintD = pal[cat.color + 'D'];

  const photoH = density === 'tight' ? 180 : 240;
  const cardPad = density === 'tight' ? 12 : 16;

  const heroIconSize = density === 'tight' ? 80 : 110;

  return (
    <div style={{
      background: pal.creamSoft,
      borderRadius: vibe === 'playful' ? T.radii.lg : T.radii.lg,
      border: `1px solid ${pal.line}`,
      overflow: 'hidden',
      boxShadow: vibe === 'playful'
        ? `4px 4px 0 ${pal.ink}`
        : '0 2px 8px rgba(42, 36, 32, 0.04)',
      transform: vibe === 'playful' ? 'rotate(-0.4deg)' : 'none',
    }}>
      {/* Hero zone — show a real photo if we have one (Ticketmaster events
          ship image_url; Google Places venues don't yet). Fall back to a
          colored category tile + icon, which is honest about what data we
          have rather than faking imagery with a stock placeholder. */}
      <div style={{ position: 'relative', padding: cardPad, paddingBottom: 0 }}>
        <div style={{
          width: '100%',
          height: photoH,
          borderRadius: T.radii.md,
          background: tintL,
          border: vibe === 'playful' ? `1.5px solid ${tintD}` : `1px solid ${pal.line}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: tintD,
          overflow: 'hidden',
        }}>
          {venue.image ? (
            <img
              src={venue.image}
              alt={venue.name}
              loading="lazy"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
              }}
              onError={(e) => {
                // If the image fails (broken Ticketmaster URL etc.), hide
                // it and let the category icon underneath show through.
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <CategoryIcon id={cat.id} size={heroIconSize} color={tintD} fillStyle="outline" />
          )}
        </div>
        {/* category badge floating top-left */}
        <div style={{
          position: 'absolute',
          top: cardPad + 10,
          left: cardPad + 10,
          padding: '6px 10px',
          borderRadius: T.radii.pill,
          background: pal.cream,
          color: tintD,
          border: `1.5px solid ${tint}`,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: '"Bricolage Grotesque", system-ui, sans-serif',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.02em',
          boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
        }}>
          <CategoryIcon id={cat.id} size={13} color={tintD} fillStyle="outline" />
          <span>{cat.label}</span>
        </div>
        {/* event date badge — only when this is an event card */}
        {venue.date && (
          <div style={{
            position: 'absolute',
            top: cardPad + 10,
            right: cardPad + 10,
            padding: '6px 10px',
            background: pal.ink,
            color: pal.cream,
            borderRadius: 8,
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.04em',
          }}>
            {venue.date}
          </div>
        )}
        {/* Maps / event-page tap-through pinned to bottom-right of the hero
            so it's actually visible (the inline-link version was getting lost
            below the metadata strip). Stops click propagation so tapping the
            button doesn't also fire any future card-level handler. */}
        {venue.link && (
          <a
            href={venue.link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              bottom: 14,
              right: cardPad + 10,
              padding: '8px 12px',
              background: pal.ink,
              color: pal.cream,
              borderRadius: T.radii.pill,
              fontFamily: '"Bricolage Grotesque", system-ui, sans-serif',
              fontSize: 12,
              fontWeight: 600,
              textDecoration: 'none',
              letterSpacing: '0.01em',
              boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
              whiteSpace: 'nowrap',
            }}>
            {venue.date ? 'Tickets ↗' : 'Maps ↗'}
          </a>
        )}
      </div>

      {/* Text zone — minimal */}
      <div style={{ padding: cardPad, paddingTop: 12 }}>
        <div style={{
          fontFamily: '"Bricolage Grotesque", system-ui, sans-serif',
          fontSize: 19,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          color: pal.ink,
          lineHeight: 1.2,
          marginBottom: 4,
        }}>
          {venue.name}
        </div>
        <div style={{
          fontFamily: '"Bricolage Grotesque", system-ui, sans-serif',
          fontSize: 12,
          fontWeight: 500,
          color: pal.inkMute,
          letterSpacing: '0.02em',
          marginBottom: 8,
        }}>
          {venue.distance}
          {venue.rating ? ` · ${venue.rating}★` : ''}
          {venue.price ? ` · ${'$'.repeat(venue.price)}` : ''}
        </div>
        <div style={{
          fontFamily: '"Bricolage Grotesque", system-ui, sans-serif',
          fontSize: 13,
          fontWeight: 400,
          color: pal.inkSoft,
          lineHeight: 1.4,
          marginBottom: venue.link ? 8 : 14,
        }}>
          {vibe === 'playful' && '“'}{venue.reason}{vibe === 'playful' && '”'}
        </div>
        <YayNahhButtons onYay={onYay} onNahh={onNahh} vibe={vibe} vote={vote} size={density === 'tight' ? 'md' : 'lg'} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Vibe Input — free-text with "Parse" button
// ─────────────────────────────────────────────────────────────
function VibeInput({ value, onChange, onParse, vibe = 'editorial', parsing = false }) {
  const pal = T.palette;
  return (
    <div style={{
      background: pal.creamSoft,
      border: `1.5px solid ${pal.line}`,
      borderRadius: vibe === 'playful' ? T.radii.lg : T.radii.md,
      padding: 12,
      transform: vibe === 'playful' ? 'rotate(-0.3deg)' : 'none',
      boxShadow: vibe === 'playful' ? `3px 3px 0 ${pal.ink}` : 'none',
    }}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="chill cocktail night, no clubs"
        rows={2}
        style={{
          width: '100%',
          border: 'none',
          background: 'transparent',
          resize: 'none',
          outline: 'none',
          fontFamily: '"Bricolage Grotesque", system-ui, sans-serif',
          fontSize: 15,
          lineHeight: 1.4,
          color: pal.ink,
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        <span style={{
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          fontSize: 10,
          color: pal.inkMute,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}>
          tell us the vibe
        </span>
        <button
          onClick={onParse}
          disabled={!value || parsing}
          style={{
            padding: '6px 12px',
            borderRadius: T.radii.pill,
            border: 'none',
            background: value && !parsing ? pal.ink : pal.line,
            color: value && !parsing ? pal.cream : pal.inkMute,
            fontFamily: '"Bricolage Grotesque", system-ui, sans-serif',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.02em',
            cursor: value && !parsing ? 'pointer' : 'not-allowed',
          }}>
          {parsing ? 'parsing…' : 'parse →'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Budget Chip — $ / $$ / $$$ / $$$$
// ─────────────────────────────────────────────────────────────
function BudgetChip({ value, onChange, vibe = 'editorial' }) {
  const pal = T.palette;
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {[1,2,3,4].map((n) => {
        const active = n <= value;
        return (
          <button
            key={n}
            onClick={() => onChange(n)}
            style={{
              flex: 1,
              height: 44,
              borderRadius: vibe === 'playful' ? T.radii.md : T.radii.pill,
              border: `1.5px solid ${active ? pal.terracottaD : pal.line}`,
              background: active ? pal.terracottaL : pal.creamSoft,
              color: active ? pal.terracottaD : pal.inkMute,
              fontFamily: '"Bricolage Grotesque", system-ui, sans-serif',
              fontSize: 17,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 120ms ease',
            }}>
            {'$'.repeat(n)}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Distance slider
// ─────────────────────────────────────────────────────────────
function DistanceSlider({ value, onChange, vibe = 'editorial' }) {
  const pal = T.palette;
  const min = 1, max = 15;
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div>
      <div style={{
        position: 'relative',
        height: 44,
        display: 'flex',
        alignItems: 'center',
      }}>
        <div style={{
          position: 'absolute',
          left: 0, right: 0,
          height: 6,
          background: pal.line,
          borderRadius: T.radii.pill,
        }} />
        <div style={{
          position: 'absolute',
          left: 0,
          width: `${pct}%`,
          height: 6,
          background: pal.terracotta,
          borderRadius: T.radii.pill,
        }} />
        <input
          type="range"
          min={min} max={max} step={1}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          style={{
            position: 'absolute',
            left: 0, right: 0,
            width: '100%',
            opacity: 0,
            height: 44,
            cursor: 'pointer',
          }}
        />
        <div style={{
          position: 'absolute',
          left: `calc(${pct}% - 14px)`,
          width: 28, height: 28,
          borderRadius: T.radii.pill,
          background: pal.cream,
          border: `2px solid ${pal.terracotta}`,
          boxShadow: vibe === 'playful' ? `2px 2px 0 ${pal.ink}` : '0 2px 6px rgba(0,0,0,0.12)',
          pointerEvents: 'none',
        }} />
      </div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: 4,
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        fontSize: 10,
        color: pal.inkMute,
        letterSpacing: '0.04em',
      }}>
        <span>1 mi</span>
        <span style={{ color: pal.terracottaD, fontWeight: 600 }}>{value} mi</span>
        <span>15+ mi</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Avatar — initials in colored circle
// ─────────────────────────────────────────────────────────────
function Avatar({ name, color = 'sage', size = 36, vote = null, vibe = 'editorial' }) {
  const pal = T.palette;
  const tint = pal[color];
  const tintL = pal[color + 'L'];
  const tintD = pal[color + 'D'];
  const initial = (name || '?').trim().slice(0, 1).toUpperCase();

  const ring = vote === 'yay' ? pal.yay : vote === 'nahh' ? pal.nahh : null;

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <div style={{
        width: size, height: size,
        borderRadius: T.radii.pill,
        background: tintL,
        color: tintD,
        border: `${ring ? 2 : 1}px solid ${ring || tint}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '"Bricolage Grotesque", system-ui, sans-serif',
        fontSize: size * 0.42,
        fontWeight: 600,
        letterSpacing: '0.02em',
      }}>
        {initial}
      </div>
      {vote && (
        <div style={{
          position: 'absolute',
          right: -2, bottom: -2,
          width: 16, height: 16,
          borderRadius: T.radii.pill,
          background: vote === 'yay' ? pal.yay : pal.nahh,
          color: pal.cream,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 9,
          fontWeight: 700,
          border: `2px solid ${pal.cream}`,
        }}>
          {vote === 'yay' ? '✓' : '✕'}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Section header
// ─────────────────────────────────────────────────────────────
function SectionLabel({ children, vibe = 'editorial' }) {
  const pal = T.palette;
  return (
    <div style={{
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      fontSize: 11,
      fontWeight: 500,
      letterSpacing: '0.08em',
      color: pal.inkMute,
      textTransform: 'uppercase',
      marginBottom: 10,
    }}>
      {vibe === 'playful' && '— '}{children}{vibe === 'playful' && ' —'}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Primary button
// ─────────────────────────────────────────────────────────────
function PrimaryButton({ children, onClick, disabled = false, vibe = 'editorial', tone = 'ink' }) {
  const pal = T.palette;
  const bg = tone === 'terracotta' ? pal.terracotta : pal.ink;
  const bgD = tone === 'terracotta' ? pal.terracottaD : pal.black;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        height: 52,
        borderRadius: vibe === 'playful' ? T.radii.lg : T.radii.pill,
        border: `${vibe === 'playful' ? 2 : 0}px solid ${pal.ink}`,
        background: disabled ? pal.line : bg,
        color: disabled ? pal.inkMute : pal.cream,
        fontFamily: '"Bricolage Grotesque", system-ui, sans-serif',
        fontSize: 16,
        fontWeight: 600,
        letterSpacing: '0.01em',
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: vibe === 'playful' && !disabled ? `4px 4px 0 ${pal.ink}` : 'none',
        transform: vibe === 'playful' && !disabled ? 'rotate(-0.5deg)' : 'none',
        transition: 'all 120ms ease',
      }}>
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Bottom navigation — persistent tab bar shown on the "destination"
// screens (Home / Memories / Profile). Hidden on mid-flow screens
// (Auth / Join / Create / SetPrefs / Lobby / Recs / Decision) where
// the screen-level action button lives at the bottom and would
// compete with this. Tab icons are simple inline SVGs styled to the
// rest of the design system.
// ─────────────────────────────────────────────────────────────
function BottomNav({ active, onChange, vibe = 'editorial' }) {
  const pal = T.palette;
  const tabs = [
    { id: 'home',     label: 'Plans',    icon: NavPlansIcon },
    { id: 'create',   label: 'New',      icon: NavPlusIcon, accent: true },
    { id: 'memories', label: 'Memories', icon: NavMemoriesIcon },
    { id: 'profile',  label: 'You',      icon: NavYouIcon },
  ];
  return (
    <nav style={{
      position: 'absolute',
      left: 0, right: 0, bottom: 0,
      // Sit above the iOS home-indicator safe area on the real device.
      paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))',
      paddingTop: 8,
      background: pal.cream,
      borderTop: `1px solid ${pal.line}`,
      display: 'flex',
      justifyContent: 'space-around',
      alignItems: 'flex-end',
      zIndex: 10,
      boxShadow: '0 -4px 12px rgba(42, 36, 32, 0.04)',
    }}>
      {tabs.map((t) => {
        const isActive = active === t.id;
        const Icon = t.icon;
        const accent = !!t.accent;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            aria-label={t.label}
            aria-current={isActive ? 'page' : undefined}
            style={{
              flex: 1,
              padding: '6px 4px 8px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              color: pal.ink,
              fontFamily: 'Inter, sans-serif',
              WebkitTapHighlightColor: 'transparent',
            }}>
            {accent ? (
              // The "+" tab is rendered as a filled terracotta circle —
              // the standard center-action pattern from Instagram/Tinder.
              // Stays at the same size whether active or not so it always
              // reads as the primary CTA on the bar.
              <div style={{
                width: 44, height: 44,
                borderRadius: '50%',
                background: pal.terracotta,
                color: pal.cream,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: vibe === 'playful'
                  ? `2px 2px 0 ${pal.ink}`
                  : '0 4px 10px rgba(194, 90, 60, 0.32)',
              }}>
                <Icon size={22} color={pal.cream} />
              </div>
            ) : (
              <div style={{
                width: 30, height: 30,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isActive ? pal.terracotta : pal.inkMute,
                transition: 'color 120ms',
              }}>
                <Icon size={22} color={isActive ? pal.terracotta : pal.inkMute} />
              </div>
            )}
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.02em',
              color: accent
                ? pal.terracotta
                : isActive ? pal.terracotta : pal.inkMute,
            }}>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// Tiny inline nav icons. Kept here (not in icons.jsx) because they're
// purely structural — different vocabulary from the category icons.
function NavPlansIcon({ size = 22, color = 'currentColor' }) {
  // Stack of two cards = your plans/groups list.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
      <rect x="4" y="6" width="14" height="11" rx="2" stroke={color} strokeWidth="1.7" />
      <rect x="7" y="3" width="14" height="11" rx="2" stroke={color} strokeWidth="1.7" fill="none" />
    </svg>
  );
}
function NavPlusIcon({ size = 22, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
      <path d="M12 5 L12 19 M5 12 L19 12" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
function NavMemoriesIcon({ size = 22, color = 'currentColor' }) {
  // A photo card with a small mountain peak + sun — the "memory" abstraction.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" stroke={color} strokeWidth="1.7" />
      <circle cx="8" cy="9" r="1.5" fill={color} />
      <path d="M5 16 L10 11 L13 14 L16 11 L19 14" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function NavYouIcon({ size = 22, color = 'currentColor' }) {
  // Head + shoulders silhouette.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
      <circle cx="12" cy="9" r="3.5" stroke={color} strokeWidth="1.7" />
      <path d="M5 19 C5 15.5 8 13.5 12 13.5 C16 13.5 19 15.5 19 19" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

// Export to window
Object.assign(window, {
  StripedPlaceholder, IconChip, YayNahhButtons, VenueCard,
  VibeInput, BudgetChip, DistanceSlider, Avatar, SectionLabel, PrimaryButton,
  BottomNav,
});
