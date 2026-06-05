const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');

const PORT      = 7777;

// All files live next to the exe (or next to server.js in dev)
const APP_DIR = process.env.STREAM_ARENA_DIR || __dirname;

const LOCAL_FONT_DIR    = path.join(APP_DIR, 'fonts');
const FONT_DIR_FALLBACK = 'C:/Users/kisha/Documents/mmrock9';
const SETTINGS_FILE     = path.join(APP_DIR, 'settings.json');

const _FONT_EXTS = new Set(['.ttf','.otf','.woff','.woff2']);
function findFontPath(name) {
  if (!name || name === 'monospace' || name === 'sans-serif') return null;
  let found = null;
  (function walk(dir, rel) {
    if (found) return;
    try {
      fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
        if (found) return;
        if (e.isDirectory()) { walk(path.join(dir, e.name), rel ? rel+'/'+e.name : e.name); }
        else {
          const ext = path.extname(e.name).toLowerCase();
          if (_FONT_EXTS.has(ext) && path.basename(e.name, ext) === name)
            found = (rel ? rel+'/' : '') + e.name;
        }
      });
    } catch(e2) {}
  })(LOCAL_FONT_DIR, '');
  return found;
}

// ── Trigger counter for test button ──────────────────────────────────────────
let triggerCount = 0;

// ── Countdown state ───────────────────────────────────────────────────────────
let countdownState = { running: false, endTime: null, remaining: 0, totalMs: 300000 };

function tickCountdown() {
  if (countdownState.running && countdownState.endTime) {
    countdownState.remaining = Math.max(0, countdownState.endTime - Date.now());
    if (countdownState.remaining === 0) countdownState.running = false;
  }
}
setInterval(tickCountdown, 200);

// ── Default settings ─────────────────────────────────────────────────────────
// ── Default settings (template for fresh profiles) ───────────────────────────
const DEFAULTS = {
  position:    'bottom-right',
  bgOpacity:   0.85,
  slideIn:     true,
  slideOut:    true,
  slideMs:     550,
  showMs:      8000,
  snipFile:    'C:/Users/kisha/Desktop/MMA_Casting/MMA_Resources/StreamResources/Snip/Snip.txt',
  settingsPath: '',
  songOutputPath: '',
  overrides:   [],
  streamNotes: '',
  startggToken: '',
  startggTourneyUrl: '',
  discordClientId: '',
  discordClientSecret: '',
  discordOverlay: null,
  discordOverlay2: null,
  discordOverlaySolo: null,
  widgetEnabled: null,
  widgetLayout: null,
  widgetOpen: null,
  bskyHandle: '',
  bskyHandleSaved: '',
  bskyAppPassword: '',
  bskyReplaysFolder: '',
  bskyTitleTemplate: '',
  bskyDescription: '',
  bskyFilterEnabled: false,
  bskyFilterKeyword: 'Replay',
  ytClientId: '',
  ytClientSecret: '',
  ytAccessToken: '',
  ytRefreshToken: '',
  ytTokenExpiry: 0,
  ytChannelName: '',
  chatCommands: [],
  bitlyToken: '',
  bitlyLink: '',
  bitlyLabel: 'DOWNLOADS',
  brb: {
    folder:   'C:/Users/kisha/Desktop/MMA_Casting/MMA_Resources/StreamResources/SpotifyDisplay/Server/brb_display',
    imageDuration: 10,
    htmlDuration:  20,
    videoDuration: 0,
    fadeTime: 1,
    randomize: true,
    transition: 'fade',
    links:    [],
    tshRoot:  'C:/Users/kisha/Desktop/MMA_Casting/TSH/TournamentStreamHelper-5.970',
    widgets: {
      clock:     { enabled: false, format: '12h', label: 'Be Right Back' },
      countdown: { enabled: false, minutes: 5, label: 'Back in...' },
      social:    { enabled: false, twitch: '', twitter: '', discord: '', message: 'Follow for more!' },
      nextMatch: { inSlideshow: false, p1: '', p2: '', round: '', duration: 15 }
    }
  }
};

// ── Profile system (Option A: each profile = its own JSON file) ───────────────
// profiles/{id}.json  — complete settings for that profile
// profile-index.json  — { active: id, profiles: { id: {name} } }
const PROFILES_DIR       = path.join(APP_DIR, 'profiles');
const PROFILE_INDEX_FILE = path.join(APP_DIR, 'profile-index.json');

try { fs.mkdirSync(PROFILES_DIR, { recursive: true }); } catch(e) {}

let activeProfileId = 'default';
let profileIndex    = { active: 'default', profiles: { default: { name: 'Default' } } };

function _profilePath(id) { return path.join(PROFILES_DIR, id + '.json'); }

function _slugify(name) {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return s || 'profile';
}

function _uniqueId(name) {
  let base = _slugify(name);
  if (!profileIndex.profiles[base]) return base;
  let n = 2;
  while (profileIndex.profiles[base + '_' + n]) n++;
  return base + '_' + n;
}

function _profileListArr() {
  return Object.entries(profileIndex.profiles || {}).map(([id, p]) => ({ id, name: p.name || id }));
}

function _saveIndex() {
  profileIndex.active = activeProfileId;
  fs.writeFileSync(PROFILE_INDEX_FILE, JSON.stringify(profileIndex, null, 2), 'utf8');
}

function _brbMerge(saved) {
  const b = saved.brb || {};
  const db = DEFAULTS.brb;
  return Object.assign({}, db, b, {
    links: b.links || [],
    imageDuration: b.imageDuration || db.imageDuration,
    htmlDuration:  b.htmlDuration  || db.htmlDuration,
    widgets: Object.assign({}, db.widgets, b.widgets || {}, {
      clock:     Object.assign({}, db.widgets.clock,     (b.widgets||{}).clock     || {}),
      countdown: Object.assign({}, db.widgets.countdown, (b.widgets||{}).countdown || {}),
      social:    Object.assign({}, db.widgets.social,    (b.widgets||{}).social    || {})
    })
  });
}

function _loadProfileRaw(id) {
  try { return JSON.parse(fs.readFileSync(_profilePath(id), 'utf8')); } catch(e) { return {}; }
}

function _applyRawToS(s, raw) {
  if (raw.bskyHandle && !raw.bskyHandleSaved) raw.bskyHandleSaved = raw.bskyHandle;
  Object.keys(s).forEach(k => delete s[k]);
  Object.assign(s, DEFAULTS, raw);
  s.brb = _brbMerge(s);
}

function loadSettings() {
  // Load profile index
  try {
    const idx = JSON.parse(fs.readFileSync(PROFILE_INDEX_FILE, 'utf8'));
    profileIndex    = idx;
    activeProfileId = idx.active || Object.keys(idx.profiles || {})[0] || 'default';
  } catch(e) {
    // First run — migrate existing settings.json into Default profile
    let existing = {};
    try {
      existing = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
      delete existing.profiles; delete existing.activeProfile;
      // Rename settings.json → settings.json.bak so it's clear it's no longer active
      try { fs.renameSync(SETTINGS_FILE, SETTINGS_FILE + '.bak'); } catch(e3) {}
    } catch(e2) {}
    const seed = Object.assign({}, DEFAULTS, existing);
    fs.writeFileSync(_profilePath('default'), JSON.stringify(seed, null, 2), 'utf8');
    profileIndex    = { active: 'default', profiles: { default: { name: 'Default' } } };
    activeProfileId = 'default';
    _saveIndex();
  }
  const raw = _loadProfileRaw(activeProfileId);
  const s = Object.assign({}, DEFAULTS, raw);
  if (s.bskyHandle && !s.bskyHandleSaved) s.bskyHandleSaved = s.bskyHandle;
  s.brb = _brbMerge(s);
  // Ensure the active profile file exists on disk (recreate if manually deleted)
  if (!fs.existsSync(_profilePath(activeProfileId))) {
    try { fs.writeFileSync(_profilePath(activeProfileId), JSON.stringify(s, null, 2), 'utf8'); } catch(e) {}
  }
  return s;
}

function saveSettings(s) {
  // Write the active profile file — everything in s except internal metadata
  fs.writeFileSync(_profilePath(activeProfileId), JSON.stringify(s, null, 2), 'utf8');
}

// Switch active profile, mutating s in-place so all route handlers keep working
function _switchProfile(s, newId) {
  saveSettings(s);                       // flush current profile first
  activeProfileId = newId;
  profileIndex.active = newId;
  _saveIndex();
  _applyRawToS(s, _loadProfileRaw(newId));
}

// ── MIME ─────────────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html',   '.css': 'text/css',
  '.js':   'application/javascript', '.json': 'application/json',
  '.png':  'image/png',   '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',   '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ttf':  'font/truetype', '.otf': 'font/otf',
  '.woff': 'font/woff',   '.woff2': 'font/woff2',
  '.mp4':  'video/mp4',   '.webm': 'video/webm', '.mov': 'video/quicktime'
};
const IMAGE_EXTS = new Set(['.png','.jpg','.jpeg','.gif','.webp','.svg']);
const VIDEO_EXTS = new Set(['.mp4','.webm','.mov']);
const HTML_EXTS  = new Set(['.html','.htm']);

function serveFile(filePath, res) {
  try {
    const data = fs.readFileSync(filePath);
    const ext  = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
    res.end(data);
  } catch(e) {
    res.writeHead(404); res.end('Not found: ' + filePath);
  }
}

function serveHtml(filename, res) {
  try {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync(path.join(APP_DIR, filename), 'utf8'));
  } catch(e) { res.writeHead(500); res.end('Could not load ' + filename); }
}

function json200(res, obj) {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise(resolve => {
    let b = ''; req.on('data', c => b += c); req.on('end', () => resolve(b));
  });
}

function scanBrbFolder(folderPath) {
  try {
    return fs.readdirSync(folderPath).reduce((acc, entry) => {
      const ext  = path.extname(entry).toLowerCase();
      const full = path.join(folderPath, entry).replace(/\\/g, '/');
      if (IMAGE_EXTS.has(ext)) acc.push({ type: 'image',  src: full });
      else if (VIDEO_EXTS.has(ext)) acc.push({ type: 'video',  src: full });
      else if (HTML_EXTS.has(ext)) acc.push({ type: 'iframe', src: full });
      return acc;
    }, []);
  } catch(e) { return []; }
}

// ── Normalize string for loose matching ──────────────────────────────────────
function normalize(str) {
  return str
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// ── Parse song text into title + artist ──────────────────────────────────────
function parseSong(raw, overrides) {
  const ov = (overrides || []).find(o => o.raw && (
    o.raw === raw || normalize(o.raw) === normalize(raw)
  ));
  if (ov) {
    return { raw, title: ov.title || raw, artist: ov.artist || '' };
  }
  const dash = raw.indexOf(' - ');
  if (dash !== -1) {
    return { raw, artist: raw.slice(0, dash).trim(), title: raw.slice(dash + 3).trim() };
  }
  return { raw, title: raw, artist: '' };
}

// ── YouTube Chat global state ─────────────────────────────────────────────────
if (!global.ytState)   global.ytState   = { liveChatId: null, nextPageToken: null, polling: false, pollTimer: null };
if (!global.pollState) global.pollState = { active: false, votes: { '1': 0, '2': 0 }, voters: new Map(), p1: { name: '', imageUrl: '' }, p2: { name: '', imageUrl: '' } };

function ytApiReq(method, pathStr, params, body, token) {
  const https = require('https');
  const qs = params ? ('?' + Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&')) : '';
  const buf = body ? Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)) : null;
  return new Promise((resolve, reject) => {
    const r = https.request({
      hostname: 'www.googleapis.com', path: pathStr + qs, method,
      headers: Object.assign({ 'Authorization': 'Bearer ' + token },
        buf ? { 'Content-Type': 'application/json', 'Content-Length': buf.length } : {})
    }, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        const txt = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, body: JSON.parse(txt) }); }
        catch(e) { resolve({ status: res.statusCode, body: txt }); }
      });
    });
    r.on('error', reject);
    if (buf) r.write(buf);
    r.end();
  });
}

async function ytEnsureToken() {
  const s = loadSettings();
  if (!s.ytAccessToken) return null;
  if (s.ytTokenExpiry && Date.now() < s.ytTokenExpiry - 10000) return s.ytAccessToken;
  if (!s.ytRefreshToken || !s.ytClientId || !s.ytClientSecret) return null;
  const https = require('https');
  const body = 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(s.ytRefreshToken) +
    '&client_id=' + encodeURIComponent(s.ytClientId) + '&client_secret=' + encodeURIComponent(s.ytClientSecret);
  const buf = Buffer.from(body);
  return new Promise(resolve => {
    const r = https.request({
      hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': buf.length }
    }, res2 => {
      let d = ''; res2.on('data', c => d += c);
      res2.on('end', () => {
        try {
          const p = JSON.parse(d);
          if (p.access_token) {
            s.ytAccessToken = p.access_token;
            s.ytTokenExpiry = Date.now() + (p.expires_in - 60) * 1000;
            saveSettings(s);
            resolve(p.access_token);
          } else resolve(null);
        } catch(e) { resolve(null); }
      });
    });
    r.on('error', () => resolve(null));
    r.write(buf); r.end();
  });
}

async function ytPollOnce() {
  const yt = global.ytState;
  if (!yt.liveChatId) return;
  const token = await ytEnsureToken();
  if (!token) return;
  const s = loadSettings();
  const params = { liveChatId: yt.liveChatId, part: 'snippet,authorDetails', maxResults: '200' };
  if (yt.nextPageToken) params.pageToken = yt.nextPageToken;
  const r = await ytApiReq('GET', '/youtube/v3/liveChat/messages', params, null, token);
  if (r.status !== 200) return;
  yt.nextPageToken = r.body.nextPageToken || null;
  for (const msg of (r.body.items || [])) {
    const text = (msg.snippet?.textMessageDetails?.messageText || '').trim();
    const channelId = msg.authorDetails?.channelId || '';
    if (!text || !channelId) continue;
    if (global.pollState.active && (text === '1' || text === '2') && !global.pollState.voters.has(channelId)) {
      global.pollState.votes[text]++;
      global.pollState.voters.set(channelId, text);
    }
    const lower = text.toLowerCase();
    for (const cmd of (s.chatCommands || [])) {
      if (!cmd.command || !cmd.response) continue;
      const c = cmd.command.toLowerCase();
      if (lower === c || lower.startsWith(c + ' ')) {
        const freshToken = await ytEnsureToken();
        if (freshToken) {
          await ytApiReq('POST', '/youtube/v3/liveChat/messages', { part: 'snippet' },
            { snippet: { liveChatId: yt.liveChatId, type: 'textMessageEvent', textMessageDetails: { messageText: cmd.response } } }, freshToken);
        }
        break;
      }
    }
  }
}

function ytStartPolling() {
  if (global.ytState.polling) return;
  global.ytState.polling = true;
  global.ytState.pollTimer = setInterval(() => { ytPollOnce().catch(() => {}); }, 5000);
}

function ytStopPolling() {
  if (global.ytState.pollTimer) clearInterval(global.ytState.pollTimer);
  global.ytState.polling = false;
  global.ytState.pollTimer = null;
}
// ── End YouTube Chat global state ─────────────────────────────────────────────

// ── Server ───────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const s        = loadSettings();

  // ── HTML pages ──────────────────────────────────────────────────────────
  if (pathname === '/' || pathname === '/overlay') { serveHtml('music_overlay.html', res); return; }
  if (pathname === '/controls')                    { serveHtml('controls.html', res); return; }
  if (pathname === '/brb')       { serveHtml('brb-overlay.html',    res); return; }
  if (pathname === '/clock')     { serveHtml('clock-overlay.html',  res); return; }
  if (pathname === '/countdown') { serveHtml('countdown-overlay.html', res); return; }
  if (pathname === '/social')     { serveHtml('social-overlay.html',    res); return; }
  if (pathname === '/nextmatch')      { serveHtml('nextmatch-overlay.html',  res); return; }
  if (pathname === '/poll-overlay')         { serveHtml('poll-overlay.html',         res); return; }
  if (pathname === '/bitly-overlay')        { serveHtml('bitly-overlay.html',        res); return; }
  if (pathname === '/discord-overlay')      { serveHtml('discord-overlay.html',      res); return; }
  if (pathname === '/discord-overlay-2')    { serveHtml('discord-overlay.html',      res); return; }
  if (pathname === '/discord-overlay-solo') { serveHtml('discord-overlay-solo.html', res); return; }

  // Countdown control
  if (pathname === '/countdown-cmd' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      const s2   = loadSettings();
      const mins = (s2.brb && s2.brb.widgets && s2.brb.widgets.countdown && s2.brb.widgets.countdown.minutes) || 5;
      countdownState.totalMs = mins * 60 * 1000;
      if (body.cmd === 'start') {
        countdownState.endTime  = Date.now() + (countdownState.remaining > 0 ? countdownState.remaining : countdownState.totalMs);
        countdownState.running  = true;
        countdownState.remaining = countdownState.remaining > 0 ? countdownState.remaining : countdownState.totalMs;
      } else if (body.cmd === 'stop') {
        countdownState.running = false;
      } else if (body.cmd === 'reset') {
        countdownState.running   = false;
        countdownState.remaining = countdownState.totalMs;
        countdownState.endTime   = null;
      }
      json200(res, { state: body.cmd, remaining: countdownState.remaining });
    } catch(e) { res.writeHead(400); res.end('Bad request'); }
    return;
  }

  // Countdown state for overlay polling
  if (pathname === '/countdown-state') {
    const s2 = loadSettings();
    const w  = s2.brb && s2.brb.widgets && s2.brb.widgets.countdown || {};
    json200(res, {
      running:    countdownState.running,
      remaining:  countdownState.remaining,
      totalMs:    countdownState.totalMs,
      label:      w.label      || 'Back in...',
      labelColor: w.labelColor || '#aaaaaa',
      timeColor:  w.timeColor  || '#ffffff',
      globalFont: (s2.brb && s2.brb.globalFont) || 'MMRock9',
      shadow:     w.shadow     || {}
    }); return;
  }



  // ── Fonts ────────────────────────────────────────────────────────────────
  if (pathname.startsWith('/font/')) {
    const fontName = pathname.replace('/font/', '');
    const localPath = path.join(LOCAL_FONT_DIR, fontName);
    // Try local fonts/ folder first, fall back to old hardcoded path
    if (fs.existsSync(localPath)) {
      serveFile(localPath, res);
    } else {
      serveFile(path.join(FONT_DIR_FALLBACK, fontName), res);
    }
    return;
  }

  // ── Song — returns { raw, title, artist } ────────────────────────────────
  if (pathname === '/song') {
    let raw = '';
    try { raw = fs.readFileSync(s.snipFile, 'utf8').trim(); } catch(e) {}
    const parsed = parseSong(raw, s.overrides);
    // Write override-filtered result to configured output path (or auto-place next to Snip.txt)
    try {
      const exportPath = s.songOutputPath || path.join(path.dirname(s.snipFile), 'current_spotify_song.txt');
      const exportText = (parsed.artist ? parsed.title + '  —  ' + parsed.artist : parsed.title) + '     ';
      fs.writeFileSync(exportPath, exportText, 'utf8');
    } catch(e) {}
    json200(res, parsed); return;
  }

  // ── Trigger — overlay polls this; /test increments it ───────────────────
  // Debug: shows exactly what raw text the server reads from Snip.txt
  if (pathname === '/rawsong') {
    let raw = '';
    try { raw = fs.readFileSync(s.snipFile, 'utf8').trim(); } catch(e) { raw = 'ERROR: ' + e.message; }
    json200(res, { raw, normalized: normalize(raw) }); return;
  }

  // Return full path of a file for the browse button
  if (pathname === '/resolve-path' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      const name = body.name || '';
      const hint = body.hint || '';
      // Search common locations
      const searchDirs = [
        hint,
        APP_DIR,
        require('os').homedir(),
        'C:/Users',
      ].filter(Boolean);
      json200(res, { name, hint });
    } catch(e) { json200(res, { error: e.message }); }
    return;
  }

  if (pathname === '/stream-notes' && req.method === 'GET') {
    json200(res, { notes: s.streamNotes || '' }); return;
  }
  if (pathname === '/stream-notes' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      s.streamNotes = body.notes || '';
      saveSettings(s);
      json200(res, { ok: true });
    } catch(e) { res.writeHead(400); res.end('Bad request'); }
    return;
  }


  // ── Start.gg API proxy ────────────────────────────────────────────────────────
  if (pathname === '/startgg' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      const token = body.token || s.startggToken || '';
      const query = body.query;
      const variables = body.variables || {};
      if (!token) { res.writeHead(400); res.end(JSON.stringify({error:'No API token'})); return; }
      if (!query)  { res.writeHead(400); res.end(JSON.stringify({error:'No query'})); return; }

      const https = require('https');
      const payload = JSON.stringify({ query, variables });
      const options = {
        hostname: 'api.start.gg',
        path: '/gql/alpha',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
          'Content-Length': Buffer.byteLength(payload)
        }
      };
      const apiReq = https.request(options, apiRes => {
        let data = '';
        apiRes.on('data', d => data += d);
        apiRes.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(data);
        });
      });
      apiReq.on('error', e => { res.writeHead(500); res.end(JSON.stringify({error:e.message})); });
      apiReq.write(payload);
      apiReq.end();
    } catch(e) { res.writeHead(400); res.end(JSON.stringify({error:e.message})); }
    return;
  }

  // Save start.gg token
  if (pathname === '/startgg-token' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      s.startggToken = body.token || '';
      saveSettings(s);
      json200(res, { ok: true });
    } catch(e) { res.writeHead(400); res.end('Bad request'); }
    return;
  }

  // Get start.gg token (masked)
  if (pathname === '/startgg-token' && req.method === 'GET') {
    json200(res, { token: s.startggToken || '', hasToken: !!(s.startggToken) });
    return;
  }


  // ── Chat Engagement ──────────────────────────────────────────────────────────

  if (pathname === '/youtube-auth') {
    if (!s.ytClientId) { res.writeHead(400); res.end('No Client ID saved'); return; }
    const params = new URLSearchParams({
      client_id: s.ytClientId, redirect_uri: 'http://127.0.0.1:7777/youtube-callback',
      response_type: 'code', scope: 'https://www.googleapis.com/auth/youtube',
      access_type: 'offline', prompt: 'consent'
    });
    res.writeHead(302, { 'Location': 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString() });
    res.end(); return;
  }

  if (pathname === '/youtube-callback') {
    const code = parsed.query.code;
    if (!code) { res.writeHead(400); res.end('Missing code'); return; }
    const https = require('https');
    const tokenBody = 'code=' + encodeURIComponent(code) +
      '&client_id=' + encodeURIComponent(s.ytClientId) +
      '&client_secret=' + encodeURIComponent(s.ytClientSecret) +
      '&redirect_uri=' + encodeURIComponent('http://127.0.0.1:7777/youtube-callback') +
      '&grant_type=authorization_code';
    const buf = Buffer.from(tokenBody);
    const tok = await new Promise(resolve => {
      const r = https.request({
        hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': buf.length }
      }, res2 => { let d = ''; res2.on('data', c => d += c); res2.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({}); } }); });
      r.on('error', () => resolve({})); r.write(buf); r.end();
    });
    if (!tok.access_token) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body style="background:#000;color:red;font-family:monospace;padding:20px;">YouTube auth failed: ' + JSON.stringify(tok) + '</body></html>');
      return;
    }
    s.ytAccessToken  = tok.access_token;
    s.ytRefreshToken = tok.refresh_token || s.ytRefreshToken;
    s.ytTokenExpiry  = Date.now() + (tok.expires_in - 60) * 1000;
    const chR = await ytApiReq('GET', '/youtube/v3/channels', { part: 'snippet', mine: 'true' }, null, s.ytAccessToken);
    if (chR.status === 200 && chR.body.items?.[0]) s.ytChannelName = chR.body.items[0].snippet.title;
    saveSettings(s);
    ytStartPolling();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<html><body style="background:#000;color:#3a9fc8;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center;"><div style="font-size:14px;letter-spacing:0.1em;margin-bottom:8px;">YOUTUBE CONNECTED</div><div style="font-size:9px;color:rgba(255,255,255,0.5);">' + (s.ytChannelName || 'your channel') + '</div><div style="font-size:8px;color:rgba(255,255,255,0.3);margin-top:12px;">You may close this window.</div></div></body></html>');
    return;
  }

  if (pathname === '/youtube-status') {
    json200(res, { connected: !!(s.ytAccessToken), channelName: s.ytChannelName || '', liveChatId: global.ytState?.liveChatId || '', polling: !!(global.ytState?.polling) });
    return;
  }

  if (pathname === '/youtube-disconnect' && req.method === 'POST') {
    s.ytAccessToken = ''; s.ytRefreshToken = ''; s.ytTokenExpiry = 0; s.ytChannelName = '';
    saveSettings(s);
    ytStopPolling();
    global.ytState.liveChatId = null; global.ytState.nextPageToken = null;
    json200(res, { ok: true }); return;
  }

  if (pathname === '/youtube-find-broadcast' && req.method === 'POST') {
    try {
      const token = await ytEnsureToken();
      if (!token) { json200(res, { error: 'Not connected to YouTube' }); return; }
      const r = await ytApiReq('GET', '/youtube/v3/liveBroadcasts', { part: 'snippet', broadcastStatus: 'active', mine: 'true' }, null, token);
      const bc = r.body?.items?.[0];
      if (!bc) { json200(res, { error: 'No active broadcast found. Start your stream first.' }); return; }
      const liveChatId = bc.snippet?.liveChatId;
      if (!liveChatId) { json200(res, { error: 'Broadcast has no live chat' }); return; }
      global.ytState.liveChatId = liveChatId;
      global.ytState.nextPageToken = null;
      ytStartPolling();
      json200(res, { ok: true, title: bc.snippet.title, liveChatId });
    } catch(e) { json200(res, { error: e.message }); }
    return;
  }

  if (pathname === '/poll-status') {
    const ps = global.pollState;
    const total = ps.votes['1'] + ps.votes['2'];
    json200(res, {
      active: ps.active, votes: ps.votes, total,
      p1Pct: total > 0 ? Math.round(ps.votes['1'] / total * 100) : 50,
      p2Pct: total > 0 ? Math.round(ps.votes['2'] / total * 100) : 50,
      p1: ps.p1, p2: ps.p2
    }); return;
  }

  if (pathname === '/poll-open' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      global.pollState.active = true;
      global.pollState.votes = { '1': 0, '2': 0 };
      global.pollState.voters = new Map();
      global.pollState.p1 = body.p1 || { name: '', imageUrl: '' };
      global.pollState.p2 = body.p2 || { name: '', imageUrl: '' };
      json200(res, { ok: true });
    } catch(e) { res.writeHead(400); res.end('Bad request'); }
    return;
  }

  if (pathname === '/poll-close' && req.method === 'POST') {
    global.pollState.active = false;
    json200(res, { ok: true, final: global.pollState.votes }); return;
  }

  if (pathname === '/bitly-count') {
    try {
      if (!s.bitlyToken || !s.bitlyLink) { json200(res, { count: 0, label: s.bitlyLabel || 'DOWNLOADS', error: 'Not configured' }); return; }
      const bitlink = s.bitlyLink.replace(/^https?:\/\//, '');
      const https = require('https');
      const r = await new Promise((resolve, reject) => {
        const req2 = https.request({
          hostname: 'api-ssl.bitly.com',
          path: '/v4/bitlinks/' + encodeURIComponent(bitlink) + '/clicks/summary',
          method: 'GET',
          headers: { 'Authorization': 'Bearer ' + s.bitlyToken }
        }, res2 => {
          let d = ''; res2.on('data', c => d += c);
          res2.on('end', () => { try { resolve({ status: res2.statusCode, body: JSON.parse(d) }); } catch(e) { resolve({ status: res2.statusCode, body: d }); } });
        });
        req2.on('error', reject); req2.end();
      });
      if (r.status === 200) {
        json200(res, { count: r.body.total_clicks || 0, label: s.bitlyLabel || 'DOWNLOADS' });
      } else {
        const msg = typeof r.body === 'object' ? (r.body.message || r.body.description || JSON.stringify(r.body)) : String(r.body);
        json200(res, { count: 0, label: s.bitlyLabel || 'DOWNLOADS', error: msg });
      }
    } catch(e) { json200(res, { count: 0, label: s.bitlyLabel || 'DOWNLOADS', error: e.message }); }
    return;
  }

  if (pathname === '/save-commands' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      s.chatCommands = Array.isArray(body) ? body : [];
      saveSettings(s);
      json200(res, { ok: true });
    } catch(e) { res.writeHead(400); res.end('Bad request'); }
    return;
  }

  if (pathname === '/startgg-characters') {
    try {
      const token = s.startggToken;
      const tourneyUrl = s.startggTourneyUrl || '';
      const slug = tourneyUrl.replace('https://www.start.gg/tournament/', '').replace('https://start.gg/tournament/', '').split('/')[0];
      if (!token || !slug) { json200(res, { characters: [] }); return; }
      const https = require('https');
      const payload = JSON.stringify({ query: `query TournamentChars($slug:String!){tournament(slug:$slug){videogames{id name characters{id name images{url}}}}}`, variables: { slug } });
      const buf = Buffer.from(payload);
      const apiRes = await new Promise((resolve, reject) => {
        const r = https.request({
          hostname: 'api.start.gg', path: '/gql/alpha', method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'Content-Length': buf.length }
        }, res2 => { let d = ''; res2.on('data', c => d += c); res2.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({}); } }); });
        r.on('error', reject); r.write(buf); r.end();
      });
      const characters = [];
      for (const game of (apiRes.data?.tournament?.videogames || [])) {
        for (const char of (game.characters || [])) {
          characters.push({ id: char.id, name: char.name, imageUrl: char.images?.[0]?.url || '', game: game.name });
        }
      }
      json200(res, { characters });
    } catch(e) { json200(res, { characters: [], error: e.message }); }
    return;
  }

  if (pathname === '/startgg-player-avatars' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      const { p1Name, p2Name } = body;
      const token = s.startggToken;
      const tourneyUrl = s.startggTourneyUrl || '';
      const slug = tourneyUrl.replace('https://www.start.gg/tournament/', '').replace('https://start.gg/tournament/', '').split('/')[0];
      if (!token || !slug) { json200(res, { p1: '', p2: '' }); return; }
      const https = require('https');
      async function fetchAvatar(name) {
        const payload = JSON.stringify({ query: `query PA($slug:String!,$name:String!){tournament(slug:$slug){participants(query:{filter:{search:{fieldsToSearch:["gamerTag"],searchString:$name}},perPage:3}){nodes{gamerTag player{user{images{url type}}}}}}}`, variables: { slug, name } });
        const buf = Buffer.from(payload);
        const r = await new Promise((resolve, reject) => {
          const req2 = https.request({ hostname: 'api.start.gg', path: '/gql/alpha', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'Content-Length': buf.length }
          }, res2 => { let d = ''; res2.on('data', c => d += c); res2.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({}); } }); });
          r.on('error', () => resolve({})); r.write(buf); r.end();
        });
        const nodes = r.data?.tournament?.participants?.nodes || [];
        const match = nodes.find(n => n.gamerTag?.toLowerCase() === name.toLowerCase()) || nodes[0];
        const images = match?.player?.user?.images || [];
        const profile = images.find(i => i.type === 'profile') || images[0];
        return profile?.url || '';
      }
      const [p1Url, p2Url] = await Promise.all([fetchAvatar(p1Name || ''), fetchAvatar(p2Name || '')]);
      json200(res, { p1: p1Url, p2: p2Url });
    } catch(e) { json200(res, { p1: '', p2: '' }); }
    return;
  }

  // ── End Chat Engagement ───────────────────────────────────────────────────────

  // ── Bluesky ─────────────────────────────────────────────────────────────────

  async function bskyReq(hostname, path, method, headers, body) {
    const https = require('https');
    return new Promise((resolve, reject) => {
      const buf = body instanceof Buffer ? body
                : body ? Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
                : null;
      const opts = { hostname, path, method: method || 'GET',
        headers: Object.assign({}, headers, buf ? { 'Content-Length': buf.length } : {}) };
      const r = https.request(opts, res => {
        const chunks = [];
        res.on('data', d => chunks.push(d));
        res.on('end', () => {
          const txt = Buffer.concat(chunks).toString();
          try { resolve({ status: res.statusCode, body: JSON.parse(txt) }); }
          catch(e) { resolve({ status: res.statusCode, body: txt }); }
        });
      });
      r.on('error', reject);
      if (buf) r.write(buf);
      r.end();
    });
  }


  // ── Bluesky background job tracker ──────────────────────────────────────────
  if (!global.bskyJobs) global.bskyJobs = new Map();
  const bskyJobs = global.bskyJobs;

  async function bskyRunUpload(jobId, params) {
    const upd = u => { const c = bskyJobs.get(jobId)||{}; bskyJobs.set(jobId, Object.assign({},c,u)); };
    const isCancelled = () => !!(bskyJobs.get(jobId) || {}).cancelled;
    const { filePath, text, altText } = params;
    try {
      // Only re-login if token is missing — avoid burning rate limits on every post
      upd({ stage:'Preparing...', progress:5 });
      // Helper to re-login when token is expired
      async function relogin() {
        if (!s.bskyHandleSaved || !s.bskyAppPassword) return false;
        const lR = await bskyReq('bsky.social','/xrpc/com.atproto.server.createSession','POST',
          {'Content-Type':'application/json'},{identifier:s.bskyHandleSaved,password:s.bskyAppPassword});
        if (lR.status!==200 || !lR.body.accessJwt) return false;
        s.bskyAccessJwt=lR.body.accessJwt; s.bskyRefreshJwt=lR.body.refreshJwt;
        s.bskyDid=lR.body.did; s.bskyHandle=lR.body.handle;
        try {
          const ps=lR.body.didDoc?.service?.find(sv=>sv.id==='#atproto_pds');
          if (ps?.serviceEndpoint) { s.bskyPdsHost=new URL(ps.serviceEndpoint).hostname; s.bskyPdsDid='did:web:'+s.bskyPdsHost; }
          else {
            const dR=await bskyReq('plc.directory','/'+encodeURIComponent(s.bskyDid),'GET',{},null);
            if (dR.status===200) { const ps2=dR.body?.service?.find(sv=>sv.id==='#atproto_pds');
              if (ps2?.serviceEndpoint){s.bskyPdsHost=new URL(ps2.serviceEndpoint).hostname;s.bskyPdsDid='did:web:'+s.bskyPdsHost;} }
          }
        } catch(e){}
        saveSettings(s);
        return true;
      }
      upd({ stage:'Authenticated', progress:8 });
      let token=s.bskyAccessJwt; const did=s.bskyDid;
      if (!token||!did) throw new Error('Not logged in to Bluesky');
      const fs=require('fs'), pathMod=require('path');
      if (!fs.existsSync(filePath)) throw new Error('File not found: '+filePath);
      const videoData=fs.readFileSync(filePath);
      const filename=pathMod.basename(filePath);
      upd({ stage:'Getting upload token...', progress:12 });
      const pdsHost=s.bskyPdsHost||'bsky.social';
      const svcAud='did:web:'+pdsHost;
      const expiry=Math.floor(Date.now()/1000)+60*30;
      let saR=await bskyReq('bsky.social',
        '/xrpc/com.atproto.server.getServiceAuth?aud='+encodeURIComponent(svcAud)+'&lxm=com.atproto.repo.uploadBlob&exp='+expiry,
        'GET',{'Authorization':'Bearer '+token},null);
      if (saR.status!==200) {
        upd({ stage:'Token expired, re-logging in...', progress:13 });
        const ok=await relogin();
        if (!ok) throw new Error('Could not get video token: '+JSON.stringify(saR.body));
        token=s.bskyAccessJwt;
        saR=await bskyReq('bsky.social',
          '/xrpc/com.atproto.server.getServiceAuth?aud='+encodeURIComponent(svcAud)+'&lxm=com.atproto.repo.uploadBlob&exp='+expiry,
          'GET',{'Authorization':'Bearer '+token},null);
        if (saR.status!==200) throw new Error('Could not get video token: '+JSON.stringify(saR.body));
      }
      const videoToken=saR.body.token;
      if (isCancelled()) return;
      upd({ stage:'Uploading video...', progress:18 });
      // Simulate upload progress while waiting for HTTP response
      let simP=18;
      const simT=setInterval(()=>{ simP=Math.min(46,simP+2); upd({progress:simP}); },1500);
      const uploadName=Math.floor(Math.random()*1e15).toString()+pathMod.extname(filename);
      const uploadPath='/xrpc/app.bsky.video.uploadVideo?did='+encodeURIComponent(did)+'&name='+encodeURIComponent(uploadName);
      const upR=await bskyReq('video.bsky.app',uploadPath,'POST',
        {'Authorization':'Bearer '+videoToken,'Content-Type':'video/mp4','Content-Length':videoData.length},videoData);
      clearInterval(simT);
      if (upR.status===401 || (upR.status!==200 && typeof upR.body==='object' && upR.body.error && upR.body.error.includes('token'))) {
        // Token expired — re-login once and retry
        upd({ stage:'Token expired, re-logging in...', progress:20 });
        const ok = await relogin();
        if (!ok) throw new Error('Session expired — click Login to Bluesky');
        token = s.bskyAccessJwt;
        const upR2=await bskyReq('video.bsky.app',uploadPath,'POST',
          {'Authorization':'Bearer '+token,'Content-Type':'video/mp4','Content-Length':videoData.length},videoData);
        if (upR2.status!==200) {
          const m2=typeof upR2.body==='object'?(upR2.body.error||JSON.stringify(upR2.body)):String(upR2.body);
          throw new Error('Upload failed after retry: '+m2);
        }
        upR.body = upR2.body; // use retry result
      } else if (upR.status!==200) {
        const isAlreadyExists = typeof upR.body==='object' && upR.body.error==='already_exists';
        const existingJobId = isAlreadyExists && upR.body.jobId;
        if (!existingJobId) {
          const m=typeof upR.body==='object'?(upR.body.error||JSON.stringify(upR.body)):String(upR.body);
          throw new Error('Upload failed: '+m);
        }
        upd({ stage:'Resuming existing job...', progress:50 });
        upR.body = { jobId: existingJobId };
      }
      if (isCancelled()) return;
      upd({ stage:'Processing video...', progress:50 });
      const vid2JobId=upR.body.jobId;
      let blob=null;
      for (let i=0;i<30;i++) {
        if (isCancelled()) return;
        await new Promise(r=>setTimeout(r,2000));
        if (isCancelled()) return;
        upd({ stage:'Processing... ('+(i+1)+'/30)', progress:Math.min(88,50+(i+1)*2) });
        const pR=await bskyReq('video.bsky.app','/xrpc/app.bsky.video.getJobStatus?jobId='+encodeURIComponent(vid2JobId),'GET',{'Authorization':'Bearer '+videoToken});
        const state=pR.body.jobStatus?.state;
        if (state==='JOB_STATE_COMPLETED'){blob=pR.body.jobStatus.blob;break;}
        if (state==='JOB_STATE_FAILED') throw new Error('Video processing failed');
      }
      if (!blob) throw new Error('Video processing timed out');
      if (isCancelled()) return;
      upd({ stage:'Creating post...', progress:92 });
      const postR=await bskyReq('bsky.social','/xrpc/com.atproto.repo.createRecord','POST',
        {'Authorization':'Bearer '+token,'Content-Type':'application/json'},
        {repo:did,collection:'app.bsky.feed.post',record:{
          $type:'app.bsky.feed.post',text:text||'',
          embed:{$type:'app.bsky.embed.video',video:blob,alt:altText||''},
          createdAt:new Date().toISOString()
        }});
      if (postR.status!==200) throw new Error('Post failed: '+JSON.stringify(postR.body));
      upd({ stage:'Posted!', progress:100, done:true, uri:postR.body.uri });
      setTimeout(()=>bskyJobs.delete(jobId), 5*60*1000);
    } catch(e) {
      upd({ error:e.message, done:true, progress:0 });
    }
  }
  async function bskyRunImagePost(jobId, params) {
    const upd = u => { const c = bskyJobs.get(jobId)||{}; bskyJobs.set(jobId, Object.assign({},c,u)); };
    const isCancelled = () => !!(bskyJobs.get(jobId) || {}).cancelled;
    const { imageBase64, imageMimeType, text, altText } = params;
    try {
      upd({ stage: 'Preparing...', progress: 5 });
      const token = s.bskyAccessJwt, did = s.bskyDid;
      if (!token || !did) throw new Error('Not logged in to Bluesky');
      if (isCancelled()) return;
      upd({ stage: 'Uploading image...', progress: 15 });
      const imageData = Buffer.from(imageBase64, 'base64');
      const pdsHost = s.bskyPdsHost || 'bsky.social';
      let simP = 15;
      const simT = setInterval(() => { simP = Math.min(72, simP + 8); upd({ progress: simP }); }, 400);
      const blobR = await bskyReq(pdsHost, '/xrpc/com.atproto.repo.uploadBlob', 'POST',
        { 'Authorization': 'Bearer ' + token, 'Content-Type': imageMimeType || 'image/jpeg' }, imageData);
      clearInterval(simT);
      if (blobR.status === 401) {
        upd({ stage: 'Token expired, re-logging in...', progress: 40 });
        if (!s.bskyHandleSaved || !s.bskyAppPassword) throw new Error('Session expired — click Login to Bluesky');
        const lR = await bskyReq('bsky.social', '/xrpc/com.atproto.server.createSession', 'POST',
          { 'Content-Type': 'application/json' }, { identifier: s.bskyHandleSaved, password: s.bskyAppPassword });
        if (lR.status !== 200 || !lR.body.accessJwt) throw new Error('Session expired — click Login to Bluesky');
        s.bskyAccessJwt = lR.body.accessJwt; saveSettings(s);
        const blobR2 = await bskyReq(pdsHost, '/xrpc/com.atproto.repo.uploadBlob', 'POST',
          { 'Authorization': 'Bearer ' + s.bskyAccessJwt, 'Content-Type': imageMimeType || 'image/jpeg' }, imageData);
        if (blobR2.status !== 200) throw new Error('Image upload failed after retry: ' + JSON.stringify(blobR2.body));
        blobR.body = blobR2.body;
      } else if (blobR.status !== 200) {
        const m = typeof blobR.body === 'object' ? (blobR.body.error || JSON.stringify(blobR.body)) : String(blobR.body);
        throw new Error('Image upload failed: ' + m);
      }
      if (isCancelled()) return;
      upd({ stage: 'Creating post...', progress: 88 });
      const blob = blobR.body.blob;
      const postR = await bskyReq('bsky.social', '/xrpc/com.atproto.repo.createRecord', 'POST',
        { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        { repo: did, collection: 'app.bsky.feed.post', record: {
          $type: 'app.bsky.feed.post',
          text: text || '',
          embed: { $type: 'app.bsky.embed.images', images: [{ image: blob, alt: altText || '' }] },
          createdAt: new Date().toISOString()
        }});
      if (postR.status !== 200) throw new Error('Post failed: ' + JSON.stringify(postR.body));
      upd({ stage: 'Posted!', progress: 100, done: true, uri: postR.body.uri });
      setTimeout(() => bskyJobs.delete(jobId), 5 * 60 * 1000);
    } catch(e) {
      upd({ error: e.message, done: true, progress: 0 });
    }
  }

  // ── End Bluesky job system ───────────────────────────────────────────────────

  if (pathname === '/bluesky-login' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      const r = await bskyReq('bsky.social', '/xrpc/com.atproto.server.createSession', 'POST',
        { 'Content-Type': 'application/json' },
        { identifier: body.handle, password: body.password }
      );
      if (r.status !== 200) { res.writeHead(401); res.end(JSON.stringify({ error: r.body.message || 'Login failed' })); return; }
      s.bskyDid = r.body.did;
      s.bskyHandle = r.body.handle;
      s.bskyAccessJwt = r.body.accessJwt;
      s.bskyRefreshJwt = r.body.refreshJwt;
      // Resolve PDS DID from DID document
      try {
        const did = r.body.did;
        let pdsHost = null;
        // Try didDoc from login response first
        const pdsSvc = r.body.didDoc?.service?.find(sv => sv.id === '#atproto_pds');
        if (pdsSvc?.serviceEndpoint) {
          pdsHost = new URL(pdsSvc.serviceEndpoint).hostname;
        } else {
          // Resolve via PLC directory
          const didR = await bskyReq('plc.directory', '/' + encodeURIComponent(did), 'GET', {}, null);
          if (didR.status === 200) {
            const plcSvc = didR.body?.service?.find(sv => sv.id === '#atproto_pds');
            if (plcSvc?.serviceEndpoint) pdsHost = new URL(plcSvc.serviceEndpoint).hostname;
          }
        }
        if (pdsHost) {
          s.bskyPdsDid  = 'did:web:' + pdsHost;
          s.bskyPdsHost = pdsHost;
        }
      } catch(e) { console.error('PDS resolve error:', e.message); }
      saveSettings(s);
      json200(res, { ok: true, handle: r.body.handle });
    } catch(e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    return;
  }


  if (pathname === '/bluesky-profile' && req.method === 'GET') {
    try {
      let token = s.bskyAccessJwt, did = s.bskyDid;
      if (!token || !did) { json200(res, {}); return; }
      const r = await bskyReq('bsky.social',
        '/xrpc/app.bsky.actor.getProfile?actor=' + encodeURIComponent(did), 'GET',
        { 'Authorization': 'Bearer ' + token }
      );
      if (r.status !== 200) { json200(res, {}); return; }
      json200(res, {
        displayName: r.body.displayName || '',
        handle: r.body.handle || '',
        avatar: r.body.avatar || ''
      });
    } catch(e) { json200(res, {}); }
    return;
  }

  if (pathname === '/bluesky-status' && req.method === 'GET') {
    json200(res, { loggedIn: !!(s.bskyAccessJwt), handle: s.bskyHandle || '' });
    return;
  }

  if (pathname === '/bluesky-post' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      const jobId = Date.now().toString(36) + Math.random().toString(36).slice(2,7);
      bskyJobs.set(jobId, { stage:'Starting...', progress:0, done:false });
      bskyRunUpload(jobId, body).catch(e => {
        bskyJobs.set(jobId, { error:e.message, done:true, progress:0 });
      });
      json200(res, { jobId });
    } catch(e) { res.writeHead(500); res.end(JSON.stringify({ error:e.message })); }
    return;
  }

  if (pathname === '/bluesky-post-status' && req.method === 'GET') {
    const qJobId = new URLSearchParams(req.url.includes('?') ? req.url.split('?')[1] : '').get('jobId');
    const status = bskyJobs.get(qJobId);
    json200(res, status || { error:'Job not found', done:true });
    return;
  }

  if (pathname === '/bluesky-cancel' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      const { jobId } = body;
      if (jobId && bskyJobs.has(jobId)) {
        const cur = bskyJobs.get(jobId) || {};
        bskyJobs.set(jobId, Object.assign({}, cur, { cancelled: true, done: true, error: 'Upload cancelled' }));
      }
      json200(res, { ok: true });
    } catch(e) { res.writeHead(400); res.end('Bad request'); }
    return;
  }

  if (pathname === '/bluesky-post-image' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      const jobId = Date.now().toString(36) + Math.random().toString(36).slice(2,7);
      bskyJobs.set(jobId, { stage: 'Starting...', progress: 0, done: false });
      bskyRunImagePost(jobId, body).catch(e => {
        bskyJobs.set(jobId, { error: e.message, done: true, progress: 0 });
      });
      json200(res, { jobId });
    } catch(e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  if (pathname === '/replay-files') {
    try {
      const params = new URLSearchParams(req.url.includes('?') ? req.url.split('?')[1] : '');
      const qFolder = params.get('folder');
      const folder = (qFolder || s.bskyReplaysFolder || '').trim();
      const filterEnabled = params.get('filterEnabled') === '1';
      const filterKeyword = (params.get('filter') || '').trim().toLowerCase();
      const fs = require('fs'), pathMod = require('path');
      if (!folder) { json200(res, { error: 'No folder specified' }); return; }
      if (!fs.existsSync(folder)) { json200(res, { error: 'Folder not found: ' + folder }); return; }
      const files = fs.readdirSync(folder)
        .filter(f => {
          if (!f.toLowerCase().endsWith('.mp4')) return false;
          if (filterEnabled && filterKeyword) return f.toLowerCase().startsWith(filterKeyword);
          return true;
        })
        .map(f => {
          const fp = pathMod.join(folder, f);
          const stat = fs.statSync(fp);
          return { name: f, path: fp, mtime: stat.mtimeMs, size: Math.round(stat.size / 1024 / 1024 * 10) / 10 };
        })
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, 30);
      json200(res, files);
    } catch(e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  if (pathname === '/replay-stream') {
    try {
      const filePath = new URLSearchParams(req.url.includes('?') ? req.url.split('?')[1] : '').get('path');
      const fs = require('fs');
      if (!filePath || !fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
      const stat = fs.statSync(filePath);
      const range = req.headers.range;
      if (range) {
        const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
        const start = parseInt(startStr, 10);
        const end = endStr ? parseInt(endStr, 10) : stat.size - 1;
        res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Content-Type': 'video/mp4' });
        fs.createReadStream(filePath, { start, end }).pipe(res);
      } else {
        res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes' });
        fs.createReadStream(filePath).pipe(res);
      }
    } catch(e) { res.writeHead(500); res.end(e.message); }
    return;
  }

  // ── End Bluesky ─────────────────────────────────────────────────────────────

  // ── Discord IPC ──────────────────────────────────────────────────────────────
  if (!global.discordState) global.discordState = {
    status: 'disconnected', user: null, channel: null,
    guildName: null, guildId: null, speaking: [], socket: null,
    buffer: Buffer.alloc(0), clientId: null, error: null
  };
  const ds = global.discordState;

  function discordFrame(opcode, payload) {
    if (!ds.socket) return;
    const data = Buffer.from(JSON.stringify(payload), 'utf8');
    const frame = Buffer.alloc(8 + data.length);
    frame.writeUInt32LE(opcode, 0);
    frame.writeUInt32LE(data.length, 4);
    data.copy(frame, 8);
    try { ds.socket.write(frame); } catch(e) {}
  }

  function discordCmd(cmd, args, evt) {
    const nonce = Math.random().toString(36).slice(2, 9);
    const msg = { cmd, nonce };
    if (args !== undefined) msg.args = args;
    if (evt) msg.evt = evt;
    discordFrame(1, msg);
  }

  function discordOnData(chunk) {
    ds.buffer = Buffer.concat([ds.buffer, chunk]);
    while (ds.buffer.length >= 8) {
      const op  = ds.buffer.readUInt32LE(0);
      const len = ds.buffer.readUInt32LE(4);
      if (ds.buffer.length < 8 + len) break;
      let payload;
      try { payload = JSON.parse(ds.buffer.slice(8, 8 + len).toString('utf8')); } catch(e) {}
      ds.buffer = ds.buffer.slice(8 + len);
      if (payload) discordHandleMsg(op, payload);
    }
  }

  function discordHandleMsg(op, msg) {
    if (op !== 1) return;
    const { cmd, evt, data } = msg;

    if (evt === 'READY') {
      ds.status = 'connected';
      if (s.discordAccessToken && s.discordTokenExpiry && s.discordTokenExpiry > Date.now() + 5000) {
        discordCmd('AUTHENTICATE', { access_token: s.discordAccessToken });
      } else if (s.discordRefreshToken) {
        discordDoRefresh();
      } else {
        discordCmd('AUTHORIZE', { client_id: ds.clientId, scopes: ['rpc', 'rpc.voice.read', 'identify'], prompt: 'consent' });
      }
    }

    if (cmd === 'AUTHORIZE' && data?.code) {
      discordExchangeCode(data.code);
    }

    if (cmd === 'AUTHENTICATE') {
      if (evt === 'ERROR') {
        s.discordAccessToken = null; s.discordRefreshToken = null; s.discordTokenExpiry = 0;
        saveSettings(s);
        discordCmd('AUTHORIZE', { client_id: ds.clientId, scopes: ['rpc', 'rpc.voice.read', 'identify'], prompt: 'consent' });
        return;
      }
      if (data?.user) {
        ds.status = 'authenticated';
        ds.user = { id: data.user.id, username: data.user.username, avatar: data.user.avatar };
        discordCmd('GET_SELECTED_VOICE_CHANNEL', {});
        discordCmd('SUBSCRIBE', {}, 'VOICE_CHANNEL_SELECT');
      }
    }

    if (cmd === 'GET_SELECTED_VOICE_CHANNEL') {
      if (data?.id) {
        discordSetChannel(data);
      } else {
        ds.channel = null; ds.guildName = null; ds.speaking = [];
      }
    }

    if (evt === 'VOICE_CHANNEL_SELECT') {
      if (data?.channel_id) {
        discordCmd('GET_SELECTED_VOICE_CHANNEL', {});
      } else {
        ds.channel = null; ds.guildName = null; ds.speaking = [];
      }
    }

    if (cmd === 'GET_GUILD' && data?.name) {
      ds.guildName = data.name;
    }

    if (evt === 'SPEAKING_START' && data?.user_id) {
      if (!ds.speaking.includes(data.user_id)) ds.speaking.push(data.user_id);
    }
    if (evt === 'SPEAKING_STOP' && data?.user_id) {
      ds.speaking = ds.speaking.filter(id => id !== data.user_id);
    }
    if ((evt === 'VOICE_STATE_CREATE' || evt === 'VOICE_STATE_DELETE' || evt === 'VOICE_STATE_UPDATE') && ds.channel) {
      discordCmd('GET_SELECTED_VOICE_CHANNEL', {});
    }
  }

  function discordSetChannel(data) {
    if (data.guild_id) ds.guildId = data.guild_id;
    const guildId = ds.guildId;
    ds.channel = {
      id: data.id, name: data.name,
      members: (data.voice_states || []).map(vs => ({
        id:             vs.user?.id,
        username:       vs.user?.username || vs.nick || '?',
        accountUsername: vs.user?.username || '?',
        nick:           vs.nick,
        avatar:         (vs.user?.id && vs.user?.avatar)
          ? 'https://cdn.discordapp.com/avatars/' + vs.user.id + '/' + vs.user.avatar + '.png?size=256'
          : null,
        serverAvatar:   (vs.avatar && vs.user?.id && guildId)
          ? 'https://cdn.discordapp.com/guilds/' + guildId + '/users/' + vs.user.id + '/avatars/' + vs.avatar + '.png?size=256'
          : null,
        selfMute: !!(vs.voice_state?.self_mute || vs.mute),
        selfDeaf: !!(vs.voice_state?.self_deaf  || vs.deaf),
      }))
    };
    ds.speaking = [];
    if (data.guild_id) discordCmd('GET_GUILD', { guild_id: data.guild_id });
    discordCmd('SUBSCRIBE', { channel_id: data.id }, 'SPEAKING_START');
    discordCmd('SUBSCRIBE', { channel_id: data.id }, 'SPEAKING_STOP');
    discordCmd('SUBSCRIBE', { channel_id: data.id }, 'VOICE_STATE_CREATE');
    discordCmd('SUBSCRIBE', { channel_id: data.id }, 'VOICE_STATE_DELETE');
    discordCmd('SUBSCRIBE', { channel_id: data.id }, 'VOICE_STATE_UPDATE');
  }

  function discordHttpPost(path, body, callback) {
    const https = require('https');
    const buf = Buffer.from(body, 'utf8');
    const req = https.request({
      hostname: 'discord.com', path, method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': buf.length }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { callback(null, JSON.parse(d)); } catch(e) { callback(e); } });
    });
    req.on('error', e => callback(e));
    req.write(buf); req.end();
  }

  function discordExchangeCode(code) {
    const cid  = ds.clientId || s.discordClientId || '';
    const csec = s.discordClientSecret || '';
    if (!csec) { ds.error = 'No client secret saved'; ds.status = 'error'; return; }
    const body = 'client_id='     + encodeURIComponent(cid)  +
                 '&client_secret='+ encodeURIComponent(csec) +
                 '&grant_type=authorization_code'             +
                 '&code='         + encodeURIComponent(code) +
                 '&redirect_uri=' + encodeURIComponent('http://127.0.0.1:7777/discord-auth');
    discordHttpPost('/api/v10/oauth2/token', body, (err, r) => {
      if (err || !r?.access_token) {
        ds.error = err ? err.message : ('Auth failed: ' + JSON.stringify(r));
        ds.status = 'error'; return;
      }
      s.discordAccessToken  = r.access_token;
      s.discordRefreshToken = r.refresh_token;
      s.discordTokenExpiry  = Date.now() + (r.expires_in - 60) * 1000;
      saveSettings(s);
      discordCmd('AUTHENTICATE', { access_token: r.access_token });
    });
  }

  function discordDoRefresh() {
    if (!s.discordRefreshToken) {
      discordCmd('AUTHORIZE', { client_id: ds.clientId, scopes: ['rpc', 'rpc.voice.read', 'identify'], prompt: 'consent' });
      return;
    }
    const cid  = ds.clientId || s.discordClientId || '';
    const csec = s.discordClientSecret || '';
    const body = 'client_id='      + encodeURIComponent(cid)                  +
                 '&client_secret=' + encodeURIComponent(csec)                 +
                 '&grant_type=refresh_token'                                   +
                 '&refresh_token=' + encodeURIComponent(s.discordRefreshToken);
    discordHttpPost('/api/v10/oauth2/token', body, (err, r) => {
      if (err || !r?.access_token) {
        s.discordRefreshToken = null; saveSettings(s);
        discordCmd('AUTHORIZE', { client_id: ds.clientId, scopes: ['rpc', 'rpc.voice.read', 'identify'], prompt: 'consent' });
        return;
      }
      s.discordAccessToken  = r.access_token;
      s.discordRefreshToken = r.refresh_token;
      s.discordTokenExpiry  = Date.now() + (r.expires_in - 60) * 1000;
      saveSettings(s);
      discordCmd('AUTHENTICATE', { access_token: r.access_token });
    });
  }

  function discordConnect(clientId) {
    if (ds.socket) { try { ds.socket.destroy(); } catch(e) {} ds.socket = null; }
    ds.status = 'connecting'; ds.error = null;
    ds.user = null; ds.channel = null; ds.guildName = null;
    ds.speaking = []; ds.buffer = Buffer.alloc(0); ds.clientId = clientId;
    const net = require('net');
    let n = 0;
    function tryPipe() {
      if (n >= 10) { ds.status = 'error'; ds.error = 'Discord is not running'; return; }
      const sock = net.createConnection('\\\\.\\pipe\\discord-ipc-' + n);
      sock.once('connect', () => {
        ds.socket = sock;
        discordFrame(0, { v: 1, client_id: clientId });
      });
      sock.on('data', discordOnData);
      sock.on('error', () => { n++; tryPipe(); });
      sock.on('close', () => {
        if (ds.socket === sock) {
          ds.socket = null; ds.status = 'disconnected';
          ds.user = null; ds.channel = null;
        }
      });
    }
    tryPipe();
  }

  if (pathname === '/discord-connect' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      const clientId = (body.clientId || s.discordClientId || '').trim();
      if (!clientId) { json200(res, { error: 'No client ID provided' }); return; }
      if (body.clientId)     s.discordClientId     = body.clientId;
      if (body.clientSecret) s.discordClientSecret = body.clientSecret;
      saveSettings(s);
      discordConnect(clientId);
      json200(res, { ok: true });
    } catch(e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  if (pathname === '/discord-status' && req.method === 'GET') {
    json200(res, { status: ds.status, error: ds.error, user: ds.user,
      channel: ds.channel ? { id: ds.channel.id, name: ds.channel.name, members: ds.channel.members || [] } : null,
      guildName: ds.guildName });
    return;
  }

  if (pathname === '/discord-overlay-data' && req.method === 'GET') {
    const _gf = (s.brb && s.brb.globalFont) || 'MMRock9';
    json200(res, { status: ds.status, user: ds.user,
      channel: ds.channel, guildName: ds.guildName, speaking: ds.speaking,
      overlaySettings: s.discordOverlay || {}, globalFont: _gf, globalFontPath: findFontPath(_gf) });
    return;
  }

  if (pathname === '/discord-overlay-2-data' && req.method === 'GET') {
    const _gf = (s.brb && s.brb.globalFont) || 'MMRock9';
    json200(res, { status: ds.status, user: ds.user,
      channel: ds.channel, guildName: ds.guildName, speaking: ds.speaking,
      overlaySettings: s.discordOverlay2 || {}, globalFont: _gf, globalFontPath: findFontPath(_gf) });
    return;
  }

  if (pathname === '/discord-overlay-solo-data' && req.method === 'GET') {
    const slot = parsed.query.slot || 's1';
    const groupCfg = s.discordOverlay || {};
    const overlayCfg = Object.assign({}, groupCfg, s.discordOverlaySolo || {});
    const memberId = groupCfg[slot === 's1' ? 's1Member' : 's2Member'];
    const allMembers = ds.channel ? (ds.channel.members || []) : [];
    const filteredMembers = memberId ? allMembers.filter(m => m.id === memberId) : [];
    const filteredChannel = ds.channel
      ? Object.assign({}, ds.channel, { members: filteredMembers })
      : null;
    const _gf = (s.brb && s.brb.globalFont) || 'MMRock9';
    json200(res, { status: ds.status, user: ds.user,
      channel: filteredChannel, guildName: ds.guildName, speaking: ds.speaking,
      overlaySettings: overlayCfg, globalFont: _gf, globalFontPath: findFontPath(_gf) });
    return;
  }

  if (pathname === '/discord-auth') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<html><body style="background:#000;color:#5865f2;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div>Discord authorization complete. You may close this window.</div></body></html>');
    return;
  }
  // ── End Discord IPC ──────────────────────────────────────────────────────────


  if (pathname === '/gettrigger') {
    json200(res, { trigger: triggerCount }); return;
  }

  if (pathname === '/test') {
    triggerCount++;
    json200(res, { ok: true, trigger: triggerCount }); return;
  }

  // ── Settings ─────────────────────────────────────────────────────────────
  if (pathname === '/settings') {
    json200(res, Object.assign({}, s, {
      _activeProfile: activeProfileId,
      _profileList:   _profileListArr()
    }));
    return;
  }

  // List available fonts from local fonts/ folder (recursive scan)
  if (pathname === '/fonts-list') {
    let fonts = [];
    try {
      (function walk(dir, rel) {
        fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
          if (e.isDirectory()) { walk(path.join(dir, e.name), rel ? rel+'/'+e.name : e.name); }
          else {
            const ext = path.extname(e.name).toLowerCase();
            if (_FONT_EXTS.has(ext)) {
              const base = path.basename(e.name, ext);
              const fontPath = rel ? rel+'/'+e.name : e.name;
              fonts.push({ name: base, label: base === 'MMRock9' ? 'MMRock9 (pixel)' : base, path: fontPath });
            }
          }
        });
      })(LOCAL_FONT_DIR, '');
    } catch(e) {}
    fonts.sort((a, b) => a.name === 'MMRock9' ? -1 : b.name === 'MMRock9' ? 1 : a.name.localeCompare(b.name));
    fonts.push({ name: 'monospace',  label: 'Monospace',  path: null });
    fonts.push({ name: 'sans-serif', label: 'Sans-serif', path: null });
    json200(res, { fonts }); return;
  }

  // Returns current global font name + its resolved file path (for overlays)
  if (pathname === '/font-info') {
    const gf = (s.brb && s.brb.globalFont) || 'MMRock9';
    json200(res, { name: gf, path: findFontPath(gf) }); return;
  }

  // ── Profile management ────────────────────────────────────────────────────
  if (pathname === '/profiles') {
    json200(res, { activeProfile: activeProfileId, list: _profileListArr() }); return;
  }

  if (pathname === '/switch-profile' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      const newId = body.id;
      if (!profileIndex.profiles || !profileIndex.profiles[newId]) { res.writeHead(404); res.end('Profile not found'); return; }
      _switchProfile(s, newId);
      json200(res, Object.assign({}, s, { ok: true, _activeProfile: activeProfileId, _profileList: _profileListArr() })); return;
    } catch(e) { res.writeHead(400); res.end('Bad request'); return; }
  }

  if (pathname === '/create-profile' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      const name = (body.name || 'New Profile').trim();
      const newId = _uniqueId(name);
      // Build new profile file from source or clean defaults
      let source;
      if (body.duplicateFrom && profileIndex.profiles && profileIndex.profiles[body.duplicateFrom]) {
        source = _loadProfileRaw(body.duplicateFrom);
      } else {
        source = JSON.parse(JSON.stringify(DEFAULTS));
      }
      fs.writeFileSync(_profilePath(newId), JSON.stringify(source, null, 2), 'utf8');
      profileIndex.profiles[newId] = { name };
      _saveIndex();
      json200(res, { ok: true, id: newId, list: _profileListArr() }); return;
    } catch(e) { res.writeHead(400); res.end('Bad request'); return; }
  }

  if (pathname === '/rename-profile' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      const oldId = body.id;
      if (!profileIndex.profiles || !profileIndex.profiles[oldId]) { res.writeHead(404); res.end('Not found'); return; }
      const newName = (body.name || '').trim() || profileIndex.profiles[oldId].name;
      let newId = _slugify(newName);
      if (newId !== oldId) {
        // Resolve collisions (skip oldId since we're replacing it)
        let base = newId, n = 2;
        while (profileIndex.profiles[newId] && newId !== oldId) { newId = base + '_' + n++; }
        // Rename the file on disk
        try { fs.renameSync(_profilePath(oldId), _profilePath(newId)); } catch(e) {}
        profileIndex.profiles[newId] = { name: newName };
        delete profileIndex.profiles[oldId];
        if (activeProfileId === oldId) { activeProfileId = newId; profileIndex.active = newId; }
      } else {
        profileIndex.profiles[oldId].name = newName;
      }
      _saveIndex();
      json200(res, { ok: true, newId, list: _profileListArr() }); return;
    } catch(e) { res.writeHead(400); res.end('Bad request'); return; }
  }

  if (pathname === '/delete-profile' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      const delId = body.id;
      if (!profileIndex.profiles || !profileIndex.profiles[delId]) { res.writeHead(404); res.end('Not found'); return; }
      const ids = Object.keys(profileIndex.profiles);
      if (ids.length <= 1) { res.writeHead(400); res.end('Cannot delete last profile'); return; }
      delete profileIndex.profiles[delId];
      try { fs.unlinkSync(_profilePath(delId)); } catch(e) {}
      if (activeProfileId === delId) {
        const nextId = Object.keys(profileIndex.profiles)[0];
        activeProfileId = nextId;
        profileIndex.active = nextId;
        _applyRawToS(s, _loadProfileRaw(nextId));
      }
      _saveIndex();
      json200(res, { ok: true, activeProfile: activeProfileId, list: _profileListArr() }); return;
    } catch(e) { res.writeHead(400); res.end('Bad request'); return; }
  }
  if (pathname === '/export-profile' && req.method === 'GET') {
    const id = parsed.query.id || activeProfileId;
    const profilePath = _profilePath(id);
    if (!profileIndex.profiles || !profileIndex.profiles[id] || !fs.existsSync(profilePath)) {
      res.writeHead(404); res.end('Not found'); return;
    }
    const profileName = (profileIndex.profiles[id].name || id).replace(/[^a-z0-9_\- ]/gi, '_');
    const data = fs.readFileSync(profilePath, 'utf8');
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${profileName}_profile.json"`
    });
    res.end(data); return;
  }

  if (pathname === '/import-profile' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      const name = ((body.name || '').trim()) || 'Imported Profile';
      const data = body.data;
      if (!data || typeof data !== 'object') { res.writeHead(400); res.end('Bad request'); return; }
      let newId = _slugify(name);
      let base = newId, n = 2;
      while (profileIndex.profiles && profileIndex.profiles[newId]) { newId = base + '_' + n++; }
      const merged = Object.assign({}, DEFAULTS, data);
      if (!profileIndex.profiles) profileIndex.profiles = {};
      profileIndex.profiles[newId] = { name };
      _saveIndex();
      fs.writeFileSync(_profilePath(newId), JSON.stringify(merged, null, 2), 'utf8');
      json200(res, { ok: true, id: newId, list: _profileListArr() }); return;
    } catch(e) { res.writeHead(400); res.end('Bad request'); return; }
  }

  // ── End profile management ────────────────────────────────────────────────

  if (pathname === '/position') { json200(res, { position: s.position }); return; }

  if (pathname === '/setposition') {
    const pos = parsed.query.pos;
    if (pos) { s.position = pos; saveSettings(s); }
    json200(res, { position: s.position }); return;
  }

  if (pathname === '/save') {
    const q = parsed.query;
    if (q.position)              s.position  = q.position;
    if (q.bgOpacity !== undefined) s.bgOpacity = parseFloat(q.bgOpacity);
    if (q.slideIn   !== undefined) s.slideIn   = q.slideIn === 'true';
    if (q.slideOut  !== undefined) s.slideOut  = q.slideOut === 'true';
    if (q.slideMs   !== undefined) s.slideMs   = parseInt(q.slideMs);
    if (q.showMs    !== undefined) s.showMs    = parseInt(q.showMs);
    saveSettings(s);
    json200(res, { ok: true }); return;
  }

  if (pathname === '/savefile' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req));
    if (body.snipFile !== undefined) { s.snipFile = body.snipFile; saveSettings(s); }
    if (body.songOutputPath !== undefined) { s.songOutputPath = body.songOutputPath; saveSettings(s); }
    json200(res, { ok: true, snipFile: s.snipFile, songOutputPath: s.songOutputPath }); return;
  }

  if (pathname === '/savesettingspath' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req));
    if (body.settingsPath) { s.settingsPath = body.settingsPath; saveSettings(s); }
    json200(res, { ok: true }); return;
  }

  if (pathname === '/saveoverrides' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req));
    s.overrides = Array.isArray(body) ? body : [];
    saveSettings(s);
    json200(res, { ok: true }); return;
  }

  // ── BRB ──────────────────────────────────────────────────────────────────
  if (pathname === '/brb-config') {
    const folderSlides = scanBrbFolder(s.brb.folder);
    // Merge manual links, detect type by extension
    const manualSlides = (s.brb.links || []).filter(l => l && l.trim()).map(l => {
      const normalized = l.replace(/\\/g, '/');
      const ext = path.extname(l).toLowerCase();
      const type = HTML_EXTS.has(ext) ? 'iframe' : VIDEO_EXTS.has(ext) ? 'video' : 'image';
      return { type, src: normalized, manual: true };
    });
    // Combine: folder first, then manual links (avoid duplicates by src)
    const seen = new Set(folderSlides.map(s => s.src));
    const combined = [...folderSlides, ...manualSlides.filter(m => !seen.has(m.src))];

    // Add widget slides if enabled
    const w = s.brb.widgets || {};
    if (w.clock && w.clock.inSlideshow)     combined.push({ type: 'clock',     config: w.clock });
    if (w.countdown && w.countdown.inSlideshow) combined.push({ type: 'countdown', config: w.countdown });
    if (w.social && w.social.inSlideshow)   combined.push({ type: 'social',    config: w.social });
    if (w.nextMatch && w.nextMatch.inSlideshow && w.nextMatch.p1 && w.nextMatch.p2)
      combined.push({ type: 'nextmatch', config: w.nextMatch });

    // Shuffle or keep in order
    if (s.brb.randomize !== false) {
      for (let i = combined.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [combined[i], combined[j]] = [combined[j], combined[i]];
      }
    }

    json200(res, {
      slides:        combined,
      imageDuration: s.brb.imageDuration || 10,
      nextMatchDuration: (w.nextMatch && w.nextMatch.duration) || 15,
      htmlDuration:  s.brb.htmlDuration  || 20,
      videoDuration: s.brb.videoDuration || 0,
      fadeTime:      s.brb.fadeTime      || 1,
      transition:    s.brb.transition    || 'fade',
      folder:        s.brb.folder
    }); return;
  }

  if (pathname === '/save-settings' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      if (body.brb) {
        // Deep merge widgets so saving clock doesn't wipe countdown/social
        const newWidgets = body.brb.widgets
          ? Object.assign({}, s.brb.widgets || {}, {
              clock:     Object.assign({}, (s.brb.widgets || {}).clock     || {}, (body.brb.widgets || {}).clock     || {}),
              countdown: Object.assign({}, (s.brb.widgets || {}).countdown || {}, (body.brb.widgets || {}).countdown || {}),
              social:    Object.assign({}, (s.brb.widgets || {}).social    || {}, (body.brb.widgets || {}).social    || {}),
              nextMatch: Object.assign({}, (s.brb.widgets || {}).nextMatch || {}, (body.brb.widgets || {}).nextMatch || {})
            })
          : s.brb.widgets;
        s.brb = Object.assign({}, s.brb, body.brb);
        if (newWidgets) s.brb.widgets = newWidgets;
      }
      if (body.music) Object.assign(s, body.music);
      if (body.widgetLayout !== undefined) s.widgetLayout = body.widgetLayout;
      if (body.startggToken !== undefined) s.startggToken = body.startggToken;
      if (body.startggTourneyUrl !== undefined) s.startggTourneyUrl = body.startggTourneyUrl;
      if (body.bskyReplaysFolder !== undefined) s.bskyReplaysFolder = body.bskyReplaysFolder;
      if (body.bskyHandleSaved !== undefined) s.bskyHandleSaved = body.bskyHandleSaved;
      if (body.bskyAppPassword !== undefined) s.bskyAppPassword = body.bskyAppPassword;
      if (body.bskyTitleTemplate !== undefined) s.bskyTitleTemplate = body.bskyTitleTemplate;
      if (body.bskyDescription !== undefined) s.bskyDescription = body.bskyDescription;
      if (body.bskyFilterEnabled !== undefined) s.bskyFilterEnabled = body.bskyFilterEnabled;
      if (body.bskyFilterKeyword !== undefined) s.bskyFilterKeyword = body.bskyFilterKeyword;
      if (body.ytClientId     !== undefined) s.ytClientId     = body.ytClientId;
      if (body.ytClientSecret !== undefined) s.ytClientSecret = body.ytClientSecret;
      if (body.bitlyToken     !== undefined) s.bitlyToken     = body.bitlyToken;
      if (body.bitlyLink      !== undefined) s.bitlyLink      = body.bitlyLink;
      if (body.bitlyLabel     !== undefined) s.bitlyLabel     = body.bitlyLabel;
      if (body.discordClientId     !== undefined) s.discordClientId     = body.discordClientId;
      if (body.discordClientSecret !== undefined) s.discordClientSecret = body.discordClientSecret;
      if (body.discordOverlay      !== undefined) s.discordOverlay      = Object.assign({}, s.discordOverlay || {}, body.discordOverlay);
      if (body.discordOverlay2     !== undefined) s.discordOverlay2     = Object.assign({}, s.discordOverlay2 || {}, body.discordOverlay2);
      if (body.discordOverlaySolo  !== undefined) s.discordOverlaySolo  = Object.assign({}, s.discordOverlaySolo || {}, body.discordOverlaySolo);
      if (body.widgetEnabled !== undefined) s.widgetEnabled = body.widgetEnabled;
      if (body.widgetOpen !== undefined) s.widgetOpen = body.widgetOpen;
      saveSettings(s);
      json200(res, { ok: true, settings: s });
    } catch(e) { res.writeHead(400); res.end('Bad request'); }
    return;
  }

  // Serve TSH project files as a virtual directory
  if (pathname.startsWith('/tsh/')) {
    const tshRoot = s.brb.tshRoot || '';
    if (!tshRoot) { res.writeHead(404); res.end('TSH root not configured'); return; }
    const subPath = pathname.slice(5);
    const filePath = path.join(tshRoot, subPath);
    serveFile(filePath, res); return;
  }

  // TSH fetches settings.json and user_data relative to localhost root — serve them from TSH folder
  if (pathname === '/settings.json' || pathname.startsWith('/user_data/') || pathname.startsWith('/assets/')) {
    const tshRoot = s.brb.tshRoot || '';
    if (!tshRoot) { res.writeHead(404); res.end('not found'); return; }
    const filePath = path.join(tshRoot, pathname);
    serveFile(filePath, res); return;
  }

  // TSH also fetches /include/ files (kuromoji etc) relative to root
  if (pathname.startsWith('/include/')) {
    const tshRoot = s.brb.tshRoot || '';
    if (!tshRoot) { res.writeHead(404); res.end('not found'); return; }
    // These are under layout/include relative to TSH root
    const filePath = path.join(tshRoot, 'layout', pathname);
    serveFile(filePath, res); return;
  }

  // Serve any local file by absolute path — used for BRB HTML assets
  // /brb-asset?path=C:/absolute/path/to/file.js
  if (pathname === '/brb-asset') {
    const filePath = parsed.query.path;
    if (!filePath) { res.writeHead(400); res.end('Missing path param'); return; }
    console.log('[BRB-ASSET]', filePath);
    serveFile(filePath, res); return;
  }

  if (pathname === '/brb-file') {
    const filePath = parsed.query.path;
    if (!filePath) { res.writeHead(400); res.end('Missing path'); return; }
    const ext = path.extname(filePath).toLowerCase();
    if (HTML_EXTS.has(ext)) {
      try {
        console.log('[BRB] Serving HTML:', filePath);
        let content = fs.readFileSync(filePath, 'utf8');
        const tshRoot  = (s.brb.tshRoot || '').replace(/\\/g, '/');
        const fileDir  = path.dirname(filePath).replace(/\\/g, '/');

        // Rewrite static src/href attributes
        content = content.replace(/(src|href)=["'](?!https?:\/\/|data:|#|\/tsh\/|\/brb-)([^"']+)["']/g, function(match, attr, val) {
          const resolved = path.resolve(fileDir, val).replace(/\\/g, '/');
          if (tshRoot && resolved.startsWith(tshRoot)) {
            const rel = resolved.slice(tshRoot.length).replace(/^\//, '');
            return attr + '="/tsh/' + rel + '"';
          }
          return attr + '="/brb-asset?path=' + encodeURIComponent(resolved) + '"';
        });

        // Inject runtime interceptor to rewrite dynamic script src (e.g. globals.js loading jquery)
        const tshRootJ = JSON.stringify(tshRoot);
        const fileDirJ = JSON.stringify(fileDir);
        const interceptor = [
          '<script>',
          '(function(){',
          'var TR=' + tshRootJ + ';',
          'var FD=' + fileDirJ + ';',
          'function rw(src){',
          '  if(!src||src.startsWith("http")||src.startsWith("/"))return src;',
          '  var parts=(FD+"/"+src).split("/"),out=[];',
          '  for(var i=0;i<parts.length;i++){if(parts[i]==="..")out.pop();else if(parts[i]!=="."&&parts[i]!=="")out.push(parts[i]);}',
          '  var abs=out.join("/");',
          '  if(TR&&abs.startsWith(TR))return"/tsh/"+abs.slice(TR.length).replace(/^\\/\/,"");',
          '  return"/brb-asset?path="+encodeURIComponent(abs);',
          '}',
          'var _ce=document.createElement.bind(document);',
          'document.createElement=function(tag){',
          '  var el=_ce(tag);',
          '  if(tag.toLowerCase()==="script"||tag.toLowerCase()==="link"){',
          '    Object.defineProperty(el,"src",{',
          '      set:function(v){el.setAttribute("src",rw(v));},',
          '      get:function(){return el.getAttribute("src");}',
          '    });',
          '    Object.defineProperty(el,"href",{',
          '      set:function(v){el.setAttribute("href",rw(v));},',
          '      get:function(){return el.getAttribute("href");}',
          '    });',
          '  }',
          '  return el;',
          '};',
          '})();',
          '<\/script>'
        ].join('');
        if (/<head/i.test(content)) {
          content = content.replace(/(<head[^>]*>)/i, '$1' + interceptor);
        } else {
          content = interceptor + content;
        }
        res.writeHead(200, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' });
        res.end(content);
      } catch(e) { res.writeHead(404); res.end('Not found'); }
    } else {
      serveFile(filePath, res);
    }
    return;
  }

  res.writeHead(404); res.end('not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  ================================');
  console.log('  MMA Stream Server running!');
  console.log('  ================================');
  console.log('');
  console.log('  Music overlay:  http://localhost:' + PORT + '/overlay');
  console.log('  BRB slideshow:  http://localhost:' + PORT + '/brb');
  console.log('  Control panel:  http://localhost:' + PORT + '/controls');
  console.log('');
  console.log('  Keep this window open while streaming.');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});
