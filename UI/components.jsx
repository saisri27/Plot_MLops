// Plot — Components
// IconChip, StripedPlaceholder, VenueCard, YayNahh, VibeInput, BudgetChip, DistanceSlider

const T = window.PLOT_TOKENS;

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
          fontFamily: 'Inter, system-ui, sans-serif',
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
        background: selected ? (isFilled ? tint : tintL) : pal.creamSoft,
        border: `${vibe === 'playful' ? 2 : 1.5}px solid ${selected ? tintD : pal.line}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: selected ? (isFilled ? pal.cream : tintD) : pal.inkSoft,
        fontSize: sizes.icon,
        transform: selected && vibe === 'playful' ? 'rotate(-3deg)' : 'none',
        transition: 'all 150ms ease',
        boxShadow: selected && vibe === 'playful'
          ? `3px 3px 0 ${tintD}`
          : selected
            ? `0 2px 8px ${tint}33`
            : 'none',
      }}>
        <CategoryIcon
          id={cat.id}
          size={sizes.icon}
          color={selected ? (isFilled ? pal.cream : tintD) : pal.inkSoft}
          fillStyle={isFilled ? 'filled' : 'outline'}
        />
      </div>
      {showLabel && (
        <span style={{
          fontFamily: 'Inter, system-ui, sans-serif',
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
          fontFamily: 'Inter, system-ui, sans-serif',
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
  const tintD = pal[cat.color + 'D'];

  const photoH = density === 'tight' ? 180 : 240;
  const cardPad = density === 'tight' ? 12 : 16;

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
      {/* Photo zone — 60%+ of card */}
      <div style={{ position: 'relative', padding: cardPad, paddingBottom: 0 }}>
        <StripedPlaceholder
          label={venue.name}
          height={photoH}
          tone={cat.color}
          vibe={vibe}
        />
        {/* category icon chip floating top-left */}
        <div style={{
          position: 'absolute',
          top: cardPad + 10,
          left: cardPad + 10,
          width: 36, height: 36,
          borderRadius: vibe === 'playful' ? 10 : T.radii.pill,
          background: pal.cream,
          border: `1.5px solid ${tint}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
        }}>
          <CategoryIcon id={cat.id} size={18} color={tintD} fillStyle="outline" />
        </div>
        {/* event date badge if event */}
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
      </div>

      {/* Text zone — minimal */}
      <div style={{ padding: cardPad, paddingTop: 12 }}>
        <div style={{
          fontFamily: 'Inter, system-ui, sans-serif',
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
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 12,
          fontWeight: 500,
          color: pal.inkMute,
          letterSpacing: '0.02em',
          marginBottom: 8,
        }}>
          {venue.distance} · {venue.rating}★ · {'$'.repeat(venue.price)}
        </div>
        <div style={{
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 13,
          fontWeight: 400,
          color: pal.inkSoft,
          lineHeight: 1.4,
          marginBottom: 14,
          fontStyle: vibe === 'playful' ? 'normal' : 'normal',
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
          fontFamily: 'Inter, system-ui, sans-serif',
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
            fontFamily: 'Inter, system-ui, sans-serif',
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
              fontFamily: 'Inter, system-ui, sans-serif',
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
        fontFamily: 'Inter, system-ui, sans-serif',
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
        fontFamily: 'Inter, system-ui, sans-serif',
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

// Export to window
Object.assign(window, {
  StripedPlaceholder, IconChip, YayNahhButtons, VenueCard,
  VibeInput, BudgetChip, DistanceSlider, Avatar, SectionLabel, PrimaryButton,
});
