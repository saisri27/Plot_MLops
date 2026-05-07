// Plot — Design Tokens
// 11 categories, 2 themes (Editorial-Craft, Playful-Zine), shared palette base.

window.PLOT_TOKENS = (function () {
  // ── Color palette (PREVIEW — design spec v1: indigo + lavender + pink) ──
  const palette = {
    cream:       '#E8E2F4',  // light lavender surface (page bg)
    creamDeep:   '#D6CCE8',  // surfaces
    creamSoft:   '#F4F0FA',  // cards
    ink:         '#1E1B4B',  // primary text — deep indigo
    inkSoft:     '#4A3C6B',  // secondary text
    inkMute:     '#7B6BAF',  // tertiary
    line:        '#C9BDE0',  // hairlines
    lineSoft:    '#D6CCE8',
    terracotta:  '#E85E75',  // primary (pink-red action)
    terracottaD: '#C2435C',  // pressed
    terracottaL: '#F8C6D0',  // selected fill
    sage:        '#8FA67A',  // secondary (kept for category differentiation)
    sageD:       '#6E8659',
    sageL:       '#D6E0C7',
    lilac:       '#A995E1',  // accent — lavender
    lilacD:      '#8775BD',
    lilacL:      '#D6CCE8',
    peach:       '#F4C674',  // highlight (kept for category differentiation)
    peachD:      '#D9A551',
    peachL:      '#FBE8C2',
    yay:         '#A995E1',  // lavender (was sage-dark)
    nahh:        '#E85E75',  // pink-red (was terracotta)
    white:       '#FFFFFF',
    black:       '#1E1B4B',
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
  // Each category: id, label, glyph (legacy decorative char), emoji
  // (kawaii illustration shown in chips/cards), and color tint.
  // The emoji column matches the cute illustrated reference style the
  // user sketched out — iOS / Mac users see Apple's emoji which has
  // exactly that look, Android sees Google's, both are recognizable.
  const categories = [
    { id: 'food',     label: 'Food & Drink',       glyph: '◐', emoji: '🍔', color: 'terracotta' },
    { id: 'outdoors', label: 'Outdoors',           glyph: '▲', emoji: '🏞️', color: 'sage' },
    { id: 'ent',      label: 'Entertainment',      glyph: '▶', emoji: '🎬', color: 'lilac' },
    { id: 'arts',     label: 'Arts & Workshops',   glyph: '◆', emoji: '🎨', color: 'peach' },
    { id: 'night',    label: 'Nightlife',          glyph: '◑', emoji: '🪩', color: 'lilac' },
    { id: 'sports',   label: 'Sports & Rec',       glyph: '●', emoji: '🏀', color: 'sage' },
    { id: 'wellness', label: 'Wellness & Beauty',  glyph: '✿', emoji: '🧘', color: 'peach' },
    { id: 'shop',     label: 'Shopping',           glyph: '◧', emoji: '🛍️', color: 'terracotta' },
    { id: 'pets',     label: 'Pets & Animals',     glyph: '❀', emoji: '🐶', color: 'peach' },
    { id: 'music',    label: 'Music & Live Shows', glyph: '♪', emoji: '🎵', color: 'lilac' },
  ];

  return { palette, type, space, radii, categories };
})();
