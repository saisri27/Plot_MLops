// Plot — API client
// Plain JS, no build step. Loaded as a normal <script> before the JSX
// modules so window.PLOT_API is available everywhere.
//
// Skipping auth for the 4-day deadline: we mint a stable random user_id
// per browser, persist in localStorage. When real Supabase Auth lands,
// swap getUserId() to read the JWT-derived id.

window.PLOT_API = (function () {
  // ── API base URL ─────────────────────────────────────────────────
  // Allow override via ?api=... query param for local dev against
  // localhost:8080 without rebuilding the image.
  const params = new URLSearchParams(window.location.search);
  const API_BASE =
    params.get('api') ||
    'https://plot-decision-engine-773940296505.us-central1.run.app';

  // ── chip-id → canonical backend category name ────────────────────
  // The chip labels are shortened for UI fit (e.g. "Sports & Rec"); the
  // backend's ALLOWED_CATEGORIES uses the long form. Translate here so
  // tokens.js stays a pure design file.
  const ID_TO_API_NAME = {
    food:     'Food & Drink',
    outdoors: 'Outdoors',
    ent:      'Entertainment',
    arts:     'Arts & Culture',
    night:    'Nightlife',
    sports:   'Sports & Recreation',
    wellness: 'Wellness & Beauty',
    shop:     'Shopping',
    classes:  'Classes & Workshops',
    pets:     'Pets & Animals',
    music:    'Music & Live Shows',
  };
  function chipIdsToCategories(ids) {
    return (ids || []).map((id) => ID_TO_API_NAME[id]).filter(Boolean);
  }
  // Reverse: figure out which chip an API-returned category belongs to
  // (so cards can render the right icon).
  const API_NAME_TO_ID = Object.fromEntries(
    Object.entries(ID_TO_API_NAME).map(([id, name]) => [name, id])
  );

  // ── localStorage user_id (no auth) ───────────────────────────────
  function getUserId() {
    let id = localStorage.getItem('plot_user_id');
    if (!id) {
      id = 'u_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('plot_user_id', id);
    }
    return id;
  }

  // ── tiny fetch wrapper with timeout + JSON parsing ───────────────
  async function call(method, path, body, timeoutMs = 15000) {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(API_BASE + path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) {
        const detail = data && data.detail ? data.detail : res.statusText;
        throw new Error(`${res.status} ${detail}`);
      }
      return data;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ── /recommend ───────────────────────────────────────────────────
  // prefs = { budget, categories, max_distance_km }
  function recommend(prefs, top_k = 5) {
    return call('POST', '/recommend', {
      users: [{
        user_id: getUserId(),
        budget: prefs.budget || 'medium',
        categories: prefs.categories || ['Food & Drink'],
        max_distance_km: prefs.max_distance_km || 5,
      }],
      top_k,
    });
  }

  // ── /events ──────────────────────────────────────────────────────
  function events(prefs, top_k = 10) {
    return call('POST', '/events', {
      categories: prefs.categories || ['Music & Live Shows'],
      max_distance_km: prefs.max_distance_km || 10,
      days_ahead: 60,
      top_k,
    });
  }

  // ── /parse ───────────────────────────────────────────────────────
  function parse(free_text) {
    return call('POST', '/parse', { free_text });
  }

  // ── /feedback ────────────────────────────────────────────────────
  // signal: 'yay' | 'nahh' | 'visited'
  function feedback(rec_id, venue_name, signal) {
    return call('POST', '/feedback', {
      user_id: getUserId(),
      rec_id,
      venue_name,
      signal,
    });
  }

  return {
    API_BASE,
    getUserId,
    recommend,
    events,
    parse,
    feedback,
    chipIdsToCategories,
    apiNameToChipId: (name) => API_NAME_TO_ID[name],
  };
})();
