// ─── CONFIG ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://ygqfhuuomdunetpvwhrj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlncWZodXVvbWR1bmV0cHZ3aHJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNDY5NjgsImV4cCI6MjA5NTgyMjk2OH0.X-yHD2uC1ua1troWyNEOmUobFVyhbbXyNmL_oBhL1A0';
const DEFAULT_START = '2026-06-01'; // Day 1

// ─── SUPABASE CLIENT ───────────────────────────────────────────────────────────
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── STATE ─────────────────────────────────────────────────────────────────────
const DEFAULT_RATINGS = { skin: 0, energy: 0, hip: 0, knee: 0, back: 0, weed: null, notes: '', sleep: '' };

let habits = [];
let todayChecks = {}; // habitId -> boolean
let ratings = { ...DEFAULT_RATINGS };
let gymState = {}; // exerciseName -> { sets: [{weight_kg, reps}] } | physio key -> { done }
let progressData = {};
let useKg = true;
let activeLogDate = null; // which calendar day todayChecks belongs to
let pendingCheckSync = new Set();

// ─── APP STORE (settings, water, photos — one Supabase table) ─────────────────
const appStore = { settings: {}, water: {}, photos: { start: null, weeks: {} } };
let appStoreReady = false;
const PHOTO_BUCKET = 'progress-photos';

function defaultAppSettings() {
  return {
    startDate: DEFAULT_START,
    hiddenBlocks: [],
    notifSettings: { ...NOTIF_DEFAULTS },
    useKg: true,
    waterGoal: 8,
    gymConfig: null,
    gymOverrides: {},
    liftChartExercise: null,
  };
}

function readLocalJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

async function saveStoreKey(key, value) {
  appStore[key === 'settings' ? 'settings' : key === 'water' ? 'water' : 'photos'] = value;
  localStorage.setItem(`store-${key}`, JSON.stringify(value));
  try {
    const existing = await api('app_storage', 'GET', null, `?key=eq.${encodeURIComponent(key)}&limit=1`);
    const payload = { value, updated_at: new Date().toISOString() };
    if (existing?.length) {
      await api('app_storage', 'PATCH', payload, `?key=eq.${encodeURIComponent(key)}`);
    } else {
      await api('app_storage', 'POST', { key, ...payload });
    }
  } catch {
    // Offline — local cache kept
  }
}

function collectLegacyWater() {
  const water = { ...appStore.water };
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k?.startsWith('water-') || k === 'waterGoal') continue;
    const date = k.slice(6);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    try {
      const parsed = JSON.parse(localStorage.getItem(k));
      water[date] = typeof parsed === 'number' ? parsed : (parsed?.count || 0);
    } catch {
      const n = parseInt(localStorage.getItem(k), 10);
      if (Number.isFinite(n)) water[date] = n;
    }
  }
  return water;
}

function collectLegacyGymOverrides() {
  const gymOverrides = { ...(appStore.settings.gymOverrides || {}) };
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k?.startsWith('gymOverride-')) continue;
    gymOverrides[k.slice(12)] = localStorage.getItem(k);
  }
  return gymOverrides;
}

async function migrateLocalStorageToStore() {
  const settings = { ...defaultAppSettings(), ...appStore.settings };
  if (localStorage.getItem('startDate')) settings.startDate = localStorage.getItem('startDate');
  settings.hiddenBlocks = readLocalJson('hiddenBlocks', settings.hiddenBlocks);
  settings.notifSettings = readLocalJson('notifSettings', settings.notifSettings);
  if (localStorage.getItem('useKg') != null) settings.useKg = localStorage.getItem('useKg') !== 'false';
  if (localStorage.getItem('waterGoal')) settings.waterGoal = parseInt(localStorage.getItem('waterGoal'), 10) || 8;
  settings.gymConfig = readLocalJson('gymConfig', readLocalJson('gymPlan', null));
  settings.gymOverrides = collectLegacyGymOverrides();
  if (localStorage.getItem('liftChartExercise')) settings.liftChartExercise = localStorage.getItem('liftChartExercise');

  appStore.settings = settings;
  appStore.water = { ...collectLegacyWater(), ...appStore.water };

  await saveStoreKey('settings', appStore.settings);
  await saveStoreKey('water', appStore.water);
}

async function initAppStore() {
  try {
    const rows = await api('app_storage', 'GET', null, '?select=key,value') || [];
    rows.forEach(row => {
      if (row.key === 'settings') appStore.settings = { ...defaultAppSettings(), ...row.value };
      if (row.key === 'water') appStore.water = row.value || {};
      if (row.key === 'photos') appStore.photos = { start: null, weeks: {}, preview: { start: null, weeks: {} }, ...row.value };
    });
    if (!appStore.photos?.preview) appStore.photos.preview = { start: null, weeks: {} };
    migrateLegacyPhotosToPreview();
    if (!rows.length) {
      appStore.settings = defaultAppSettings();
      await migrateLocalStorageToStore();
    } else if (!Object.keys(appStore.settings || {}).length) {
      appStore.settings = defaultAppSettings();
    }
  } catch {
    appStore.settings = {
      ...defaultAppSettings(),
      startDate: localStorage.getItem('startDate') || DEFAULT_START,
      hiddenBlocks: readLocalJson('hiddenBlocks', []),
      notifSettings: readLocalJson('notifSettings', { ...NOTIF_DEFAULTS }),
      useKg: localStorage.getItem('useKg') !== 'false',
      waterGoal: parseInt(localStorage.getItem('waterGoal'), 10) || 8,
    };
    appStore.water = collectLegacyWater();
    migrateLegacyPhotosToPreview();
  }

  useKg = appStore.settings.useKg !== false;
  gymConfig = loadGymConfig();

  const cachedPhotos = readLocalJson('store-photos', null);
  if (cachedPhotos) {
    appStore.photos = {
      start: null,
      weeks: {},
      preview: { start: null, weeks: {} },
      ...appStore.photos,
      ...cachedPhotos,
      preview: {
        start: null,
        weeks: {},
        ...(appStore.photos?.preview || {}),
        ...(cachedPhotos.preview || {}),
      },
    };
  }
  migrateLegacyPhotosToPreview();
  appStoreReady = true;
}

function getHiddenBlocks() {
  return appStore.settings.hiddenBlocks || [];
}

function setHiddenBlocks(arr) {
  appStore.settings.hiddenBlocks = arr;
  saveStoreKey('settings', appStore.settings);
}

function getWaterGoal() {
  return parseInt(appStore.settings.waterGoal, 10) || 8;
}

function getWaterCount() {
  const date = today();
  return appStore.water[date] || 0;
}

function setWaterCount(n) {
  const date = today();
  appStore.water[date] = n;
  localStorage.setItem(`water-${date}`, JSON.stringify({ date, count: n, updatedAt: Date.now() }));
  saveStoreKey('water', appStore.water);
}

function resetWaterForNewDay(date) {
  delete appStore.water[date];
  localStorage.removeItem(`water-${date}`);
}

function isWaterCacheStale() {
  return false;
}

// ─── GYM PLAN ─────────────────────────────────────────────────────────────────
const DEFAULT_GYM_TEMPLATES = {
  a: { name: 'Day A — Lower Posture', exercises: [
    { name: 'Glute bridges', sets: 3, reps: 12 },
    { name: 'Banded clamshells', sets: 3, reps: 10 },
    { name: 'Cable hip abduction', sets: 3, reps: 12 },
    { name: 'Single leg RDL', sets: 3, reps: 10 },
    { name: 'Leg press', sets: 3, reps: 12 },
    { name: 'Seated leg curl', sets: 3, reps: 12 },
  ]},
  b: { name: 'Day B — Upper Push', exercises: [
    { name: 'Incline DB press', sets: 3, reps: 12 },
    { name: 'Cable fly', sets: 3, reps: 12 },
    { name: 'DB shoulder press', sets: 3, reps: 12 },
    { name: 'Lateral raises', sets: 3, reps: 15 },
    { name: 'Tricep pushdown', sets: 3, reps: 12 },
    { name: 'Wall angels', sets: 3, reps: 10 },
  ]},
  c: { name: 'Day C — Lower Strength', exercises: [
    { name: 'Goblet squat', sets: 3, reps: 12 },
    { name: 'Walking lunges', sets: 3, reps: 10 },
    { name: 'Hip thrust', sets: 3, reps: 12 },
    { name: 'Leg extension', sets: 3, reps: 15 },
    { name: 'Calf raise', sets: 3, reps: 15 },
    { name: 'Dead bug', sets: 3, reps: 10 },
  ]},
  d: { name: 'Day D — Upper Pull', exercises: [
    { name: 'Cable row', sets: 3, reps: 12 },
    { name: 'Lat pulldown', sets: 3, reps: 12 },
    { name: 'Single arm row', sets: 3, reps: 12 },
    { name: 'Face pulls', sets: 3, reps: 15 },
    { name: 'Bicep curl', sets: 3, reps: 12 },
    { name: 'Rear delt fly', sets: 3, reps: 12 },
  ]},
};

const DEFAULT_GYM_SCHEDULE = { 1: 'a', 2: 'b', 4: 'c', 5: 'd' }; // Mon, Tue, Thu, Fri

function normalizeGymTemplate(tpl, fallback) {
  if (Array.isArray(tpl)) {
    tpl = { name: fallback?.name || 'Workout', exercises: tpl };
  }
  if (!tpl || typeof tpl !== 'object') {
    return fallback ? JSON.parse(JSON.stringify(fallback)) : { name: 'Workout', exercises: [] };
  }
  const rawList = tpl.exercises ?? tpl.items ?? tpl.workouts;
  const exercises = (Array.isArray(rawList) ? rawList : [])
    .map(ex => ({
      name: (ex?.name || ex?.label || '').trim(),
      sets: Number(ex?.sets) > 0 ? Number(ex.sets) : 3,
      reps: ex?.reps != null && ex.reps !== '' ? Number(ex.reps) : 12,
      note: ex?.note || undefined,
    }))
    .filter(ex => ex.name);
  const out = {
    name: tpl.name || tpl.title || fallback?.name || 'Workout',
    exercises: exercises.length ? exercises : JSON.parse(JSON.stringify(fallback?.exercises || [])),
  };
  return out;
}

function normalizeGymConfig(raw) {
  const defaults = {
    templates: JSON.parse(JSON.stringify(DEFAULT_GYM_TEMPLATES)),
    schedule: { ...DEFAULT_GYM_SCHEDULE },
  };
  const src = raw?.templates && raw?.schedule ? raw : defaults;
  const templates = {};
  const ids = new Set([...Object.keys(defaults.templates), ...Object.keys(src.templates || {})]);
  ids.forEach(id => {
    templates[id] = normalizeGymTemplate(src.templates?.[id], defaults.templates[id]);
  });
  const schedule = { ...defaults.schedule, ...(src.schedule || {}) };
  Object.keys(schedule).forEach(dow => {
    if (!templates[schedule[dow]]) delete schedule[dow];
  });
  if (!Object.keys(schedule).length) Object.assign(schedule, defaults.schedule);
  return { templates, schedule };
}

function loadGymConfig() {
  if (appStore.settings?.gymConfig?.templates) {
    return normalizeGymConfig(appStore.settings.gymConfig);
  }
  try {
    const saved = readLocalJson('gymConfig', null);
    if (saved?.templates && saved?.schedule) return normalizeGymConfig(saved);
  } catch {}
  try {
    const old = readLocalJson('gymPlan', null);
    if (old?.['1']) {
      return normalizeGymConfig({
        templates: { a: old['1'], b: old['2'], c: old['4'], d: old['5'] },
        schedule: { 1: 'a', 2: 'b', 4: 'c', 5: 'd' },
      });
    }
  } catch {}
  return normalizeGymConfig(null);
}

function refreshGymConfig() {
  const next = loadGymConfig();
  const changed = JSON.stringify(next) !== JSON.stringify(gymConfig);
  gymConfig = next;
  if (changed) saveGymConfig();
  return gymConfig;
}

let gymConfig = normalizeGymConfig(null);

function saveGymConfig() {
  appStore.settings.gymConfig = gymConfig;
  localStorage.setItem('gymConfig', JSON.stringify(gymConfig));
  saveStoreKey('settings', appStore.settings);
}

function getGymOverride() {
  return appStore.settings.gymOverrides?.[today()] || null;
}

function setGymOverride(templateId) {
  if (!appStore.settings.gymOverrides) appStore.settings.gymOverrides = {};
  appStore.settings.gymOverrides[today()] = templateId;
  saveStoreKey('settings', appStore.settings);
}

function clearGymOverride() {
  if (appStore.settings.gymOverrides) {
    delete appStore.settings.gymOverrides[today()];
    saveStoreKey('settings', appStore.settings);
  }
}

function getScheduledTemplateId() {
  const dow = dayOfWeek();
  return gymConfig.schedule[dow] ?? gymConfig.schedule[String(dow)] ?? null;
}

function getTemplateById(id) {
  if (!id || !gymConfig.templates[id]) return null;
  return normalizeGymTemplate(gymConfig.templates[id], DEFAULT_GYM_TEMPLATES[id]);
}

function getScheduledGym() {
  const id = getScheduledTemplateId();
  return id ? getTemplateById(id) : null;
}

function todayGym() {
  const override = getGymOverride();
  if (override) return getTemplateById(override);
  return getScheduledGym();
}

function getTemplateShortName(name) {
  return name.split('—')[0].trim();
}

function getAllTemplates() {
  return Object.entries(gymConfig.templates).map(([id, plan]) => ({ id, ...plan }));
}

function getTemplateDay(templateId) {
  const entry = Object.entries(gymConfig.schedule).find(([, id]) => id === templateId);
  return entry ? +entry[0] : null;
}

function setTemplateDay(templateId, dow) {
  Object.keys(gymConfig.schedule).forEach(d => {
    if (gymConfig.schedule[d] === templateId) delete gymConfig.schedule[d];
  });
  if (dow !== '' && dow != null) {
    delete gymConfig.schedule[dow];
    gymConfig.schedule[dow] = templateId;
  }
  saveGymConfig();
}

const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// Warmup exercises — shown first; skips any already in today's main workout
const PHYSIO_EXERCISES = [
  { name: 'Hip CARs',                sets: 3, reps: 10, note: 'each side' },
  { name: '90/90 hip stretch',       sets: 2, reps: null, note: '2 min each' },
  { name: 'Standing hip abduction',  sets: 3, reps: 10  },
  { name: 'Cervical retraction',     sets: 3, reps: 10  },
  { name: 'Right QL stretch',        sets: 3, reps: null, note: '60 sec' },
  { name: 'Pelvic floor / kegels',   sets: 3, reps: 10  },
];

function getOrderedWorkout(gymDay) {
  const list = Array.isArray(gymDay?.exercises) ? gymDay.exercises : [];
  const mainNames = new Set(list.map(e => e.name.toLowerCase()));
  const flow = [];
  let step = 1;

  PHYSIO_EXERCISES.forEach(ex => {
    if (!mainNames.has(ex.name.toLowerCase())) {
      flow.push({ ...ex, phase: 'warmup', step: step++ });
    }
  });

  list.forEach(ex => {
    flow.push({ ...ex, phase: 'lift', step: step++ });
  });

  return flow;
}

function formatExerciseSets(ex) {
  if (ex.note && !ex.reps) return `${ex.sets} sets · ${ex.note}`;
  return `${ex.sets}×${ex.reps}${ex.note ? ' · ' + ex.note : ''}`;
}

const BLOCK_META = {
  morning: { icon: '🌅', label: 'Morning', time: '7am', freq: 'daily' },
  midday:  { icon: '☀️', label: 'Midday',  time: '12:30pm', freq: 'weekdays' },
  physio:  { icon: '💪', label: 'Physio',  time: 'any time', freq: '3–5×/week' },
  evening: { icon: '🌙', label: 'Evening', time: '7:30pm', freq: 'daily' },
  bedtime: { icon: '🛌', label: 'Bedtime', time: '10pm',   freq: 'daily' },
};

const BLOCK_ORDER = ['morning','midday','evening','bedtime']; // physio moved to gym screen

// ─── UTILS ─────────────────────────────────────────────────────────────────────
function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function today() {
  return localDateStr();
}

function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDaysLocal(dateStr, days) {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + days);
  return localDateStr(d);
}

// ─── DAILY LOG STORAGE (local cache + Supabase sync) ───────────────────────────
function localChecksKey(date) { return `habit-checks-${date}`; }
function localRatingsKey(date) { return `habit-ratings-${date}`; }
const LAST_OPEN_KEY = 'lastAppOpenDate';

function isNewCalendarDay() {
  const now = today();
  const last = localStorage.getItem(LAST_OPEN_KEY);
  if (last != null && last !== now) return true;
  if (last === now) return false;
  // First open (or cleared last-open): only reuse cache if it was written today
  if (Object.keys(loadLocalChecks(now)).length) return false;
  return true;
}

function markAppOpened() {
  localStorage.setItem(LAST_OPEN_KEY, today());
}

function loadLocalChecks(date) {
  try {
    const raw = JSON.parse(localStorage.getItem(localChecksKey(date)));
    if (raw?.date !== date || !raw.checks) return {};
    // Only trust cache written on this same calendar day
    if (raw.updatedAt && localDateStr(new Date(raw.updatedAt)) !== date) return {};
    return raw.checks;
  } catch {}
  return {};
}

function saveLocalChecks(date, checks) {
  localStorage.setItem(localChecksKey(date), JSON.stringify({
    date,
    checks: { ...checks },
    updatedAt: Date.now(),
  }));
}

function loadLocalRatings(date) {
  try {
    const raw = JSON.parse(localStorage.getItem(localRatingsKey(date)));
    if (raw?.date !== date || !raw.ratings) return null;
    if (raw.updatedAt && localDateStr(new Date(raw.updatedAt)) !== date) return null;
    return raw.ratings;
  } catch {}
  return null;
}

function saveLocalRatings(date, r) {
  localStorage.setItem(localRatingsKey(date), JSON.stringify({
    date,
    ratings: { ...r },
    updatedAt: Date.now(),
  }));
}

function buildTodayChecks(remoteChecks, localChecks, { freshDay = false } = {}) {
  const merged = {};
  habits.forEach(h => { merged[h.id] = false; });

  if (freshDay) {
    // New calendar day: start unchecked (remote + local are not applied)
    return merged;
  }

  habits.forEach(h => {
    if (remoteChecks[h.id] !== undefined) merged[h.id] = !!remoteChecks[h.id];
  });
  habits.forEach(h => {
    if (localChecks[h.id] !== undefined) merged[h.id] = !!localChecks[h.id];
  });
  return merged;
}

async function syncCheckToRemote(logDate, habitId, checked) {
  const existing = await api('daily_logs', 'GET', null,
    `?log_date=eq.${logDate}&habit_id=eq.${habitId}&limit=1`);
  if (existing?.length) {
    await api('daily_logs', 'PATCH', { checked },
      `?log_date=eq.${logDate}&habit_id=eq.${habitId}`);
  } else {
    await api('daily_logs', 'POST', { log_date: logDate, habit_id: habitId, checked });
  }
}

async function flushPendingCheckSync() {
  if (!pendingCheckSync.size || !activeLogDate) return;
  const ids = [...pendingCheckSync];
  pendingCheckSync.clear();
  for (const id of ids) {
    try {
      await syncCheckToRemote(activeLogDate, id, !!todayChecks[id]);
    } catch {
      pendingCheckSync.add(id);
    }
  }
}

async function syncAllChecksToRemote(logDate) {
  for (const h of habits) {
    const local = loadLocalChecks(logDate);
    if (local[h.id] === undefined) continue;
    try {
      await syncCheckToRemote(logDate, h.id, !!todayChecks[h.id]);
    } catch {
      pendingCheckSync.add(h.id);
    }
  }
}

function resetRatingsForNewDay() {
  ratings = { ...DEFAULT_RATINGS };
}

function applyRatings(data) {
  ratings = {
    skin: data.skin_score || 0,
    energy: data.energy_score || 0,
    hip: data.pain_hip || 0,
    knee: data.pain_knee || 0,
    back: data.pain_back || 0,
    weed: data.weed_used ?? null,
    notes: data.notes || '',
    sleep: data.sleep_time || '',
  };
}

function checkDayRollover() {
  const now = today();
  if (now !== activeLogDate) {
    gymState = {};
    resetWaterForNewDay(now);
    return loadTodayLogs({ freshDay: true }).then(() => {
      renderToday();
      updateHeaderDay();
      markAppOpened();
    });
  }
  return Promise.resolve();
}

function setupDayRollover() {
  activeLogDate = today();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkDayRollover();
  });
  setInterval(checkDayRollover, 60000);
}

function getStartDate() {
  return appStore.settings.startDate || localStorage.getItem('startDate') || DEFAULT_START;
}

function dayNumber() {
  const [y, m, d] = getStartDate().split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  return Math.floor((todayMidnight - start) / 86400000) + 1; // negative = future
}

function dayLabel() {
  const n = dayNumber();
  if (n < 1) return `Starts in ${1 - n} day${1 - n === 1 ? '' : 's'}`;
  return `Day ${n}/30`;
}

function dayOfWeek() { return new Date().getDay(); } // 0=Sun

function isGymDay() { return !!todayGym(); }

async function api(table, method = 'GET', body = null, params = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}${params}`;
  const res = await fetch(url, {
    method,
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=representation' : '',
    },
    body: body ? JSON.stringify(body) : null,
  });
  if (!res.ok && res.status !== 204) {
    const err = await res.text();
    throw new Error(err);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

function checkSVG() {
  return `<svg viewBox="0 0 14 14"><polyline points="2,7 6,11 12,3"/></svg>`;
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
const NOTIF_DEFAULTS = {
  morning:  { enabled: true,  time: '07:00', label: '🌅 Morning routine',   body: 'Time for your morning habits' },
  midday:   { enabled: true,  time: '12:30', label: '☀️ Midday check-in',   body: 'Lunch, Zinc & Creatine time' },
  physio:   { enabled: true,  time: '17:00', label: '💪 Physio session',    body: 'Don\'t skip your physio today' },
  evening:  { enabled: true,  time: '19:30', label: '🌙 Evening routine',   body: 'Skincare & evening habits' },
  bedtime:  { enabled: true,  time: '22:00', label: '🛌 Bedtime',           body: 'Wind down & rate your day' },
  logday:   { enabled: true,  time: '21:30', label: '📋 Log your day',      body: 'Don\'t forget to tap Log Day' },
};

let notifSchedules = {}; // key -> setTimeout id

function getNotifSettings() {
  return appStore.settings.notifSettings || { ...NOTIF_DEFAULTS };
}

function saveNotifSettings(s) {
  appStore.settings.notifSettings = s;
  localStorage.setItem('notifSettings', JSON.stringify(s));
  saveStoreKey('settings', appStore.settings);
}

async function requestNotifPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

function msUntil(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
  if (target <= now) target.setDate(target.getDate() + 1); // tomorrow if past
  return target - now;
}

async function scheduleNotifications() {
  if (Notification.permission !== 'granted') return;

  // Clear existing schedules
  Object.values(notifSchedules).forEach(id => clearTimeout(id));
  notifSchedules = {};

  const sw = await navigator.serviceWorker?.ready;
  const settings = getNotifSettings();

  Object.entries(settings).forEach(([key, cfg]) => {
    if (!cfg.enabled) return;
    const delay = msUntil(cfg.time);
    notifSchedules[key] = setTimeout(() => {
      if (sw) {
        sw.active.postMessage({ type: 'SHOW_NOTIFICATION', title: cfg.label, body: cfg.body, tag: key });
      } else {
        new Notification(cfg.label, { body: cfg.body });
      }
      // Reschedule for tomorrow
      notifSchedules[key] = setTimeout(() => scheduleNotifications(), 60000);
    }, delay);
  });
}

// ─── INIT ──────────────────────────────────────────────────────────────────────
async function init() {
  registerSW();
  await initAppStore();
  setupDayRollover();
  if (isWaterCacheStale()) resetWaterForNewDay(today());
  await loadHabits();
  await loadTodayLogs({ freshDay: isNewCalendarDay() });
  renderToday();
  setupNav();
  setupPhotoCapture();
  document.getElementById('log-btn').addEventListener('click', saveDay);
  flushPendingCheckSync();
  // Request notification permission after a short delay (not on first gesture)
  setTimeout(async () => {
    const granted = await requestNotifPermission();
    if (granted) scheduleNotifications();
  }, 3000);
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  }
}

// ─── DATA LOADING ──────────────────────────────────────────────────────────────
async function loadHabits() {
  try {
    habits = await api('habits', 'GET', null, '?order=item_order') || [];
  } catch (e) {
    habits = [];
  }
}

async function loadTodayLogs({ freshDay = false } = {}) {
  const logDate = today();
  const newDay = freshDay || isNewCalendarDay();
  activeLogDate = logDate;

  const remoteChecks = {};
  let remoteRatings = null;

  try {
    const logs = await api('daily_logs', 'GET', null,
      `?log_date=eq.${logDate}&select=habit_id,checked&_ts=${Date.now()}`) || [];
    logs.forEach(l => { remoteChecks[l.habit_id] = !!l.checked; });

    const r = await api('daily_ratings', 'GET', null,
      `?log_date=eq.${logDate}&limit=1&_ts=${Date.now()}`) || [];
    if (r[0]) remoteRatings = r[0];
  } catch {}

  const localChecks = loadLocalChecks(logDate);
  todayChecks = buildTodayChecks(remoteChecks, localChecks, { freshDay: newDay });

  if (newDay) {
    resetWaterForNewDay(logDate);
    localStorage.removeItem(localChecksKey(logDate));
    saveLocalChecks(logDate, todayChecks);
    resetRatingsForNewDay();
    saveLocalRatings(logDate, ratings);
    syncAllChecksToRemote(logDate).catch(() => {});
  } else if (Object.keys(localChecks).length) {
    saveLocalChecks(logDate, todayChecks);
  }

  const localRatings = loadLocalRatings(logDate);
  if (!newDay && remoteRatings) {
    applyRatings(remoteRatings);
    saveLocalRatings(logDate, ratings);
  } else if (!newDay && localRatings) {
    ratings = { ...DEFAULT_RATINGS, ...localRatings };
  } else if (!newDay) {
    resetRatingsForNewDay();
  }

  habits.forEach(h => {
    if (!newDay && localChecks[h.id] !== undefined && localChecks[h.id] !== remoteChecks[h.id]) {
      pendingCheckSync.add(h.id);
    }
  });

  markAppOpened();
}

// ─── UNIT HELPERS ─────────────────────────────────────────────────────────────
function toDisplay(kg) {
  if (!kg) return '';
  return useKg ? kg : +(kg * 2.20462).toFixed(1);
}
function toKg(val) {
  if (!val) return null;
  return useKg ? +val : +(val / 2.20462).toFixed(2);
}
function unitLabel() { return useKg ? 'kg' : 'lbs'; }

// ─── PROGRESSIVE OVERLOAD (per-set) ───────────────────────────────────────────
function normalizeSetsData(log) {
  if (!log) return [];
  if (Array.isArray(log.sets_data)) return log.sets_data;
  const date = log.log_date || today();
  const local = loadLocalSets(date, log.exercise);
  if (local?.length) return local;
  if (log.weight_kg) return [{ weight_kg: log.weight_kg, reps: log.reps }];
  return [];
}

function getLogMaxWeight(log) {
  const sets = normalizeSetsData(log);
  if (!sets.length) return null;
  const weights = sets.map(s => s.weight_kg).filter(Boolean);
  return weights.length ? Math.max(...weights) : null;
}

function localSetsKey(date, exercise) {
  return `gym-sets-${date}-${exercise}`;
}

function loadLocalSets(date, exercise) {
  try {
    const data = JSON.parse(localStorage.getItem(localSetsKey(date, exercise)));
    return Array.isArray(data) ? data : null;
  } catch { return null; }
}

function saveLocalSets(date, exercise, sets) {
  localStorage.setItem(localSetsKey(date, exercise), JSON.stringify(sets));
}

function getLastSessionSets(logs, exerciseName, todayDate = today()) {
  const prev = logs
    .filter(l => l.exercise === exerciseName && l.log_date < todayDate)
    .sort((a, b) => b.log_date.localeCompare(a.log_date));
  for (const log of prev) {
    const sets = normalizeSetsData(log);
    if (sets.length) return sets;
  }
  return null;
}

function getExerciseStats(logs, exerciseName, todayDate = today()) {
  const byDate = {};
  logs.filter(l => l.exercise === exerciseName).forEach(l => {
    const max = getLogMaxWeight(l);
    if (max) byDate[l.log_date] = max;
  });
  const history = Object.entries(byDate)
    .map(([date, weight]) => ({ date, weight }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const prevSessions = history.filter(h => h.date < todayDate);
  const last = prevSessions.length ? prevSessions[prevSessions.length - 1].weight : null;
  const prBeforeToday = prevSessions.length ? Math.max(...prevSessions.map(h => h.weight)) : null;
  return { history, last, prBeforeToday, sessionCount: prevSessions.length };
}

function getSetOverloadStatus(current, lastSet) {
  if (!current?.weight_kg) return null;
  if (!lastSet?.weight_kg) return { text: 'new', cls: 'overload-new' };
  if (current.weight_kg > lastSet.weight_kg) return { text: '↑ wt', cls: 'overload-up' };
  if (current.weight_kg === lastSet.weight_kg && (current.reps || 0) > (lastSet.reps || 0)) {
    return { text: '↑ reps', cls: 'overload-up' };
  }
  if (current.weight_kg < lastSet.weight_kg) return { text: '↓ wt', cls: 'overload-down' };
  return { text: 'same', cls: 'overload-same' };
}

function formatSetHint(lastSet) {
  if (!lastSet?.weight_kg) return '';
  const reps = lastSet.reps ? `×${lastSet.reps}` : '';
  return `was ${toDisplay(lastSet.weight_kg)}${unitLabel()}${reps}`;
}

function ensureExerciseSets(key, ex, savedSets, lastSets) {
  if (gymState[key]?.sets?.length) return gymState[key];
  const count = Math.max(ex.sets || 3, savedSets?.length || 0, lastSets?.length || 0) || 3;
  const sets = [];
  for (let i = 0; i < count; i++) {
    sets.push({
      weight_kg: savedSets?.[i]?.weight_kg ?? null,
      reps: savedSets?.[i]?.reps ?? ex.reps ?? null,
    });
  }
  gymState[key] = { sets };
  return gymState[key];
}

function formatSetsSummary(sets) {
  return sets
    .filter(s => s.weight_kg)
    .map(s => `${toDisplay(s.weight_kg)}${unitLabel()}${s.reps ? '×' + s.reps : ''}`)
    .join(', ');
}

function getTrackedExercises(logs) {
  const names = new Set();
  logs.forEach(l => {
    if (getLogMaxWeight(l) || normalizeSetsData(l).length) names.add(l.exercise);
  });
  return [...names].sort();
}

const saveSetTimers = {};
function scheduleSaveSets(dayType, ex, sets) {
  clearTimeout(saveSetTimers[ex.name]);
  saveSetTimers[ex.name] = setTimeout(() => saveExerciseSets(dayType, ex, sets), 400);
}

// ─── WATER WIDGET ─────────────────────────────────────────────────────────────
function renderWaterWidget() {
  const goal = getWaterGoal();
  const count = getWaterCount();
  const pct = Math.min(count / goal, 1);

  const card = document.createElement('div');
  card.className = 'card';
  card.id = 'water-card';
  card.style.cssText = 'margin:10px 14px;padding:14px 16px;';

  card.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;">
      <div style="position:relative;width:54px;height:54px;flex-shrink:0;">
        <svg viewBox="0 0 54 54" width="54" height="54">
          <circle cx="27" cy="27" r="23" fill="none" stroke="#e8f4fd" stroke-width="5"/>
          <circle cx="27" cy="27" r="23" fill="none" stroke="#2196f3" stroke-width="5"
            stroke-dasharray="${(2 * Math.PI * 23).toFixed(1)}"
            stroke-dashoffset="${((1 - pct) * 2 * Math.PI * 23).toFixed(1)}"
            stroke-linecap="round"
            transform="rotate(-90 27 27)"/>
        </svg>
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:600;color:#1565c0;">${count}</div>
      </div>
      <div style="flex:1;">
        <div style="font-family:Georgia,serif;font-size:14px;margin-bottom:4px;">💧 Water</div>
        <div style="font-size:12px;color:var(--muted);">${count} of ${goal} glasses${count >= goal ? ' · ✓ Goal reached!' : ''}</div>
        <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
          ${Array.from({length: goal}, (_, i) =>
            `<div style="width:18px;height:18px;border-radius:50%;background:${i < count ? '#2196f3' : '#e8f4fd'};border:1.5px solid ${i < count ? '#1976d2' : '#b3d9f5'};"></div>`
          ).join('')}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        <button id="water-add" style="width:36px;height:36px;border-radius:50%;border:none;background:#2196f3;color:#fff;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;-webkit-tap-highlight-color:transparent;">+</button>
        <button id="water-sub" style="width:36px;height:36px;border-radius:50%;border:1.5px solid var(--border);background:#fff;color:var(--muted);font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;-webkit-tap-highlight-color:transparent;">−</button>
      </div>
    </div>`;

  card.querySelector('#water-add').addEventListener('click', () => {
    setWaterCount(Math.min(getWaterCount() + 1, 20));
    const existing = document.getElementById('water-card');
    const newWidget = renderWaterWidget();
    existing.replaceWith(newWidget);
  });
  card.querySelector('#water-sub').addEventListener('click', () => {
    setWaterCount(Math.max(getWaterCount() - 1, 0));
    const existing = document.getElementById('water-card');
    const newWidget = renderWaterWidget();
    existing.replaceWith(newWidget);
  });
  return card;
}

// ─── TODAY SCREEN ──────────────────────────────────────────────────────────────
function renderToday() {
  const container = document.getElementById('today-blocks');
  container.innerHTML = '';

  // Buy list card (habit items marked buy + standalone shopping items not yet bought)
  const buyItems = habits.filter(h => h.status === 'buy');
  if (buyItems.length > 0) {
    const buyCard = document.createElement('div');
    buyCard.className = 'card buy-card';
    buyCard.style.cssText = 'margin:10px 14px;border-left:3px solid #f5a623;';
    buyCard.innerHTML = `
      <div style="padding:11px 14px 6px;display:flex;align-items:center;justify-content:space-between;">
        <span style="font-family:Georgia,serif;font-size:13px;color:#b87000;">🛒 Need to buy (${buyItems.length})</span>
        <button onclick="document.querySelector('[data-screen=settings]').click();setTimeout(()=>document.getElementById('shopping-settings').scrollIntoView({behavior:'smooth'}),300)" style="background:none;border:none;font-size:11px;color:var(--muted);cursor:pointer;font-family:inherit;">Manage →</button>
      </div>
      <div style="padding:0 14px 12px;display:flex;flex-wrap:wrap;gap:6px;">
        ${buyItems.map(h => `<span style="background:#fff3cd;color:#856404;border:1px solid #f5d87a;border-radius:20px;padding:4px 11px;font-size:13px;">${h.label}</span>`).join('')}
      </div>`;
    container.appendChild(buyCard);
  }

  // Water tracker widget
  container.appendChild(renderWaterWidget());

  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  const currentBlock = getCurrentBlock(hour);
  const hidden = getHiddenBlocks();

  BLOCK_ORDER.forEach(blockId => {
    if (hidden.includes(blockId)) return; // user hid this block
    const meta = BLOCK_META[blockId];
    const blockHabits = getBlockHabits(blockId);

    const checkedCount = blockHabits.filter(h => todayChecks[h.id]).length;
    const isOpen = blockId === currentBlock;

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="block-header" data-block="${blockId}">
        <div class="block-title">
          <span>${meta.icon}</span>
          <span>${meta.label}</span>
          <span style="font-size:12px;color:var(--muted);font-family:sans-serif">${meta.time}</span>
        </div>
        <div class="block-meta">
          ${checkedCount > 0 ? `<span class="block-count">${checkedCount}/${blockHabits.length}</span>` : ''}
          <svg class="block-chevron ${isOpen ? 'open' : ''}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="5,8 10,13 15,8"/></svg>
        </div>
      </div>
      <div class="block-items ${isOpen ? '' : 'collapsed'}" id="block-${blockId}">
        ${blockHabits.map(h => renderHabitItem(h)).join('')}
        ${blockId === 'bedtime' ? renderBedtimeExtras() : ''}
      </div>
    `;

    card.querySelector('.block-header').addEventListener('click', () => toggleBlock(blockId));
    container.appendChild(card);

    blockHabits.forEach(h => {
      const el = document.getElementById(`check-${h.id}`);
      if (el) el.addEventListener('click', () => toggleHabit(h.id));
    });
  });

  updateHeaderProgress();
  attachBedtimeListeners();
}

function getCurrentBlock(hour) {
  if (hour < 11) return 'morning';
  if (hour < 15) return 'midday';
  if (hour < 19.5) return 'physio';
  if (hour < 22) return 'evening';
  return 'bedtime';
}

function renderHabitItem(h) {
  const checked = !!todayChecks[h.id];
  const badge = h.status === 'buy' ? '<span class="status-badge badge-buy">BUY</span>'
    : h.status === 'rx' ? '<span class="status-badge badge-rx">RX</span>'
    : h.status === 'paused' ? '<span class="status-badge badge-paused">PAUSED</span>' : '';
  return `
    <div class="habit-item ${checked ? 'checked' : ''}">
      <div class="habit-check ${checked ? 'checked' : ''}" id="check-${h.id}">${checkSVG()}</div>
      <div class="habit-text">
        <div class="habit-label">${h.label}</div>
        ${h.sub ? `<div class="habit-sub">${h.sub}</div>` : ''}
      </div>
      ${badge}
    </div>`;
}

function renderBedtimeExtras() {
  const r = ratings;
  return `
    <div style="padding: 4px 0">
      ${ratingRowHTML('Skin', 'skin', r.skin, '✨')}
      ${ratingRowHTML('Energy', 'energy', r.energy, '⚡')}
      ${ratingRowHTML('Hip pain', 'hip', r.hip, '🦴')}
      ${ratingRowHTML('Knee pain', 'knee', r.knee, '🦴')}
      ${ratingRowHTML('Back pain', 'back', r.back, '🦴')}
      <div class="rating-row">
        <div class="rating-label">Sleep time</div>
        <input type="time" class="sleep-input" id="sleep-input" value="${r.sleep}">
      </div>
      <div class="rating-row">
        <div class="rating-label">Weed</div>
        <div class="toggle-btn">
          <button class="toggle-opt ${r.weed === true ? 'active' : ''}" id="weed-yes">Yes</button>
          <button class="toggle-opt ${r.weed === false ? 'active' : ''}" id="weed-no">No</button>
        </div>
      </div>
      <textarea class="notes-input" id="notes-input" placeholder="Notes…">${r.notes}</textarea>
    </div>`;
}

function ratingRowHTML(label, key, val, icon) {
  return `
    <div class="rating-row">
      <div class="rating-label">${label}</div>
      <div class="stars" id="stars-${key}">
        ${[1,2,3,4,5].map(i =>
          `<button class="star ${val >= i ? 'active' : ''}" data-key="${key}" data-val="${i}">${icon}</button>`
        ).join('')}
      </div>
    </div>`;
}

function persistRatings() {
  if (activeLogDate) saveLocalRatings(activeLogDate, ratings);
}

function attachBedtimeListeners() {
  document.querySelectorAll('.star').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      const val = parseInt(btn.dataset.val);
      ratings[key] = val;
      document.querySelectorAll(`.star[data-key="${key}"]`).forEach((s, i) => {
        s.classList.toggle('active', i < val);
      });
      persistRatings();
    });
  });

  const sleepInput = document.getElementById('sleep-input');
  if (sleepInput) sleepInput.addEventListener('change', e => {
    ratings.sleep = e.target.value;
    persistRatings();
  });

  const weedYes = document.getElementById('weed-yes');
  const weedNo = document.getElementById('weed-no');
  if (weedYes) weedYes.addEventListener('click', () => {
    ratings.weed = true;
    weedYes.classList.add('active'); weedNo.classList.remove('active');
    persistRatings();
  });
  if (weedNo) weedNo.addEventListener('click', () => {
    ratings.weed = false;
    weedNo.classList.add('active'); weedYes.classList.remove('active');
    persistRatings();
  });

  const notesInput = document.getElementById('notes-input');
  if (notesInput) notesInput.addEventListener('input', e => {
    ratings.notes = e.target.value;
    persistRatings();
  });
}

function toggleBlock(blockId) {
  const items = document.getElementById(`block-${blockId}`);
  const chevron = document.querySelector(`[data-block="${blockId}"] .block-chevron`);
  const isOpen = !items.classList.contains('collapsed');
  items.classList.toggle('collapsed', isOpen);
  chevron.classList.toggle('open', !isOpen);
}

function toggleHabit(id) {
  if (activeLogDate !== today()) checkDayRollover();
  const logDate = today();
  todayChecks[id] = !todayChecks[id];
  const check = document.getElementById(`check-${id}`);
  const item = check?.closest('.habit-item');
  check?.classList.toggle('checked', todayChecks[id]);
  item?.classList.toggle('checked', todayChecks[id]);
  updateHeaderProgress();
  updateBlockCount(habits.find(h => h.id === id)?.block);
  saveLocalChecks(logDate, todayChecks);
  autoSaveCheck(id, todayChecks[id]);
}

async function autoSaveCheck(id, checked) {
  const logDate = today();
  activeLogDate = logDate;
  saveLocalChecks(logDate, todayChecks);
  try {
    await syncCheckToRemote(logDate, id, checked);
    pendingCheckSync.delete(id);
  } catch {
    pendingCheckSync.add(id);
  }
}

function updateBlockCount(blockId) {
  if (!blockId) return;
  const blockHabits = getBlockHabits(blockId);
  const checked = blockHabits.filter(h => todayChecks[h.id]).length;
  const header = document.querySelector(`[data-block="${blockId}"] .block-meta`);
  if (!header) return;
  let badge = header.querySelector('.block-count');
  if (checked > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'block-count';
      header.insertBefore(badge, header.firstChild);
    }
    badge.textContent = `${checked}/${blockHabits.length}`;
  } else if (badge) {
    badge.remove();
  }
}

function updateHeaderProgress() {
  const total = habits.length;
  const checked = Object.values(todayChecks).filter(Boolean).length;
  const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
  document.querySelector('.progress-fill').style.width = pct + '%';
}

// ─── SAVE DAY ──────────────────────────────────────────────────────────────────
// Checks are auto-saved on tap. Log Day saves ratings + any missed checks.
async function saveDay() {
  const btn = document.getElementById('log-btn');
  btn.textContent = 'Saving…';

  try {
    const logDate = today();
    activeLogDate = logDate;
    saveLocalChecks(logDate, todayChecks);
    saveLocalRatings(logDate, ratings);

    for (const h of habits) {
      await syncCheckToRemote(logDate, h.id, !!todayChecks[h.id]);
    }
    pendingCheckSync.clear();

    const ratingPayload = {
      log_date: logDate,
      skin_score: ratings.skin || null,
      energy_score: ratings.energy || null,
      pain_hip: ratings.hip || null,
      pain_knee: ratings.knee || null,
      pain_back: ratings.back || null,
      weed_used: ratings.weed,
      notes: ratings.notes || null,
      sleep_time: ratings.sleep || null,
    };
    const existingRating = await api('daily_ratings', 'GET', null, `?log_date=eq.${logDate}&limit=1`);
    if (existingRating?.length) {
      await api('daily_ratings', 'PATCH', ratingPayload, `?log_date=eq.${logDate}`);
    } else {
      await api('daily_ratings', 'POST', ratingPayload);
    }

    btn.textContent = 'Day Logged ✓';
    btn.classList.add('saved');
    showToast('Day logged successfully');
    setTimeout(() => { btn.textContent = 'Log Day'; btn.classList.remove('saved'); }, 2500);
  } catch (e) {
    btn.textContent = 'Log Day';
    showToast('Error saving — check connection');
  }
}

// ─── GYM SCREEN ───────────────────────────────────────────────────────────────
async function renderGym() {
  const container = document.getElementById('gym-content');
  const historyContainer = document.getElementById('gym-history');
  if (!container) return;
  refreshGymConfig();
  historyContainer.innerHTML = '';
  container.innerHTML = '';
  const gymDay = todayGym();
  const activeId = getGymOverride() || getScheduledTemplateId();

  try {
    if (!gymDay) {
      const dow = DAY_NAMES[dayOfWeek()];
      container.innerHTML = `
        <div class="rest-day">
          <div class="rest-icon">🛋️</div>
          <p>Rest day — ${dow}</p>
          <small>Next gym day: ${getNextGymDay()}</small>
          <small style="display:block;margin-top:10px;color:var(--text);">Tap a workout below to load exercises</small>
        </div>`;
      container.appendChild(renderWorkoutPicker(null));
    } else {
      await renderWorkout(gymDay, container);
      container.appendChild(renderWorkoutPicker(activeId));
    }
  } catch (e) {
    console.error('renderGym failed', e);
    container.innerHTML = '<div class="empty">Could not load workout — refresh the page</div>';
  }

  await renderGymHistory();
}

function renderWorkoutPicker(activeId) {
  const wrap = document.createElement('div');
  wrap.className = 'workout-picker';

  const label = document.createElement('div');
  label.className = 'workout-picker-label';
  label.textContent = activeId ? 'Today\'s workout' : 'Doing a workout anyway?';
  wrap.appendChild(label);

  const btns = document.createElement('div');
  btns.className = 'workout-picker-btns';
  getAllTemplates().forEach(({ id, name }) => {
    const btn = document.createElement('button');
    btn.className = 'workout-pick-btn' + (id === activeId ? ' active' : '');
    btn.textContent = getTemplateShortName(name);
    btn.addEventListener('click', () => {
      if (getGymOverride()) {
        if (id === getGymOverride()) clearGymOverride();
        else setGymOverride(id);
      } else if (id !== getScheduledTemplateId()) {
        setGymOverride(id);
      }
      renderGym();
    });
    btns.appendChild(btn);
  });
  wrap.appendChild(btns);

  if (getGymOverride() && getScheduledGym()) {
    const hint = document.createElement('div');
    hint.className = 'workout-picker-hint';
    hint.textContent = `Scheduled: ${getTemplateShortName(getScheduledGym().name)} · tap again to reset`;
    wrap.appendChild(hint);
  }

  return wrap;
}

function getNextGymDay() {
  let d = dayOfWeek();
  for (let i = 1; i <= 7; i++) {
    d = (d + 1) % 7;
    if (gymConfig.schedule[d]) return DAY_NAMES[d];
  }
  return '—';
}

async function renderWorkout(gymDay, container) {
  // Load today's saved weights + full history for progressive overload
  let saved = [], allLogs = [];
  try {
    [saved, allLogs] = await Promise.all([
      api('gym_logs', 'GET', null,
        `?log_date=eq.${today()}&day_type=eq.${encodeURIComponent(gymDay.name)}&select=exercise,weight_kg,sets_data,reps`),
      api('gym_logs', 'GET', null,
        `?select=exercise,weight_kg,sets_data,reps,log_date&order=log_date.asc&limit=500`),
    ]);
  } catch (e) {
    // Still show exercises if Supabase is unreachable
  }
  saved = saved || [];
  allLogs = allLogs || [];
  const savedByExercise = {};
  saved.forEach(s => { savedByExercise[s.exercise] = normalizeSetsData(s); });

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px 4px;">
      <div class="workout-title" style="padding:0;">${gymDay.name}</div>
      <div style="display:flex;gap:0;border:1.5px solid var(--border);border-radius:8px;overflow:hidden;">
        <button id="unit-kg" onclick="setUnit(true)" style="padding:5px 12px;border:none;font-size:12px;cursor:pointer;font-family:inherit;background:${useKg ? 'var(--header)' : '#fff'};color:${useKg ? '#fff' : 'var(--muted)'};">kg</button>
        <button id="unit-lbs" onclick="setUnit(false)" style="padding:5px 12px;border:none;font-size:12px;cursor:pointer;font-family:inherit;background:${!useKg ? 'var(--header)' : '#fff'};color:${!useKg ? '#fff' : 'var(--muted)'};">lbs</button>
      </div>
    </div>`;
  const card = document.createElement('div');
  card.className = 'card';
  const flow = getOrderedWorkout(gymDay);
  let lastPhase = null;

  if (!flow.length) {
    card.innerHTML = '<div class="empty" style="padding:20px;">No exercises in this workout — open Settings → Gym Plan to restore defaults</div>';
    container.appendChild(card);
    return;
  }

  flow.forEach(ex => {
    if (ex.phase !== lastPhase) {
      lastPhase = ex.phase;
      const divider = document.createElement('div');
      divider.className = 'exercise-phase-label';
      divider.textContent = ex.phase === 'warmup' ? 'Warmup' : 'Main workout';
      card.appendChild(divider);
    }

    const key = ex.phase === 'warmup' ? `physio-${ex.name}` : ex.name;
    const item = document.createElement('div');
    item.className = 'exercise-item';

    if (ex.phase === 'warmup') {
      if (!gymState[key]) gymState[key] = { done: false };
      item.innerHTML = `
        <div class="exercise-step">${ex.step}</div>
        <div class="exercise-done ${gymState[key].done ? 'done' : ''}">${checkSVG()}</div>
        <div class="exercise-info">
          <div class="exercise-name">${ex.name}</div>
          <div class="exercise-sets">${formatExerciseSets(ex)}</div>
        </div>`;
      item.querySelector('.exercise-done').addEventListener('click', function() {
        gymState[key].done = !gymState[key].done;
        this.classList.toggle('done', gymState[key].done);
      });
    } else {
      const lastSets = getLastSessionSets(allLogs, key);
      const savedSets = savedByExercise[key] || loadLocalSets(today(), key);
      const state = ensureExerciseSets(key, ex, savedSets, lastSets);
      const stats = getExerciseStats(allLogs, key);

      const block = document.createElement('div');
      block.className = 'exercise-block';

      const header = document.createElement('div');
      header.className = 'exercise-block-header';
      const bestHint = stats.prBeforeToday != null
        ? `<span class="exercise-hint">best ${toDisplay(stats.prBeforeToday)}${unitLabel()}</span>` : '';
      header.innerHTML = `
        <div class="exercise-step">${ex.step}</div>
        <div class="exercise-info">
          <div class="exercise-name">${ex.name}</div>
          <div class="exercise-sets">target ${formatExerciseSets(ex)} ${bestHint}</div>
        </div>`;
      block.appendChild(header);

      const setList = document.createElement('div');
      setList.className = 'set-list';

      function renderSetRows() {
        setList.innerHTML = '';
        state.sets.forEach((set, si) => {
          const lastSet = lastSets?.[si];
          const status = getSetOverloadStatus(set, lastSet);
          const row = document.createElement('div');
          row.className = 'set-row';
          row.innerHTML = `
            <span class="set-num">${si + 1}</span>
            <input type="number" class="set-weight" placeholder="${unitLabel()}" value="${set.weight_kg ? toDisplay(set.weight_kg) : ''}" min="0" step="0.5">
            <span class="set-x">×</span>
            <input type="number" class="set-reps" placeholder="reps" value="${set.reps ?? ''}" min="0" step="1">
            <span class="set-hint">${formatSetHint(lastSet)}</span>
            <span class="overload-badge ${status?.cls || ''}">${status?.text || ''}</span>`;

          const wInput = row.querySelector('.set-weight');
          const rInput = row.querySelector('.set-reps');
          const badge = row.querySelector('.overload-badge');

          function syncSet() {
            set.weight_kg = toKg(wInput.value);
            set.reps = rInput.value ? +rInput.value : null;
            const st = getSetOverloadStatus(set, lastSet);
            badge.textContent = st?.text || '';
            badge.className = `overload-badge ${st?.cls || ''}`;
            saveLocalSets(today(), key, state.sets);
            scheduleSaveSets(gymDay.name, ex, state.sets);
          }

          wInput.addEventListener('input', syncSet);
          rInput.addEventListener('input', syncSet);
          setList.appendChild(row);
        });
      }

      renderSetRows();

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'add-set-btn';
      addBtn.textContent = '+ add set';
      addBtn.addEventListener('click', () => {
        const prev = state.sets[state.sets.length - 1];
        state.sets.push({
          weight_kg: prev?.weight_kg ?? null,
          reps: prev?.reps ?? ex.reps ?? null,
        });
        renderSetRows();
      });

      block.appendChild(setList);
      block.appendChild(addBtn);
      item.appendChild(block);
      item.className = 'exercise-block-wrap';
    }

    card.appendChild(item);
  });

  container.appendChild(card);
}

async function saveExerciseSets(dayType, ex, sets) {
  const logDate = today();
  const setsData = sets.map(s => ({
    weight_kg: s.weight_kg || null,
    reps: s.reps || null,
  }));
  saveLocalSets(logDate, ex.name, setsData);
  const filled = setsData.filter(s => s.weight_kg || s.reps);
  const topWeight = filled.length
    ? Math.max(...filled.map(s => s.weight_kg || 0).filter(Boolean)) || null
    : null;
  const payload = {
    log_date: logDate,
    day_type: dayType,
    exercise: ex.name,
    sets: sets.length,
    reps: filled[filled.length - 1]?.reps || ex.reps,
    weight_kg: topWeight,
    sets_data: setsData,
  };

  const existing = await api('gym_logs', 'GET', null,
    `?log_date=eq.${logDate}&exercise=eq.${encodeURIComponent(ex.name)}&limit=1`);
  if (existing?.length) {
    await api('gym_logs', 'PATCH', payload,
      `?log_date=eq.${logDate}&exercise=eq.${encodeURIComponent(ex.name)}`);
  } else if (filled.length) {
    await api('gym_logs', 'POST', payload);
  }
}

function setUnit(kg) {
  useKg = kg;
  appStore.settings.useKg = kg;
  localStorage.setItem('useKg', kg);
  saveStoreKey('settings', appStore.settings);
  renderGym();
}

async function renderGymHistory() {
  const container = document.getElementById('gym-history');
  const logs = await api('gym_logs', 'GET', null,
    '?order=log_date.desc&limit=80&select=exercise,weight_kg,sets_data,reps,log_date,day_type') || [];

  if (logs.length === 0) {
    container.innerHTML = '<div class="empty">No workout history yet</div>';
    return;
  }

  // Build previous weight lookup per exercise (for delta on each session)
  const prevByExercise = {};
  const sortedAsc = [...logs].sort((a, b) => a.log_date.localeCompare(b.log_date));
  sortedAsc.forEach(l => {
    const max = getLogMaxWeight(l);
    if (!max) return;
    l._prev = prevByExercise[l.exercise];
    prevByExercise[l.exercise] = max;
  });

  // Group by date+day_type
  const grouped = {};
  logs.forEach(l => {
    const key = `${l.log_date}|${l.day_type}`;
    if (!grouped[key]) grouped[key] = { date: l.log_date, type: l.day_type, exercises: [] };
    grouped[key].exercises.push(l);
  });

  const card = document.createElement('div');
  card.className = 'card';
  Object.values(grouped).forEach(g => {
    const item = document.createElement('div');
    item.className = 'history-item';
    const exList = g.exercises
      .map(e => {
        const sets = normalizeSetsData(e);
        const summary = formatSetsSummary(sets);
        if (!summary) return null;
        const max = getLogMaxWeight(e);
        if (e._prev != null && max) {
          const diff = max - e._prev;
          if (diff > 0) return `${e.exercise}: ${summary} <span class="overload-up-inline">↑</span>`;
          if (diff < 0) return `${e.exercise}: ${summary} <span class="overload-down-inline">↓</span>`;
        }
        return `${e.exercise}: ${summary}`;
      })
      .filter(Boolean)
      .join(' · ');
    item.innerHTML = `
      <div class="history-date">${g.date} — ${g.type}</div>
      <div class="history-detail">${exList || 'No weights logged'}</div>`;
    card.appendChild(item);
  });
  container.appendChild(card);
}

// ─── PROGRESS SCREEN ──────────────────────────────────────────────────────────
function getProgramDaysElapsed() {
  const n = dayNumber();
  return n < 1 ? 0 : Math.min(n, 30);
}

function getLoggedDateSet(ratings) {
  return new Set((ratings || []).map(r => r.log_date));
}

function calcLogStreak(ratings) {
  const logged = getLoggedDateSet(ratings);
  if (!logged.size) return 0;
  let d = today();
  if (!logged.has(d)) d = addDaysLocal(d, -1);
  let streak = 0;
  for (let i = 0; i < 30; i++) {
    if (logged.has(d)) {
      streak++;
      d = addDaysLocal(d, -1);
    } else break;
  }
  return streak;
}

function buildHabitCompletionByDate(logs) {
  const byDate = {};
  (logs || []).forEach(l => {
    if (!byDate[l.log_date]) byDate[l.log_date] = { done: 0, total: 0 };
    byDate[l.log_date].total++;
    if (l.checked) byDate[l.log_date].done++;
  });
  return Object.entries(byDate)
    .map(([date, v]) => ({ date, pct: v.total ? Math.round((v.done / v.total) * 100) : 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function getStartPhotoDisplayUrl() {
  return appStore.photos?.preview?.start || photoPublicUrl(appStore.photos?.start);
}

function findLatestPhotoDisplayUrl() {
  const previewWeeks = appStore.photos?.preview?.weeks || {};
  const previewKeys = Object.keys(previewWeeks).sort();
  if (previewKeys.length) {
    return previewWeeks[previewKeys[previewKeys.length - 1]];
  }
  const weeks = appStore.photos?.weeks || {};
  const keys = Object.keys(weeks).sort();
  return keys.length ? photoPublicUrl(weeks[keys[keys.length - 1]]) : null;
}

function photoPublicUrl(path) {
  if (!path) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/${PHOTO_BUCKET}/${path}`;
}

async function uploadPhotoFile(path, blob) {
  const { error } = await db.storage.from(PHOTO_BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
}

function migrateLegacyPhotosToPreview() {
  const photos = { start: null, weeks: {}, preview: { start: null, weeks: {} }, ...appStore.photos };
  if (!photos.preview) photos.preview = { start: null, weeks: {} };

  const legacyStart = localStorage.getItem('photo-start');
  if (legacyStart && !photos.preview.start) photos.preview.start = legacyStart;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith('photo-week-') && !/^photo-\d{4}-\d{2}-\d{2}$/.test(key || '')) continue;
    const wk = key.startsWith('photo-week-') ? key.slice(11) : key.slice(6);
    const data = localStorage.getItem(key);
    if (data && !photos.preview.weeks[wk]) photos.preview.weeks[wk] = data;
  }

  appStore.photos = photos;
}

function dataUrlToBlob(dataUrl) {
  return fetch(dataUrl).then(r => r.blob());
}

// ─── PROGRESS PHOTOS (PWA camera + Supabase Storage) ────────────────────────
let cameraStream = null;
let photoCaptureTarget = null;

function compressImage(dataUrl, maxWidth = 960, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function saveProgressPhoto(target, dataUrl) {
  let compressed;
  try {
    compressed = await compressImage(dataUrl);
  } catch {
    compressed = dataUrl;
  }

  const photos = {
    start: appStore.photos?.start || null,
    weeks: { ...(appStore.photos?.weeks || {}) },
    preview: {
      start: appStore.photos?.preview?.start || null,
      weeks: { ...(appStore.photos?.preview?.weeks || {}) },
    },
  };

  if (target === 'start') {
    photos.preview.start = compressed;
  } else {
    const wk = getWeekStart(new Date());
    photos.preview.weeks[wk] = compressed;
    if (!photos.preview.start) photos.preview.start = compressed;
  }

  appStore.photos = photos;
  renderProgressPhotos();
  closeCameraOverlay();

  try {
    await saveStoreKey('photos', photos);
    showToast('Photo saved');
  } catch {
    showToast('Photo saved on this device');
  }

  try {
    const blob = await dataUrlToBlob(compressed);
    if (target === 'start') {
      await uploadPhotoFile('start.jpg', blob);
      photos.start = 'start.jpg';
    } else {
      const wk = getWeekStart(new Date());
      const path = `week-${wk}.jpg`;
      await uploadPhotoFile(path, blob);
      photos.weeks[wk] = path;
      if (!photos.start) {
        await uploadPhotoFile('start.jpg', blob);
        photos.start = 'start.jpg';
      }
    }
    appStore.photos = photos;
    await saveStoreKey('photos', photos);
  } catch {
    // Cloud sync optional — local preview already shown
  }
}

function renderPhotoSlot(slotEl, dataUrl, label, emptyHint) {
  if (!slotEl) return;
  slotEl.classList.toggle('has-photo', !!dataUrl);
  if (dataUrl) {
    slotEl.innerHTML = `
      <img src="${dataUrl}" alt="${label}">
      <span class="photo-slot-label">${label}</span>
      <span class="photo-slot-hint">Tap to retake</span>`;
  } else {
    slotEl.innerHTML = `
      <span class="photo-slot-icon">${label === 'Day 1' ? '📸' : '📷'}</span>
      <span class="photo-slot-label">${label}</span>
      <span class="photo-slot-hint">${emptyHint}</span>`;
  }
}

function renderProgressPhotos() {
  renderPhotoSlot(
    document.getElementById('photo-start'),
    getStartPhotoDisplayUrl(),
    'Day 1',
    'Tap to take photo'
  );
  renderPhotoSlot(
    document.getElementById('photo-latest'),
    findLatestPhotoDisplayUrl(),
    'Latest',
    'Tap to take photo'
  );
}

function closeCameraOverlay() {
  const overlay = document.getElementById('camera-overlay');
  overlay?.classList.remove('open');
  overlay?.setAttribute('aria-hidden', 'true');
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  const video = document.getElementById('camera-preview');
  if (video) video.srcObject = null;
}

async function openPhotoCapture(target) {
  photoCaptureTarget = target;
  const title = document.getElementById('camera-title');
  if (title) title.textContent = target === 'start' ? 'Day 1 photo' : 'Latest progress photo';

  if (navigator.mediaDevices?.getUserMedia) {
    try {
      closeCameraOverlay();
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      const video = document.getElementById('camera-preview');
      video.srcObject = cameraStream;
      await video.play();
      const overlay = document.getElementById('camera-overlay');
      overlay?.classList.add('open');
      overlay?.setAttribute('aria-hidden', 'false');
      return;
    } catch {
      // Fall back to native camera capture on devices that block inline preview
    }
  }

  triggerCameraFallback();
}

function triggerCameraFallback() {
  const input = document.getElementById('photo-camera-fallback');
  if (!input) {
    showToast('Camera not available on this device');
    return;
  }
  input.value = '';
  input.click();
}

function captureFromCameraPreview() {
  const video = document.getElementById('camera-preview');
  const canvas = document.getElementById('camera-canvas');
  if (!video?.videoWidth || !canvas) {
    showToast('Camera not ready — try again');
    return;
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
  saveProgressPhoto(photoCaptureTarget, dataUrl);
}

function setupPhotoCapture() {
  const row = document.querySelector('.photo-row');
  row?.addEventListener('click', e => {
    const slot = e.target.closest('#photo-start, #photo-latest');
    if (!slot) return;
    openPhotoCapture(slot.id === 'photo-start' ? 'start' : 'latest');
  });

  document.getElementById('camera-close')?.addEventListener('click', closeCameraOverlay);
  document.getElementById('camera-capture')?.addEventListener('click', captureFromCameraPreview);

  document.getElementById('photo-camera-fallback')?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file || !photoCaptureTarget) return;
    const reader = new FileReader();
    reader.onload = ev => saveProgressPhoto(photoCaptureTarget, ev.target.result);
    reader.readAsDataURL(file);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') closeCameraOverlay();
  });
}

async function renderProgress() {
  setProgressLoading(true);
  try {
    if (!habits.length) await loadHabits();
    await loadProgressData();
    renderStats();
    renderProgressInsights();
    renderCharts();
    renderProgressPhotos();
    renderWelcomeBack();
  } finally {
    setProgressLoading(false);
  }
}

function setProgressLoading(loading) {
  ['stat-streak', 'stat-compliance', 'stat-habits', 'stat-gym'].forEach(id => {
    const el = document.getElementById(id);
    if (el && loading) el.textContent = '…';
  });
}

async function loadProgressData() {
  const cutoff = addDaysLocal(today(), -45);
  try {
    const [ratingsRaw, weeklyLogs, gymLogs30, habitLogs] = await Promise.all([
      api('daily_ratings', 'GET', null, '?order=log_date.desc&limit=45'),
      api('weekly_logs', 'GET', null, '?order=week_start.asc&limit=12'),
      api('gym_logs', 'GET', null, '?select=exercise,weight_kg,sets_data,reps,log_date&order=log_date.asc&limit=500'),
      api('daily_logs', 'GET', null, `?log_date=gte.${cutoff}&select=log_date,habit_id,checked`),
    ]);
    const ratings30 = (ratingsRaw || []).slice().sort((a, b) => a.log_date.localeCompare(b.log_date));
    progressData = {
      ratings30,
      weeklyLogs: weeklyLogs || [],
      gymLogs30: gymLogs30 || [],
      habitLogs: habitLogs || [],
      habitByDate: buildHabitCompletionByDate(habitLogs),
    };
  } catch (e) {
    progressData = { ratings30: [], weeklyLogs: [], gymLogs30: [], habitLogs: [], habitByDate: [] };
  }
}

function renderStats() {
  const d = progressData;
  const elapsed = getProgramDaysElapsed();
  const loggedDates = getLoggedDateSet(d.ratings30);
  const daysLogged = [...loggedDates].filter(ds => {
    const start = getStartDate();
    return ds >= start && ds <= today();
  }).length;
  const compliance = elapsed > 0 ? Math.round((daysLogged / elapsed) * 100) : 0;

  const weekCutoff = addDaysLocal(today(), -6);
  const habitWeek = d.habitByDate.filter(h => h.date >= weekCutoff);
  const avgHabits = habitWeek.length
    ? Math.round(habitWeek.reduce((s, h) => s + h.pct, 0) / habitWeek.length)
    : null;

  const gymCutoff = addDaysLocal(today(), -29);
  const gymSessions = new Set(
    d.gymLogs30.filter(g => g.log_date >= gymCutoff).map(g => g.log_date)
  ).size;

  document.getElementById('stat-streak').textContent = calcLogStreak(d.ratings30);
  document.getElementById('stat-compliance').textContent = elapsed
    ? `${daysLogged}/${elapsed}`
    : '—';
  document.getElementById('stat-compliance').title = elapsed
    ? `${compliance}% of program days logged (Log Day)`
    : '';
  document.getElementById('stat-habits').textContent = avgHabits != null ? avgHabits + '%' : '—';
  document.getElementById('stat-gym').textContent = gymSessions;
}

function renderProgressInsights() {
  const el = document.getElementById('progress-insights');
  if (!el) return;
  const d = progressData;
  const elapsed = getProgramDaysElapsed();
  const ratingsByDate = Object.fromEntries(d.ratings30.map(r => [r.log_date, r]));
  const habitByDate = Object.fromEntries(d.habitByDate.map(h => [h.date, h.pct]));
  const gymDates = new Set(d.gymLogs30.map(g => g.log_date));

  const skinScores = d.ratings30.filter(r => r.skin_score).map(r => r.skin_score);
  const energyScores = d.ratings30.filter(r => r.energy_score).map(r => r.energy_score);
  const avgSkin = skinScores.length
    ? (skinScores.reduce((a, b) => a + b, 0) / skinScores.length).toFixed(1)
    : null;
  const avgEnergy = energyScores.length
    ? (energyScores.reduce((a, b) => a + b, 0) / energyScores.length).toFixed(1)
    : null;

  const summaryParts = [];
  if (elapsed > 0) summaryParts.push(`Day ${Math.min(dayNumber(), 30)} of 30`);
  if (avgSkin) summaryParts.push(`Avg skin ${avgSkin}/5`);
  if (avgEnergy) summaryParts.push(`Avg energy ${avgEnergy}/5`);

  let rows = '';
  for (let i = 6; i >= 0; i--) {
    const ds = addDaysLocal(today(), -i);
    const label = i === 0 ? 'Today' : ds.slice(5);
    const pct = habitByDate[ds];
    const rating = ratingsByDate[ds];
    const barW = pct != null ? pct : 0;
    const skin = rating?.skin_score ? `${rating.skin_score}` : '—';
    const gym = gymDates.has(ds) ? '🏋️' : '';
    rows += `
      <div class="progress-insight-row">
        <span>${label}</span>
        <div class="bar-wrap"><div class="bar-fill" style="width:${barW}%"></div></div>
        <span class="skin-pill">${skin}</span>
        <span class="gym-dot">${gym}</span>
      </div>`;
  }

  el.innerHTML = `
    <div class="insight-head">${summaryParts.join(' · ') || 'Your 30-day journey'}</div>
    <div style="display:grid;grid-template-columns:52px 1fr 36px 28px;gap:6px;font-size:10px;color:#aaa;margin-bottom:4px;">
      <span>Date</span><span>Habits</span><span style="text-align:right">Skin</span><span style="text-align:center">Gym</span>
    </div>
    ${rows || '<div style="color:#bbb;padding:8px 0;">Log habits and tap Log Day to fill this in.</div>'}`;
}

function renderCharts() {
  const d = progressData;
  const weightTitle = document.getElementById('chart-weight-title');
  if (weightTitle) weightTitle.textContent = `Body weight (${unitLabel()})`;

  drawLineChart('chart-weight',
    d.weeklyLogs.filter(w => w.weight_kg).map(w => ({ x: w.week_start.slice(5), y: toDisplay(w.weight_kg) })),
    unitLabel(), '#4caf50');

  drawDualLineChart('chart-skin', [
    {
      data: d.ratings30.filter(r => r.skin_score).map(r => ({ x: r.log_date.slice(5), y: r.skin_score })),
      color: '#c8a0f5',
      label: 'Skin',
    },
    {
      data: d.ratings30.filter(r => r.energy_score).map(r => ({ x: r.log_date.slice(5), y: r.energy_score })),
      color: '#a0d4f5',
      label: 'Energy',
    },
  ], 1, 5);

  const habitCard = document.getElementById('habit-chart-card');
  const habitCutoff = addDaysLocal(today(), -13);
  const habitPts = d.habitByDate
    .filter(h => h.date >= habitCutoff)
    .map(h => ({ x: h.date.slice(5), y: h.pct }));
  if (habitCard) {
    habitCard.style.display = habitPts.length ? 'block' : 'none';
    if (habitPts.length) drawLineChart('chart-habits', habitPts, '%', '#7cb342', 0, 100);
  }

  drawMultiLineChart('chart-pain', d.ratings30, [
    { key: 'pain_hip', color: '#f5a0a0', label: 'Hip' },
    { key: 'pain_knee', color: '#f5c8a0', label: 'Knee' },
    { key: 'pain_back', color: '#a0c8f5', label: 'Back' },
  ]);

  const gymByWeek = {};
  d.gymLogs30.forEach(g => {
    const wk = getWeekStart(g.log_date);
    gymByWeek[wk] = (gymByWeek[wk] || new Set()).add(g.log_date);
  });
  drawLineChart('chart-gym',
    Object.entries(gymByWeek).sort().map(([k, v]) => ({ x: k.slice(5), y: v.size })),
    '', '#4caf50', 0, 7);

  renderLiftProgressChart();
}

function renderLiftProgressChart() {
  const select = document.getElementById('lift-select');
  const summary = document.getElementById('lift-summary');
  const card = document.getElementById('lift-progress-card');
  if (!select || !summary) return;

  const exercises = getTrackedExercises(progressData.gymLogs30);
  if (exercises.length === 0) {
    card.style.display = 'none';
    return;
  }
  card.style.display = 'block';

  const saved = appStore.settings.liftChartExercise;
  const current = saved && exercises.includes(saved) ? saved : exercises[0];

  select.innerHTML = exercises.map(ex =>
    `<option value="${ex}" ${ex === current ? 'selected' : ''}>${ex}</option>`
  ).join('');

  function draw(exerciseName) {
    const stats = getExerciseStats(progressData.gymLogs30, exerciseName, '9999-12-31');
    const pts = stats.history.map(h => ({ x: h.date.slice(5), y: toDisplay(h.weight) }));
    drawLineChart('chart-lift', pts, unitLabel(), '#1a1a1a');

    if (stats.history.length === 0) {
      summary.textContent = 'No data yet';
      return;
    }
    const latest = stats.history[stats.history.length - 1];
    const parts = [`Current: ${toDisplay(latest.weight)}${unitLabel()}`];
    if (stats.prBeforeToday != null) parts.push(`Best: ${toDisplay(stats.prBeforeToday)}${unitLabel()}`);
    if (stats.history.length >= 2) {
      const first = stats.history[0];
      const gain = +(toDisplay(latest.weight) - toDisplay(first.weight)).toFixed(1);
      if (gain > 0) parts.push(`+${gain}${unitLabel()} since start`);
      else if (gain < 0) parts.push(`${gain}${unitLabel()} since start`);
    }
    summary.textContent = parts.join(' · ');
  }

  draw(current);
  select.onchange = () => {
    appStore.settings.liftChartExercise = select.value;
    localStorage.setItem('liftChartExercise', select.value);
    saveStoreKey('settings', appStore.settings);
    draw(select.value);
  };
}

function getWeekStart(date) {
  const d = date instanceof Date ? new Date(date) : parseLocalDate(typeof date === 'string' ? date : localDateStr(date));
  d.setDate(d.getDate() - d.getDay());
  return localDateStr(d);
}

function prepareChartCanvas(canvas) {
  const cssW = canvas.parentElement?.clientWidth || 320;
  const cssH = parseInt(canvas.getAttribute('height'), 10) || 140;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  canvas.style.width = '100%';
  canvas.style.height = cssH + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: cssW, height: cssH };
}

function drawChartEmpty(ctx, W, H, message) {
  ctx.fillStyle = '#ccc';
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(message, W / 2, H / 2);
}

function drawLineChart(id, data, unit, color, yMin, yMax) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  const { ctx, width: W, height: H } = prepareChartCanvas(canvas);
  ctx.clearRect(0, 0, W, H);

  if (!data.length) {
    drawChartEmpty(ctx, W, H, 'No data yet — log in Settings or Log Day');
    return;
  }

  const vals = data.map(d => d.y);
  let min = yMin !== undefined ? yMin : Math.min(...vals) * 0.95;
  let max = yMax !== undefined ? yMax : Math.max(...vals) * 1.05;
  if (max <= min) max = min + 1;

  const pad = { top: 12, right: 12, bottom: 28, left: 38 };
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;
  const range = max - min;

  const xScale = i => pad.left + (data.length === 1 ? cW / 2 : (i / (data.length - 1)) * cW);
  const yScale = v => pad.top + cH - ((v - min) / range) * cH;

  // Grid lines
  ctx.strokeStyle = '#f0ede9';
  ctx.lineWidth = 1;
  [0.25, 0.5, 0.75, 1].forEach(t => {
    const y = pad.top + cH * (1 - t);
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cW, y); ctx.stroke();
  });

  // Line
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  data.forEach((d, i) => {
    if (i === 0) ctx.moveTo(xScale(i), yScale(d.y));
    else ctx.lineTo(xScale(i), yScale(d.y));
  });
  ctx.stroke();

  // Dots
  ctx.fillStyle = color;
  data.forEach((d, i) => {
    ctx.beginPath();
    ctx.arc(xScale(i), yScale(d.y), 3, 0, Math.PI * 2);
    ctx.fill();
  });

  // X labels (first, last, middle)
  ctx.fillStyle = '#aaa';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  [0, Math.floor(data.length / 2), data.length - 1].forEach(i => {
    if (data[i]) ctx.fillText(data[i].x, xScale(i), H - 8);
  });

  // Y labels
  ctx.textAlign = 'right';
  [min, (min+max)/2, max].forEach(v => {
    const y = yScale(v);
    ctx.fillText(v.toFixed(1).replace(/\.0$/, '') + unit, pad.left - 4, y + 4);
  });
}

function drawDualLineChart(id, lines, yMin, yMax) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  const { ctx, width: W, height: H } = prepareChartCanvas(canvas);
  ctx.clearRect(0, 0, W, H);

  const allPts = lines.flatMap(l => l.data);
  if (!allPts.length) {
    drawChartEmpty(ctx, W, H, 'Rate skin & energy when you Log Day');
    return;
  }

  const pad = { top: 12, right: 12, bottom: 32, left: 28 };
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;
  const min = yMin ?? 1;
  const max = yMax ?? 5;
  const range = max - min;
  const yScale = v => pad.top + cH - ((v - min) / range) * cH;

  lines.forEach(line => {
    const data = line.data;
    if (!data.length) return;
    const xScale = i => pad.left + (data.length === 1 ? cW / 2 : (i / (data.length - 1)) * cW);
    ctx.strokeStyle = line.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    data.forEach((d, i) => {
      if (i === 0) ctx.moveTo(xScale(i), yScale(d.y));
      else ctx.lineTo(xScale(i), yScale(d.y));
    });
    ctx.stroke();
    ctx.fillStyle = line.color;
    data.forEach((d, i) => {
      ctx.beginPath();
      ctx.arc(xScale(i), yScale(d.y), 3, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  ctx.font = '10px sans-serif';
  lines.forEach((line, i) => {
    if (!line.data.length) return;
    ctx.fillStyle = line.color;
    ctx.fillRect(pad.left + i * 58, H - 14, 8, 8);
    ctx.fillStyle = '#888';
    ctx.fillText(line.label, pad.left + i * 58 + 11, H - 7);
  });
}

function drawMultiLineChart(id, rows, series) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  const { ctx, width: W, height: H } = prepareChartCanvas(canvas);
  ctx.clearRect(0, 0, W, H);

  const dated = rows.filter(r => series.some(s => r[s.key]));
  if (!dated.length) {
    drawChartEmpty(ctx, W, H, 'Pain scores appear after Log Day');
    return;
  }

  const pad = { top: 12, right: 12, bottom: 32, left: 28 };
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;
  const n = dated.length;
  const xScale = i => pad.left + (n === 1 ? cW / 2 : (i / (n - 1)) * cW);
  const yScale = v => pad.top + cH - ((v - 1) / 4) * cH;

  series.forEach(s => {
    const pts = dated.map((r, i) => ({ i, v: r[s.key] })).filter(p => p.v);
    if (!pts.length) return;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach((p, j) => {
      if (j === 0) ctx.moveTo(xScale(p.i), yScale(p.v));
      else ctx.lineTo(xScale(p.i), yScale(p.v));
    });
    ctx.stroke();
  });

  ctx.fillStyle = '#aaa';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  [0, Math.floor((n - 1) / 2), n - 1].forEach(i => {
    if (dated[i]) ctx.fillText(dated[i].log_date.slice(5), xScale(i), H - 8);
  });

  ctx.font = '10px sans-serif';
  series.forEach((s, i) => {
    ctx.fillStyle = s.color;
    ctx.fillRect(pad.left + i * 55, H - 14, 8, 8);
    ctx.fillStyle = '#888';
    ctx.fillText(s.label, pad.left + i * 55 + 11, H - 7);
  });
}

function renderWelcomeBack() {
  const wb = document.getElementById('welcome-back');
  const d = progressData;
  if (dayNumber() < 2) {
    wb.style.display = 'none';
    return;
  }

  let missed = 0;
  for (let i = 1; i <= 3; i++) {
    const ds = addDaysLocal(today(), -i);
    if (!d.ratings30.find(r => r.log_date === ds)) missed++;
  }

  wb.style.display = missed >= 2 ? 'block' : 'none';
}

// ─── SETTINGS SCREEN ──────────────────────────────────────────────────────────
// Track which accordion sections are open (default: all closed)
const settingsOpen = { profile: false, habits: false, gym: false, shopping: false, notifs: false };

function renderSettings() {
  const screen = document.getElementById('screen-settings');
  screen.innerHTML = '';

  renderSettingsAccordion(screen, 'profile',  '👤 Profile',        renderProfilePanel);
  renderSettingsAccordion(screen, 'habits',   '📋 Habits',         renderHabitsPanel);
  renderSettingsAccordion(screen, 'gym',      '🏋️ Gym Plan',       renderGymPanel);
  renderSettingsAccordion(screen, 'shopping', '🛒 Shopping List',  renderShoppingPanel);
  renderSettingsAccordion(screen, 'notifs',   '🔔 Notifications',  renderNotifsPanel);

  const spacer = document.createElement('div');
  spacer.className = 'screen-bottom-spacer';
  spacer.setAttribute('aria-hidden', 'true');
  screen.appendChild(spacer);
}

function getBlockHabits(blockId) {
  return habits.filter(h => h.block === blockId)
    .sort((a, b) => (a.item_order || 0) - (b.item_order || 0));
}

function renderSettingsAccordion(parent, key, title, renderFn) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin:0 14px 10px;';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:#fff;border:1px solid var(--border);border-radius:var(--radius);cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent;';
  header.innerHTML = `
    <span style="font-family:Georgia,serif;font-size:15px;">${title}</span>
    <svg class="acc-chevron" viewBox="0 0 20 20" fill="none" stroke="#aaa" stroke-width="2" width="16" height="16" style="transition:transform .2s;${settingsOpen[key] ? 'transform:rotate(180deg)' : ''}"><polyline points="5,8 10,13 15,8"/></svg>
  `;

  const body = document.createElement('div');
  body.style.cssText = `margin-top:2px;padding-bottom:12px;${settingsOpen[key] ? '' : 'display:none'}`;
  body.id = `acc-body-${key}`;

  header.addEventListener('click', () => {
    settingsOpen[key] = !settingsOpen[key];
    body.style.display = settingsOpen[key] ? 'block' : 'none';
    header.querySelector('.acc-chevron').style.transform = settingsOpen[key] ? 'rotate(180deg)' : '';
    if (settingsOpen[key]) renderFn(body);
  });

  if (settingsOpen[key]) renderFn(body);

  wrap.appendChild(header);
  wrap.appendChild(body);
  parent.appendChild(wrap);
}

function renderProfilePanel(container) {
  container.innerHTML = `
    <div style="background:#fff;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;">
      <div class="profile-row" style="padding:10px 16px;">
        <label style="font-size:14px;color:var(--muted);">Start date</label>
        <input type="date" class="profile-input" id="profile-start">
      </div>
      <div class="profile-row" style="padding:10px 16px;">
        <label id="profile-weight-label" style="font-size:14px;color:var(--muted);">Weight (${unitLabel()})</label>
        <input type="number" class="profile-input" id="profile-weight" step="0.1" placeholder="—">
      </div>
      <div class="profile-row" style="padding:10px 16px;border-bottom:none;">
        <label style="font-size:14px;color:var(--muted);">💧 Water goal (glasses)</label>
        <input type="number" class="profile-input" id="profile-water" min="1" max="20" value="${getWaterGoal()}" style="width:80px;">
      </div>
    </div>`;
  renderProfileSettings();
  const waterInput = document.getElementById('profile-water');
  if (waterInput) {
    waterInput.addEventListener('change', e => {
      appStore.settings.waterGoal = parseInt(e.target.value, 10) || 8;
      localStorage.setItem('waterGoal', e.target.value);
      saveStoreKey('settings', appStore.settings);
      const wc = document.getElementById('water-card');
      if (wc) wc.replaceWith(renderWaterWidget());
      showToast('Water goal updated');
    });
  }
}

function renderHabitsPanel(container) {
  container.innerHTML = '';
  const hidden = getHiddenBlocks();

  BLOCK_ORDER.forEach(blockId => {
    const meta = BLOCK_META[blockId];
    const blockHabits = getBlockHabits(blockId);
    const isHidden = hidden.includes(blockId);

    const labelRow = document.createElement('div');
    labelRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 4px 4px;';
    labelRow.innerHTML = `
      <span style="font-size:11px;color:var(--muted);letter-spacing:.7px;text-transform:uppercase;">${meta.icon} ${meta.label}</span>
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:var(--muted);">
        <span>${isHidden ? 'Hidden' : 'Visible'}</span>
        <div style="position:relative;width:36px;height:20px;">
          <input type="checkbox" id="vis-${blockId}" ${isHidden ? '' : 'checked'} style="opacity:0;width:0;height:0;">
          <span style="position:absolute;inset:0;border-radius:20px;background:${isHidden ? '#ccc' : 'var(--green)'};transition:.2s;cursor:pointer;">
            <span style="position:absolute;width:14px;height:14px;background:#fff;border-radius:50%;top:3px;left:${isHidden ? '3px' : '19px'};transition:.2s;"></span>
          </span>
        </div>
      </label>`;

    labelRow.querySelector(`#vis-${blockId}`).addEventListener('change', e => {
      const h2 = getHiddenBlocks();
      if (e.target.checked) {
        setHiddenBlocks(h2.filter(b => b !== blockId));
      } else {
        setHiddenBlocks([...h2, blockId]);
      }
      renderToday();
      renderHabitsPanel(container);
    });
    container.appendChild(labelRow);

    const card = document.createElement('div');
    card.style.cssText = 'background:#fff;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;margin-bottom:0;';
    if (blockHabits.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'settings-habit-empty';
      empty.textContent = 'No habits in this block yet';
      card.appendChild(empty);
    } else {
      blockHabits.forEach((h, i) => {
        const row = document.createElement('div');
        row.className = 'settings-habit-item';
        row.style.cssText = `border-radius:0;margin-bottom:0;${i < blockHabits.length - 1 ? 'border-bottom:1px solid #f0ede9;' : ''}`;
        row.innerHTML = `
          <button type="button" class="settings-habit-delete" aria-label="Delete ${h.label}">−</button>
          <div class="settings-habit-label">${h.label}</div>
          <div class="settings-habit-block" style="margin-right:4px">${h.sub || ''}</div>
          ${h.status === 'buy' ? '<span class="status-badge badge-buy" style="margin-right:4px">BUY</span>' : ''}
          ${h.status === 'rx' ? '<span class="status-badge badge-rx" style="margin-right:4px">RX</span>' : ''}
          <div class="settings-habit-reorder">
            <button type="button" class="habit-move-btn" data-dir="-1" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="habit-move-btn" data-dir="1" aria-label="Move down" ${i === blockHabits.length - 1 ? 'disabled' : ''}>↓</button>
          </div>
          <svg viewBox="0 0 20 20" fill="none" stroke="#ccc" stroke-width="2" width="14" height="14"><polyline points="7,5 13,10 7,15"/></svg>
        `;
        row.querySelector('.settings-habit-delete').addEventListener('click', e => {
          e.stopPropagation();
          deleteHabit(h, container);
        });
        row.querySelectorAll('.habit-move-btn').forEach(btn => {
          btn.addEventListener('click', e => {
            e.stopPropagation();
            moveHabit(h, blockId, +btn.dataset.dir, container);
          });
        });
        row.addEventListener('click', () => openEditHabit(h));
        card.appendChild(row);
      });
    }
    container.appendChild(card);

    const addBlockBtn = document.createElement('button');
    addBlockBtn.type = 'button';
    addBlockBtn.className = 'add-habit-btn';
    addBlockBtn.innerHTML = `<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="10" y1="4" x2="10" y2="16"/><line x1="4" y1="10" x2="16" y2="10"/></svg> Add to ${meta.label}`;
    addBlockBtn.addEventListener('click', () => openEditHabit(null, blockId));
    container.appendChild(addBlockBtn);
  });
}

async function moveHabit(habit, blockId, dir, habitsPanelContainer) {
  const blockHabits = getBlockHabits(blockId);
  const idx = blockHabits.findIndex(h => h.id === habit.id);
  const swapIdx = idx + dir;
  if (idx < 0 || swapIdx < 0 || swapIdx >= blockHabits.length) return;

  const other = blockHabits[swapIdx];
  const orderA = habit.item_order ?? idx + 1;
  const orderB = other.item_order ?? swapIdx + 1;

  try {
    await Promise.all([
      api('habits', 'PATCH', { item_order: orderB }, `?id=eq.${habit.id}`),
      api('habits', 'PATCH', { item_order: orderA }, `?id=eq.${other.id}`),
    ]);
    await loadHabits();
    renderToday();
    const panel = habitsPanelContainer || document.getElementById('acc-body-habits');
    if (panel) renderHabitsPanel(panel);
  } catch {
    showToast('Error reordering habit');
  }
}

async function deleteHabit(habit, habitsPanelContainer) {
  if (!confirm(`Delete "${habit.label}"?`)) return;
  try {
    await api('habits', 'DELETE', null, `?id=eq.${habit.id}`);
    await loadHabits();
    renderToday();
    const panel = habitsPanelContainer || document.getElementById('acc-body-habits');
    if (panel) renderHabitsPanel(panel);
    const shopBody = document.getElementById('acc-body-shopping');
    if (shopBody) renderShoppingSettings(shopBody);
    showToast('Habit deleted');
  } catch {
    showToast('Error deleting habit');
  }
}

function renderGymPanel(container) {
  container.innerHTML = '';
  const card = document.createElement('div');
  card.style.cssText = 'background:#fff;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;';
  getAllTemplates().forEach(({ id, name }, i, arr) => {
    const currentDow = getTemplateDay(id);
    const row = document.createElement('div');
    row.style.cssText = `display:flex;align-items:center;gap:10px;padding:13px 16px;${i < arr.length - 1 ? 'border-bottom:1px solid #f0ede9;' : ''}`;

    const info = document.createElement('div');
    info.style.cssText = 'flex:1;min-width:0;cursor:pointer;';
    info.innerHTML = `
      <div style="font-size:14px">${name}</div>
      <div style="font-size:12px;color:var(--muted);margin-top:2px">${currentDow != null ? DAY_NAMES[currentDow] : 'Not scheduled'} · tap to edit sets/reps</div>
    `;
    info.addEventListener('click', () => openGymModal(id, gymConfig.templates[id]));

    const daySelect = document.createElement('select');
    daySelect.className = 'gym-day-select';
    daySelect.innerHTML = ['<option value="">Rest</option>']
      .concat(DAY_NAMES.map((d, n) =>
        `<option value="${n}" ${currentDow === n ? 'selected' : ''}>${d}</option>`
      )).join('');
    daySelect.addEventListener('click', e => e.stopPropagation());
    daySelect.addEventListener('change', e => {
      setTemplateDay(id, e.target.value === '' ? null : +e.target.value);
      renderGymPanel(container);
      showToast('Schedule updated');
    });

    row.appendChild(info);
    row.appendChild(daySelect);
    card.appendChild(row);
  });
  container.appendChild(card);
}

function renderShoppingPanel(container) {
  renderShoppingSettings(container);
}

function renderHabitList() { /* legacy stub, used by openEditHabit */ renderSettings(); }

function renderProfileSettings() {
  const startInput = document.getElementById('profile-start');
  const weightInput = document.getElementById('profile-weight');

  if (startInput) {
    startInput.value = getStartDate();
    startInput.addEventListener('change', e => {
      appStore.settings.startDate = e.target.value;
      localStorage.setItem('startDate', e.target.value);
      saveStoreKey('settings', appStore.settings);
      updateHeaderDay();
      showToast('Start date saved');
    });
  }

  if (weightInput) {
    const weightLabel = document.getElementById('profile-weight-label');
    if (weightLabel) weightLabel.textContent = `Weight (${unitLabel()})`;
    api('weekly_logs', 'GET', null, '?order=week_start.desc&limit=1').then(rows => {
      if (rows && rows[0] && rows[0].weight_kg) weightInput.value = toDisplay(rows[0].weight_kg);
    });
    weightInput.addEventListener('change', async e => {
      const kg = toKg(e.target.value);
      const wk = getWeekStart(new Date());
      const existing = await api('weekly_logs', 'GET', null, `?week_start=eq.${wk}&limit=1`);
      if (existing && existing.length > 0) {
        await api('weekly_logs', 'PATCH', { weight_kg: kg }, `?week_start=eq.${wk}`);
      } else {
        await api('weekly_logs', 'POST', { week_start: wk, weight_kg: kg });
      }
      showToast('Weight saved');
    });
  }
}

function renderNotifsPanel(container) {
  container.innerHTML = '';
  const permission = 'Notification' in window ? Notification.permission : 'unsupported';
  const settings = getNotifSettings();

  // Permission status banner
  const banner = document.createElement('div');
  banner.style.cssText = 'padding:12px 16px;margin-bottom:8px;border-radius:var(--radius);font-size:13px;';

  if (permission === 'granted') {
    banner.style.cssText += 'background:#e8f5e9;color:#2e7d32;';
    banner.textContent = '✓ Notifications enabled';
  } else if (permission === 'denied') {
    banner.style.cssText += 'background:#ffeaea;color:#c0392b;';
    banner.innerHTML = '✗ Notifications blocked — enable in your phone\'s browser settings';
  } else if (permission === 'unsupported') {
    banner.style.cssText += 'background:#f5f5f5;color:#888;';
    banner.textContent = 'Notifications not supported in this browser';
  } else {
    banner.style.cssText += 'background:#fff8e7;color:#8a6500;cursor:pointer;';
    banner.textContent = '⚠ Tap to enable notifications';
    banner.addEventListener('click', async () => {
      const ok = await requestNotifPermission();
      if (ok) { scheduleNotifications(); renderNotifsPanel(container); showToast('Notifications enabled'); }
    });
  }
  container.appendChild(banner);

  // Per-reminder rows
  const card = document.createElement('div');
  card.style.cssText = 'background:#fff;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;';

  const NOTIF_ORDER = ['morning','midday','physio','evening','bedtime','logday'];
  NOTIF_ORDER.forEach((key, i) => {
    const cfg = settings[key] || NOTIF_DEFAULTS[key];
    const row = document.createElement('div');
    row.style.cssText = `display:flex;align-items:center;gap:12px;padding:12px 16px;${i < NOTIF_ORDER.length-1 ? 'border-bottom:1px solid #f0ede9;' : ''}`;
    row.innerHTML = `
      <div style="flex:1;min-width:0;">
        <div style="font-size:14px;">${cfg.label}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px;">${cfg.body}</div>
      </div>
      <input type="time" value="${cfg.time}" id="ntime-${key}" style="border:1.5px solid var(--border);border-radius:7px;padding:4px 7px;font-size:13px;font-family:inherit;background:#fff;color:var(--text);width:88px;">
      <label style="position:relative;display:inline-block;width:42px;height:24px;flex-shrink:0;">
        <input type="checkbox" id="ntog-${key}" ${cfg.enabled ? 'checked' : ''} style="opacity:0;width:0;height:0;">
        <span id="nslider-${key}" style="position:absolute;cursor:pointer;inset:0;border-radius:24px;transition:.2s;background:${cfg.enabled ? 'var(--green)' : '#ccc'};">
          <span style="position:absolute;width:18px;height:18px;background:#fff;border-radius:50%;top:3px;left:${cfg.enabled ? '21px' : '3px'};transition:.2s;"></span>
        </span>
      </label>
    `;

    const toggle = row.querySelector(`#ntog-${key}`);
    const slider = row.querySelector(`#nslider-${key}`);
    const dot = slider.querySelector('span');
    const timeInput = row.querySelector(`#ntime-${key}`);

    toggle.addEventListener('change', () => {
      settings[key] = { ...cfg, enabled: toggle.checked };
      slider.style.background = toggle.checked ? 'var(--green)' : '#ccc';
      dot.style.left = toggle.checked ? '21px' : '3px';
      saveNotifSettings(settings);
      scheduleNotifications();
    });

    timeInput.addEventListener('change', () => {
      settings[key] = { ...settings[key], time: timeInput.value };
      saveNotifSettings(settings);
      scheduleNotifications();
      showToast('Reminder time updated');
    });

    card.appendChild(row);
  });
  container.appendChild(card);

  // Test button
  const testBtn = document.createElement('button');
  testBtn.style.cssText = 'margin-top:8px;width:100%;padding:12px;background:none;border:1.5px dashed var(--border);border-radius:var(--radius);font-size:14px;color:var(--muted);cursor:pointer;font-family:inherit;';
  testBtn.textContent = '🔔 Send test notification';
  testBtn.addEventListener('click', async () => {
    const ok = await requestNotifPermission();
    if (!ok) { showToast('Notifications not permitted'); return; }
    const sw = await navigator.serviceWorker?.ready;
    if (sw) {
      sw.active.postMessage({ type: 'SHOW_NOTIFICATION', title: 'Samerth Health', body: 'Notifications are working ✓', tag: 'test' });
    } else {
      new Notification('Samerth Health', { body: 'Notifications are working ✓' });
    }
  });
  container.appendChild(testBtn);
}

function updateHeaderDay() {
  document.querySelector('.header-day').textContent = dayLabel();
}

// ─── GYM SETTINGS (legacy stub — rendering now via renderGymPanel) ─────────────
function renderGymSettings() {}

function moveExercise(templateId, idx, dir) {
  const arr = gymConfig.templates[templateId].exercises;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= arr.length) return;
  [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
  saveGymConfig();
  openGymModal(templateId, gymConfig.templates[templateId]);
}

function openGymModal(templateId, plan) {
  const overlay = document.getElementById('gym-modal-overlay');
  plan = getTemplateById(templateId) || normalizeGymTemplate(plan, DEFAULT_GYM_TEMPLATES[templateId]);
  gymConfig.templates[templateId] = plan;
  document.getElementById('gym-modal-title').textContent = plan.name;
  const body = document.getElementById('gym-modal-body');
  body.innerHTML = '';

  const hint = document.createElement('div');
  hint.style.cssText = 'padding:0 18px 8px;font-size:12px;color:var(--muted);';
  hint.textContent = 'Exercises run top to bottom. Use arrows to reorder.';
  body.appendChild(hint);

  const card = document.createElement('div');
  card.style.cssText = 'margin:0 18px;background:#fff;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;';

  (plan.exercises || []).forEach((ex, idx) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:11px 14px;border-bottom:1px solid #f0ede9;';
    if (idx === plan.exercises.length - 1) row.style.borderBottom = 'none';
    const repsLabel = ex.reps != null ? `${ex.reps} reps` : (ex.note || '');
    row.innerHTML = `
      <span style="font-size:12px;color:var(--muted);width:18px;text-align:center;flex-shrink:0;">${idx + 1}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:14px">${ex.name}</div>
        <div style="font-size:12px;color:var(--muted)">${ex.sets} sets${repsLabel ? ` × ${repsLabel}` : ''}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:2px;flex-shrink:0;">
        <button type="button" class="exercise-move-btn" data-dir="-1" ${idx === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="exercise-move-btn" data-dir="1" ${idx === plan.exercises.length - 1 ? 'disabled' : ''}>↓</button>
      </div>
      <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
        <input type="number" value="${ex.sets}" min="1" max="10" style="width:38px;border:1.5px solid var(--border);border-radius:6px;padding:4px;font-size:13px;text-align:center;background:#fff;" data-idx="${idx}" data-field="sets">
        <span style="font-size:12px;color:var(--muted)">×</span>
        <input type="number" value="${ex.reps}" min="1" max="50" style="width:38px;border:1.5px solid var(--border);border-radius:6px;padding:4px;font-size:13px;text-align:center;background:#fff;" data-idx="${idx}" data-field="reps">
      </div>
    `;
    row.querySelectorAll('.exercise-move-btn').forEach(btn => {
      btn.addEventListener('click', () => moveExercise(templateId, idx, +btn.dataset.dir));
    });
    card.appendChild(row);
  });

  body.appendChild(card);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'save-btn';
  saveBtn.textContent = 'Save changes';
  saveBtn.addEventListener('click', () => {
    card.querySelectorAll('input[data-field]').forEach(input => {
      const idx = +input.dataset.idx;
      const field = input.dataset.field;
      gymConfig.templates[templateId].exercises[idx][field] = +input.value;
    });
    saveGymConfig();
    closeGymModal();
    const gymBody = document.getElementById('acc-body-gym');
    if (gymBody) renderGymPanel(gymBody);
    showToast('Workout updated');
  });
  body.appendChild(saveBtn);
  overlay.classList.add('open');
}

function closeGymModal() {
  document.getElementById('gym-modal-overlay').classList.remove('open');
}

// ─── SHOPPING LIST ────────────────────────────────────────────────────────────
// Two kinds of items:
//   1. Habit items with status='buy' (any block except 'shopping') — read-only, tap to open habit editor
//   2. Standalone shopping items (block='shopping') — checkable + editable

function renderShoppingSettings(container) {
  if (!container) container = document.getElementById('shopping-settings');
  if (!container) return;
  container.innerHTML = '';

  // Section 1: habit buy-items
  const habitBuyItems = habits.filter(h => h.block !== 'shopping' && h.status === 'buy');
  if (habitBuyItems.length > 0) {
    const label = document.createElement('div');
    label.style.cssText = 'font-size:11px;color:var(--muted);letter-spacing:.7px;text-transform:uppercase;padding:8px 4px 4px;';
    label.textContent = 'From habits (marked Need to Buy)';
    container.appendChild(label);

    const card = document.createElement('div');
    card.style.cssText = 'background:#fff;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;margin-bottom:10px;';
    habitBuyItems.forEach((h, i) => {
      const row = document.createElement('div');
      row.style.cssText = `display:flex;align-items:center;gap:12px;padding:11px 14px;cursor:pointer;${i < habitBuyItems.length-1 ? 'border-bottom:1px solid #f0ede9;' : ''}`;
      row.innerHTML = `
        <span style="font-size:18px">💊</span>
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;">${h.label}</div>
          <div style="font-size:12px;color:var(--muted);">${BLOCK_META[h.block]?.label || h.block}</div>
        </div>
        <span class="status-badge badge-buy">BUY</span>
        <svg viewBox="0 0 20 20" fill="none" stroke="#ccc" stroke-width="2" width="14" height="14"><polyline points="7,5 13,10 7,15"/></svg>
      `;
      row.addEventListener('click', () => openEditHabit(h));
      card.appendChild(row);
    });
    container.appendChild(card);
  }

  // Section 2: standalone shopping items
  const label2 = document.createElement('div');
  label2.style.cssText = 'font-size:11px;color:var(--muted);letter-spacing:.7px;text-transform:uppercase;padding:8px 4px 4px;';
  label2.textContent = 'My shopping list';
  container.appendChild(label2);

  const shopItems = habits.filter(h => h.block === 'shopping');
  const card2 = document.createElement('div');
  card2.style.cssText = 'background:#fff;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;';

  if (shopItems.length === 0) {
    card2.innerHTML = '<div style="padding:14px 16px;font-size:14px;color:var(--muted);">No items yet — add below</div>';
  } else {
    shopItems.forEach((h, i) => {
      const row = document.createElement('div');
      row.style.cssText = `display:flex;align-items:center;gap:12px;padding:11px 14px;${i < shopItems.length-1 ? 'border-bottom:1px solid #f0ede9;' : ''}`;
      const bought = h.status === 'have';
      row.innerHTML = `
        <div class="habit-check ${bought ? 'checked' : ''}" id="shop-check-${h.id}" style="flex-shrink:0;cursor:pointer;width:26px;height:26px;">${checkSVG()}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;${bought ? 'text-decoration:line-through;color:var(--muted);' : ''}">${h.label}</div>
          ${h.sub ? `<div style="font-size:12px;color:var(--muted)">${h.sub}</div>` : ''}
        </div>
        <svg viewBox="0 0 20 20" fill="none" stroke="#ccc" stroke-width="2" width="14" height="14" style="cursor:pointer;flex-shrink:0;" id="shop-edit-${h.id}"><polyline points="7,5 13,10 7,15"/></svg>
      `;
      row.querySelector(`#shop-check-${h.id}`).addEventListener('click', () => toggleShopItem(h));
      row.querySelector(`#shop-edit-${h.id}`).addEventListener('click', () => openShopModal(h));
      card2.appendChild(row);
    });
  }
  container.appendChild(card2);

  const addBtn = document.createElement('button');
  addBtn.className = 'add-habit-btn';
  addBtn.style.cssText = 'margin-top:6px;width:100%;';
  addBtn.innerHTML = `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="10" y1="4" x2="10" y2="16"/><line x1="4" y1="10" x2="16" y2="10"/></svg> Add to shopping list`;
  addBtn.addEventListener('click', () => openShopModal(null));
  container.appendChild(addBtn);
}

async function toggleShopItem(h) {
  const newStatus = h.status === 'buy' ? 'have' : 'buy';
  await api('habits', 'PATCH', { status: newStatus }, `?id=eq.${h.id}`);
  await loadHabits();
  renderShoppingSettings(document.getElementById('acc-body-shopping'));
  renderBuyCard();
}

function renderBuyCard() {
  // Re-render buy card on Today screen without full re-render
  const container = document.getElementById('today-blocks');
  const existing = container.querySelector('.buy-card');
  const buyItems = habits.filter(h => h.block === 'shopping' && h.status === 'buy')
    .concat(habits.filter(h => h.block !== 'shopping' && h.status === 'buy'));
  if (existing) existing.remove();
  if (buyItems.length > 0) {
    const buyCard = document.createElement('div');
    buyCard.className = 'card buy-card';
    buyCard.style.cssText = 'margin:10px 14px;border-left:3px solid #f5a623;';
    buyCard.innerHTML = `
      <div style="padding:11px 14px 6px;display:flex;align-items:center;justify-content:space-between;">
        <span style="font-family:Georgia,serif;font-size:13px;color:#b87000;">🛒 Need to buy (${buyItems.length})</span>
        <button onclick="document.querySelector('[data-screen=settings]').click();setTimeout(()=>document.getElementById('shopping-settings').scrollIntoView({behavior:'smooth'}),200)" style="background:none;border:none;font-size:11px;color:var(--muted);cursor:pointer;font-family:inherit;">Manage →</button>
      </div>
      <div style="padding:0 14px 12px;display:flex;flex-wrap:wrap;gap:6px;">
        ${buyItems.map(h => `<span style="background:#fff3cd;color:#856404;border:1px solid #f5d87a;border-radius:20px;padding:4px 11px;font-size:13px;">${h.label}</span>`).join('')}
      </div>`;
    container.insertBefore(buyCard, container.firstChild);
  }
}

function openShopModal(item) {
  const overlay = document.getElementById('shop-modal-overlay');
  document.getElementById('shop-item-label').value = item?.label || '';
  document.getElementById('shop-item-note').value = item?.sub || '';
  const saveBtn = document.getElementById('shop-item-save');
  const deleteBtn = document.getElementById('shop-item-delete');

  saveBtn.onclick = async () => {
    const label = document.getElementById('shop-item-label').value.trim();
    if (!label) { showToast('Item name required'); return; }
    const payload = { label, sub: document.getElementById('shop-item-note').value.trim() || null, block: 'shopping', status: 'buy', frequency: 'daily' };
    if (item) {
      await api('habits', 'PATCH', payload, `?id=eq.${item.id}`);
    } else {
      await api('habits', 'POST', payload);
    }
    await loadHabits();
    renderShoppingSettings(document.getElementById('acc-body-shopping'));
    renderBuyCard();
    closeShopModal();
    showToast(item ? 'Item updated' : 'Item added');
  };

  deleteBtn.style.display = item ? 'block' : 'none';
  if (item) {
    deleteBtn.onclick = async () => {
      await api('habits', 'DELETE', null, `?id=eq.${item.id}`);
      await loadHabits();
      renderShoppingSettings(document.getElementById('acc-body-shopping'));
      renderBuyCard();
      closeShopModal();
      showToast('Item removed');
    };
  }
  overlay.classList.add('open');
}

function closeShopModal() {
  document.getElementById('shop-modal-overlay').classList.remove('open');
}

// ─── EDIT HABIT MODAL ──────────────────────────────────────────────────────────
function openEditHabit(habit, defaultBlock = null) {
  const modal = document.getElementById('edit-modal');
  const overlay = document.getElementById('modal-overlay');
  const title = document.getElementById('modal-title');

  title.textContent = habit ? 'Edit Habit' : 'New Habit';

  document.getElementById('edit-label').value = habit?.label || '';
  document.getElementById('edit-sub').value = habit?.sub || '';
  document.getElementById('edit-block').value = habit?.block || defaultBlock || 'morning';
  document.getElementById('edit-freq').value = habit?.frequency || 'daily';
  document.getElementById('edit-status').value = habit?.status || 'have';
  document.getElementById('edit-notes').value = habit?.notes || '';

  const saveBtn = document.getElementById('edit-save');
  const deleteBtn = document.getElementById('edit-delete');

  saveBtn.onclick = async () => {
    const payload = {
      label: document.getElementById('edit-label').value.trim(),
      sub: document.getElementById('edit-sub').value.trim() || null,
      block: document.getElementById('edit-block').value,
      frequency: document.getElementById('edit-freq').value,
      status: document.getElementById('edit-status').value,
      notes: document.getElementById('edit-notes').value.trim() || null,
    };
    if (!payload.label) { showToast('Label required'); return; }

    try {
      if (habit) {
        await api('habits', 'PATCH', payload, `?id=eq.${habit.id}`);
      } else {
        const maxOrder = Math.max(0, ...habits.filter(h => h.block === payload.block).map(h => h.item_order || 0));
        payload.item_order = maxOrder + 1;
        await api('habits', 'POST', payload);
      }
      await loadHabits();
      renderToday();
      const habBody = document.getElementById('acc-body-habits');
      if (habBody) renderHabitsPanel(habBody);
      const shopBody = document.getElementById('acc-body-shopping');
      if (shopBody) renderShoppingSettings(shopBody);
      closeModal();
      showToast(habit ? 'Habit updated' : 'Habit added');
    } catch (e) { showToast('Error saving'); }
  };

  deleteBtn.style.display = habit ? 'block' : 'none';
  if (habit) {
    deleteBtn.onclick = async () => {
      closeModal();
      await deleteHabit(habit);
    };
  }

  overlay.classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

// ─── NAVIGATION ───────────────────────────────────────────────────────────────
function setupNav() {
  const navBtns = document.querySelectorAll('.nav-btn');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const screen = btn.dataset.screen;
      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      document.getElementById(`screen-${screen}`).classList.add('active');
      if (screen === 'gym') renderGym();
      if (screen === 'progress') renderProgress();
      if (screen === 'settings') renderSettings();
      if (screen === 'today') {
        checkDayRollover().then(() => flushPendingCheckSync());
      }
    });
  });

  // Header
  const dayEl = document.querySelector('.header-day');
  const dateEl = document.querySelector('.header-date');
  dayEl.textContent = dayLabel();
  dateEl.textContent = new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
}

// ─── MODAL OVERLAY CLOSE ──────────────────────────────────────────────────────
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});
document.getElementById('modal-close').addEventListener('click', closeModal);

document.getElementById('gym-modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('gym-modal-overlay')) closeGymModal();
});
document.getElementById('gym-modal-close').addEventListener('click', closeGymModal);

document.getElementById('shop-modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('shop-modal-overlay')) closeShopModal();
});
document.getElementById('shop-modal-close').addEventListener('click', closeShopModal);

// ─── START ────────────────────────────────────────────────────────────────────
init();
