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
  // 25 s timeout: an LLM rerank with top_k=8 takes 5–10 s warm and up
  // to ~15 s on a Cloud Run cold start. The default 15 s aborted the
  // first request after a long idle, which the user saw as
  // "Something went wrong fetching picks".
  function recommend(prefs, top_k = 5) {
    return call(
      'POST',
      '/recommend',
      {
        users: [{
          user_id: getUserId(),
          budget: prefs.budget || 'medium',
          categories: prefs.categories || ['Food & Drink'],
          max_distance_km: prefs.max_distance_km || 5,
        }],
        top_k,
      },
      25000,
    );
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

  // ── Memories (localStorage-backed for the 4-day demo) ────────────
  // We don't yet have a backend table for visited places + photos.
  // For the demo we persist memories per-browser in localStorage. The
  // /feedback signal=visited still goes to Supabase so the ML pipeline
  // sees the strongest training signal — this localStorage layer is
  // only the UI's "Memories" gallery cache.
  const MEM_KEY = 'plot_memories_v1';

  function getMemories() {
    try {
      const raw = localStorage.getItem(MEM_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function _saveMemories(arr) {
    try {
      localStorage.setItem(MEM_KEY, JSON.stringify(arr));
    } catch (e) {
      // Quota usually means an oversized photo. The caller is responsible
      // for compressing before they hand us a dataURL; if we still
      // overflow we just drop the oldest memory and retry once.
      if (e && e.name === 'QuotaExceededError' && arr.length > 1) {
        try {
          localStorage.setItem(MEM_KEY, JSON.stringify(arr.slice(1)));
        } catch (e2) {
          /* give up silently — UI shows what fits */
        }
      }
    }
  }

  function addMemory(memory) {
    const list = getMemories();
    // Keep only one entry per (venue + visit-day) so re-clicking "We went"
    // doesn't duplicate.
    const day = (memory.visited_at || new Date().toISOString()).slice(0, 10);
    const filtered = list.filter(
      (m) => !(m.name === memory.name && (m.visited_at || '').slice(0, 10) === day)
    );
    const stamped = {
      id: `${memory.name}__${day}`.replace(/[^a-zA-Z0-9_-]/g, '_'),
      visited_at: memory.visited_at || new Date().toISOString(),
      photo: null,
      ...memory,
    };
    const next = [stamped, ...filtered];
    _saveMemories(next);
    return stamped;
  }

  function setMemoryPhoto(id, dataURL) {
    const list = getMemories();
    const next = list.map((m) => (m.id === id ? { ...m, photo: dataURL } : m));
    _saveMemories(next);
  }

  // Compress a File from <input type=file accept=image/*> into a JPEG
  // dataURL that's small enough to fit in localStorage (which caps at
  // ~5 MB total per origin in most browsers). Resizes to maxDim and
  // re-encodes at the given quality — typical iPhone photo (3 MB) ends
  // up ~150–300 KB after compression.
  function compressImageFile(file, maxDim = 900, quality = 0.72) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('read failed'));
      reader.onload = (ev) => {
        const img = new Image();
        img.onerror = () => reject(new Error('decode failed'));
        img.onload = () => {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
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
    // Memories (localStorage-backed for now)
    getMemories,
    addMemory,
    setMemoryPhoto,
    compressImageFile,
  };
})();
