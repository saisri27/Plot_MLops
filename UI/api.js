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
    arts:     'Arts & Workshops',
    night:    'Nightlife',
    sports:   'Sports & Recreation',
    wellness: 'Wellness & Beauty',
    shop:     'Shopping',
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

  // ── localStorage user_id ─────────────────────────────────────────
  // Two paths:
  //   * Signed-in session  → user_id is deterministically derived from
  //     the email. Same email anywhere → same identity → same groups,
  //     votes, memories. This is what makes "sign in with my credentials
  //     on a different phone" actually carry your data over.
  //   * No session yet      → fall back to a random per-browser id so
  //     the boot path (which fires before AuthScreen) still has *some*
  //     user_id to call APIs with. The deterministic one overwrites it
  //     the moment the user signs in.
  function _emailToUserId(email) {
    const norm = (email || '').trim().toLowerCase();
    if (!norm) return null;
    // Stable, non-cryptographic — we don't need security here, just
    // determinism. Replace anything non-alphanumeric with underscore
    // so the id stays URL/path-safe for /users/{id}/profile.
    return 'u_' + norm.replace(/[^a-z0-9]/g, '_').slice(0, 40);
  }

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

  // ── /groups (multi-user shareable-link sessions) ─────────────────

  function createGroup(name, displayName) {
    return call('POST', '/groups', {
      name,
      creator_user_id: getUserId(),
      creator_display_name: displayName || null,
    });
  }

  function peekGroupByToken(token) {
    return call('GET', `/groups/by-token/${encodeURIComponent(token)}`);
  }

  function joinGroupAPI(groupId, displayName) {
    return call('POST', `/groups/${encodeURIComponent(groupId)}/join`, {
      user_id: getUserId(),
      display_name: displayName,
    });
  }

  function setGroupPrefs(groupId, prefs) {
    return call('POST', `/groups/${encodeURIComponent(groupId)}/prefs`, {
      user_id: getUserId(),
      budget: prefs.budget || 'medium',
      categories: prefs.categories || [],
      max_distance_km: prefs.max_distance_km || 5,
    });
  }

  function getGroupState(groupId) {
    return call('GET', `/groups/${encodeURIComponent(groupId)}`);
  }

  // 25 s timeout to match the solo /recommend — group rerank is the same
  // LLM call, just with merged-pref input.
  function groupRecommend(groupId, top_k = 5) {
    return call(
      'POST',
      `/groups/${encodeURIComponent(groupId)}/recommend`,
      { requested_by: getUserId(), top_k },
      25000,
    );
  }

  function groupVote(groupId, venueName, signal) {
    return call('POST', `/groups/${encodeURIComponent(groupId)}/vote`, {
      user_id: getUserId(),
      venue_name: venueName,
      signal,
    });
  }

  function listMyGroups() {
    return call('GET', `/users/${encodeURIComponent(getUserId())}/groups`);
  }

  // ── Session (email + "password") ─────────────────────────────────
  // For the 4-day demo we don't have real auth. The email is stored
  // locally as a cosmetic session marker; the password is never sent
  // anywhere or validated. Real Supabase Auth (magic link or OAuth)
  // is the v1.1 plan — when it lands, swap getEmail() to read from
  // supabase.auth.getUser() and the rest of the app keeps working.
  const SESSION_KEY = 'plot_session_v1';

  function getSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function setSession(email) {
    const trimmed = (email || '').trim().toLowerCase();
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        email: trimmed,
        signed_in_at: new Date().toISOString(),
      }));
      // Replace the per-browser random user_id with one deterministically
      // derived from this email so signing in on a different device with
      // the same email lands on the same identity. Pre-auth random-id
      // data (memories, groups created without signing in) is orphaned —
      // same as it would be under real auth.
      const derived = _emailToUserId(trimmed);
      if (derived) localStorage.setItem('plot_user_id', derived);
      // Drop any stale local profile so a different email doesn't reuse
      // the previous session's name/pronouns/avatar. The next ProfileSetup
      // pass will rebuild it from /users/{id}/profile or fresh inputs.
      try { localStorage.removeItem('plot_profile_v1'); } catch (e) { /* ignore */ }
    } catch (e) { /* ignore */ }
  }

  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
    // Also drop the email-derived user_id and the local profile cache
    // so signing back in with a different email doesn't inherit the
    // previous user's identity or name.
    try { localStorage.removeItem('plot_user_id'); } catch (e) { /* ignore */ }
    try { localStorage.removeItem('plot_profile_v1'); } catch (e) { /* ignore */ }
  }

  function getEmail() {
    const s = getSession();
    return s ? s.email : null;
  }

  // ── User profile (name, pronouns, DOB, avatar) ───────────────────
  // For the demo we don't have real auth — identity is the localStorage
  // user_id. The profile fields below are stored on the `users` table
  // server-side AND mirrored in localStorage so the UI is responsive
  // without a round-trip.
  const PROFILE_KEY = 'plot_profile_v1';

  function getLocalProfile() {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function _saveLocalProfile(p) {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch (e) { /* ignore */ }
  }

  function fetchProfile() {
    return call('GET', `/users/${encodeURIComponent(getUserId())}/profile`);
  }

  async function saveProfile({ name, pronouns, date_of_birth, avatar }) {
    const body = {
      name: (name || '').trim(),
      pronouns: pronouns || null,
      date_of_birth: date_of_birth || null,
    };
    let res;
    try {
      res = await call('PUT', `/users/${encodeURIComponent(getUserId())}/profile`, body);
    } catch (e) {
      // Backend write failed — still let the user proceed with a
      // local-only profile so the demo never blocks on connectivity.
      res = { ...body };
    }
    // Avatar is local-only for now (server has no profile-photo column
    // or Supabase Storage bucket yet — that's a v1.1 feature). Merge it
    // alongside the server-confirmed fields so the next launch sees both.
    const existing = getLocalProfile() || {};
    _saveLocalProfile({
      name: res.name || body.name || existing.name,
      pronouns: res.pronouns ?? body.pronouns ?? existing.pronouns,
      date_of_birth: res.date_of_birth || body.date_of_birth || existing.date_of_birth,
      avatar: avatar !== undefined ? avatar : (existing.avatar || null),
    });
    // Also update the legacy display-name cache so JoinGroup / CreateGroup
    // pre-fill correctly.
    if (res.name) setDisplayName(res.name);
    return res;
  }

  // Convenience: replace just the avatar without touching other fields.
  // dataURL is a JPEG produced by compressImageFile (canvas-resized, ~150 KB).
  function setLocalAvatar(dataURL) {
    const existing = getLocalProfile() || {};
    _saveLocalProfile({ ...existing, avatar: dataURL || null });
  }

  // ── currentGroup (the group the user is actively planning in) ────
  // Stored in localStorage so a refresh keeps you in your group rather
  // than dumping you back to the solo flow.
  const CURRENT_GROUP_KEY = 'plot_current_group_v1';

  function getCurrentGroup() {
    try {
      const raw = localStorage.getItem(CURRENT_GROUP_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setCurrentGroup(group) {
    try {
      localStorage.setItem(CURRENT_GROUP_KEY, JSON.stringify(group));
    } catch (e) { /* quota — ignore */ }
  }

  function clearCurrentGroup() {
    try { localStorage.removeItem(CURRENT_GROUP_KEY); } catch (e) { /* ignore */ }
  }

  // ── User display name (for sign-in / group join) ─────────────────
  // Survives sign-out so returning users don't have to retype.
  const NAME_KEY = 'plot_display_name_v1';

  function getDisplayName() {
    try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; }
  }

  function setDisplayName(name) {
    try { localStorage.setItem(NAME_KEY, name); } catch (e) { /* ignore */ }
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
    // Groups
    createGroup,
    peekGroupByToken,
    joinGroupAPI,
    setGroupPrefs,
    getGroupState,
    groupRecommend,
    groupVote,
    listMyGroups,
    getCurrentGroup,
    setCurrentGroup,
    clearCurrentGroup,
    getDisplayName,
    setDisplayName,
    // Profile (name, pronouns, DOB, avatar)
    getLocalProfile,
    fetchProfile,
    saveProfile,
    setLocalAvatar,
    // Cosmetic session (email + fake password) — replace with real Auth in v1.1
    getSession,
    setSession,
    clearSession,
    getEmail,
  };
})();
