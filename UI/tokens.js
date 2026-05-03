// Plot — Design Tokens
// 11 categories, 2 themes (Editorial-Craft, Playful-Zine), shared palette base.

window.PLOT_TOKENS = (function () {
  // ── Color palette (warm SF cafes + outdoor markets) ─────────────
  const palette = {
    cream:       '#F2EEE8',  // soft off-white, slight cool warm balance
    creamDeep:   '#E5DED2',  // surfaces
    creamSoft:   '#F8F5EF',  // cards
    ink:         '#2A2420',  // primary text
    inkSoft:     '#5A4F46',  // secondary text
    inkMute:     '#8B7E72',  // tertiary
    line:        '#DDD4C2',  // hairlines
    lineSoft:    '#E5DED2',
    terracotta:  '#C25A3C',  // primary
    terracottaD: '#A6452A',  // pressed
    terracottaL: '#E8BFAF',  // selected fill
    sage:        '#8FA67A',  // secondary
    sageD:       '#6E8659',
    sageL:       '#D6E0C7',
    lilac:       '#B7A6D6',  // accent
    lilacD:      '#9783BD',
    lilacL:      '#E5DEF1',
    peach:       '#F4C674',  // highlight
    peachD:      '#D9A551',
    peachL:      '#FBE8C2',
    yay:         '#6E8659',  // sage-dark
    nahh:        '#C25A3C',  // terracotta
    white:       '#FFFFFF',
    black:       '#1A1612',
  };

  // ── 4-step type scale ───────────────────────────────────────────
  const type = {
    display: { size: 32, line: 36, weight: 500, track: '-0.02em' },
    title:   { size: 22, line: 28, weight: 500, track: '-0.01em' },
    body:    { size: 15, line: 21, weight: 400, track: '0' },
    caption: { size: 12, line: 16, weight: 500, track: '0.02em' },
  };

  // ── Spacing & radii ─────────────────────────────────────────────
  const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
  const radii = { sm: 8, md: 14, lg: 20, xl: 28, pill: 999 };

  // ── 11 Categories ───────────────────────────────────────────────
  // Each category: id, label, glyph (single character / shape), color tint
  const categories = [
    { id: 'food',     label: 'Food & Drink',       glyph: '◐', color: 'terracotta' },
    { id: 'outdoors', label: 'Outdoors',           glyph: '▲', color: 'sage' },
    { id: 'ent',      label: 'Entertainment',      glyph: '▶', color: 'lilac' },
    { id: 'arts',     label: 'Arts & Culture',     glyph: '◆', color: 'peach' },
    { id: 'night',    label: 'Nightlife',          glyph: '◑', color: 'lilac' },
    { id: 'sports',   label: 'Sports & Rec',       glyph: '●', color: 'sage' },
    { id: 'wellness', label: 'Wellness & Beauty',  glyph: '✿', color: 'peach' },
    { id: 'shop',     label: 'Shopping',           glyph: '◧', color: 'terracotta' },
    { id: 'classes',  label: 'Classes & Workshops',glyph: '✚', color: 'sage' },
    { id: 'pets',     label: 'Pets & Animals',     glyph: '❀', color: 'peach' },
    { id: 'music',    label: 'Music & Live Shows', glyph: '♪', color: 'lilac' },
  ];

  return { palette, type, space, radii, categories };
})();
