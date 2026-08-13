// gen1recomp mods browser — fetches the live community feed and renders a
// searchable/filterable grid. No build step, no deps: the feed is self-updating
// (rebuilt nightly upstream), so a runtime fetch is always current.
'use strict';

// The feed and its relative assets (thumbnail, description.md) live here.
// thumbnail/description_url in the JSON are relative to this base.
const FEED_BASE = 'https://bryanthaboi.github.io/gen1recomp-mod-index/';
const FEED_URL = FEED_BASE + 'data/index.json';

const state = {
  mods: [],
  search: '',
  categories: new Set(),
  tags: new Set(),
  hasThumb: false,
  experimentalOnly: false,
  hideExperimental: false,
  sort: 'title',
};

const $ = (sel) => document.querySelector(sel);
const els = {
  grid: $('#grid'),
  empty: $('#empty'),
  count: $('#result-count'),
  stamp: $('#feed-stamp'),
  search: $('#search'),
  sort: $('#sort'),
  catFilters: $('#category-filters'),
  tagFilters: $('#tag-filters'),
  clear: $('#clear-filters'),
  flagThumb: $('#flag-thumb'),
  flagExp: $('#flag-experimental'),
  flagHideExp: $('#flag-hide-experimental'),
  detail: $('#detail'),
  detailBody: $('#detail-body'),
  detailTitleHead: $('#detail-title-head'),
  detailClose: $('#detail-close'),
};

// ---------------------------------------------------------------- utilities

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function assetUrl(rel) {
  if (!rel) return null;
  if (/^https?:\/\//.test(rel)) return rel;
  return FEED_BASE + rel.replace(/^\//, '');
}

function downloadFor(mod) {
  if (mod.latest && mod.latest.zip && mod.latest.zip.url) return mod.latest.zip.url;
  if (mod.downloadURL) return mod.downloadURL;
  return null;
}

function versionLabel(mod) {
  const v = (mod.latest && mod.latest.version) || mod.version;
  return v ? 'v' + v : '';
}

function fmtBytes(n) {
  if (!n) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------- data load

async function load() {
  renderSkeletons();
  try {
    const res = await fetch(FEED_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    state.mods = Array.isArray(data.mods) ? data.mods : [];
    els.stamp.textContent = data.generated_at ? 'Feed updated ' + fmtDate(data.generated_at) : '';
    buildCategoryFilters(data.categories || deriveCategories());
    buildTagFilters();
    readHash();
    syncControls();
    render();
  } catch (err) {
    els.grid.innerHTML = '';
    els.count.textContent = '';
    const b = document.createElement('div');
    b.className = 'banner';
    b.innerHTML =
      'Could not load the mod feed (' + esc(err.message) + '). ' +
      'You can browse it directly at <a href="' + FEED_URL + '">index.json</a>.';
    els.grid.before(b);
  }
}

function deriveCategories() {
  const set = new Set();
  for (const m of state.mods) for (const c of m.categories || []) set.add(c);
  return [...set].sort();
}

// ---------------------------------------------------------------- filtering

function filtered() {
  const q = state.search.trim().toLowerCase();
  let out = state.mods.filter((m) => {
    if (state.hasThumb && !m.thumbnail) return false;
    if (state.experimentalOnly && !m.experimental) return false;
    if (state.hideExperimental && m.experimental) return false;
    if (state.categories.size) {
      const cats = m.categories || [];
      // AND semantics feel too strict with 1–4 cats; use OR (any selected).
      if (!cats.some((c) => state.categories.has(c))) return false;
    }
    if (state.tags.size) {
      const tags = m.tags || [];
      if (!tags.some((t) => state.tags.has(t))) return false;
    }
    if (q) {
      const hay = [
        m.title, m.author, m.summary, m.id,
        (m.tags || []).join(' '),
        (m.categories || []).join(' '),
      ].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const by = {
    title: (a, b) => (a.title || '').localeCompare(b.title || ''),
    author: (a, b) => (a.author || '').localeCompare(b.author || '') || (a.title || '').localeCompare(b.title || ''),
    updated: (a, b) => publishedTs(b) - publishedTs(a),
  };
  out.sort(by[state.sort] || by.title);
  return out;
}

function publishedTs(m) {
  const t = m.latest && m.latest.published_at;
  const n = t ? Date.parse(t) : NaN;
  return isNaN(n) ? 0 : n;
}

// ---------------------------------------------------------------- rendering

function render() {
  const list = filtered();
  els.grid.innerHTML = '';
  els.empty.hidden = list.length !== 0;

  const total = state.mods.length;
  els.count.innerHTML = list.length === total
    ? '<b>' + total + '</b> mods'
    : '<b>' + list.length + '</b> of ' + total + ' mods';

  const frag = document.createDocumentFragment();
  for (const mod of list) frag.appendChild(card(mod));
  els.grid.appendChild(frag);

  const anyFilter =
    state.search || state.categories.size || state.tags.size || state.hasThumb ||
    state.experimentalOnly || state.hideExperimental;
  els.clear.hidden = !anyFilter;

  writeHash();
}

function card(mod) {
  const el = document.createElement('article');
  el.className = 'mod-card';
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', mod.title);

  const thumb = assetUrl(mod.thumbnail);
  const thumbHtml = thumb
    ? '<img class="card-thumb" loading="lazy" alt="" src="' + esc(thumb) + '" onerror="this.replaceWith(makePlaceholder(' + JSON.stringify(mod.title).replace(/"/g, '&quot;') + '))" />'
    : placeholderHtml(mod.title);

  const cats = (mod.categories || []).slice(0, 3)
    .map((c) => '<span class="badge cat">' + esc(c) + '</span>').join('');
  const expBadge = mod.experimental ? '<span class="badge exp">experimental</span>' : '';

  const dl = downloadFor(mod);
  const dlBtn = dl
    ? '<a class="dl-btn" href="' + esc(dl) + '" onclick="event.stopPropagation()" rel="noopener">↓ Download</a>'
    : '<span class="dl-btn disabled">No download</span>';

  el.innerHTML =
    thumbHtml +
    '<div class="card-body">' +
      '<h3 class="card-title">' + esc(mod.title) + '</h3>' +
      '<span class="card-author">by ' + esc(mod.author) + '</span>' +
      '<p class="card-summary">' + esc(mod.summary || '') + '</p>' +
      '<div class="badges">' + cats + expBadge + '</div>' +
    '</div>' +
    '<div class="card-foot">' +
      '<span class="card-version">' + esc(versionLabel(mod)) + '</span>' +
      dlBtn +
    '</div>';

  el.addEventListener('click', () => openDetail(mod));
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(mod); }
  });
  return el;
}

function placeholderHtml(title) {
  const initial = esc((title || '?').trim().charAt(0).toUpperCase());
  return '<div class="card-thumb placeholder">' + initial + '</div>';
}
// used by onerror handler on <img>
window.makePlaceholder = function (title) {
  const d = document.createElement('div');
  d.className = 'card-thumb placeholder';
  d.textContent = (title || '?').trim().charAt(0).toUpperCase();
  return d;
};

function renderSkeletons() {
  els.grid.innerHTML = '';
  for (let i = 0; i < 8; i++) {
    const s = document.createElement('div');
    s.className = 'mod-card skeleton';
    s.innerHTML =
      '<div class="card-thumb"></div>' +
      '<div class="card-body"><div></div><div style="width:60%"></div><div></div></div>';
    els.grid.appendChild(s);
  }
  els.count.textContent = 'Loading…';
}

// ---------------------------------------------------------------- detail modal

let descCache = new Map();

async function openDetail(mod) {
  const thumb = assetUrl(mod.thumbnail);
  const dl = downloadFor(mod);

  const meta = [];
  const add = (k, v) => { if (v != null && v !== '' && !(Array.isArray(v) && !v.length)) meta.push([k, v]); };
  add('Version', versionLabel(mod));
  add('Author', mod.author);
  add('Categories', (mod.categories || []).join(', '));
  add('License', mod.license);
  add('Mod API', mod.api);
  add('Engine', mod.game_version);
  add('Profile', mod.profile);
  if (mod.latest) {
    add('Released', fmtDate(mod.latest.published_at));
    if (mod.latest.zip) add('Download size', fmtBytes(mod.latest.zip.size));
  }
  if ((mod.permissions || []).length) add('Permissions', mod.permissions.join(', '));
  if ((mod.dependencies || []).length) add('Depends on', mod.dependencies.join(', '));
  if ((mod.conflicts || []).length) add('Conflicts', mod.conflicts.join(', '));
  add('Tags', (mod.tags || []).join(', '));

  const metaHtml = meta.map(([k, v]) =>
    '<div class="meta-item"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div></div>'
  ).join('');

  const hero = thumb
    ? '<img class="detail-hero" alt="" src="' + esc(thumb) + '" onerror="this.remove()" />'
    : '';

  const button = (href, label, ghost) =>
    '<a class="dl-btn' + (ghost ? ' button' : '') + '" ' +
    (ghost ? 'style="background:transparent;color:var(--contrast);border-color:var(--contrast)" ' : '') +
    'href="' + esc(href) + '" target="_blank" rel="noopener">' + esc(label) + '</a>';

  const actions =
    (dl ? '<a class="dl-btn" href="' + esc(dl) + '" rel="noopener">↓ Download ' + esc(versionLabel(mod)) + '</a>' : '') +
    (mod.repo ? button(mod.repo, 'Source repo ↗', true) : '') +
    (mod.github ? button('https://github.com/' + mod.github + '/releases', 'Releases ↗', true) : '');

  els.detailTitleHead.textContent = mod.title;
  els.detailBody.innerHTML =
    hero +
    '<p class="detail-sub">by ' + esc(mod.author) +
      (mod.experimental ? ' · <span class="badge exp">experimental</span>' : '') + '</p>' +
    '<div class="detail-actions">' + actions + '</div>' +
    '<div class="meta-grid">' + metaHtml + '</div>' +
    '<div class="desc-md" id="desc-md"><p class="desc-loading">Loading description…</p></div>';

  if (typeof els.detail.showModal === 'function') els.detail.showModal();
  else els.detail.setAttribute('open', '');

  location.hash = hashString({ ...hashFilters(), mod: mod.folder });

  loadDescription(mod);
}

async function loadDescription(mod) {
  const target = document.getElementById('desc-md');
  const url = assetUrl(mod.description_url);
  if (!url) { target.innerHTML = ''; return; }
  try {
    let md;
    if (descCache.has(url)) md = descCache.get(url);
    else {
      const res = await fetch(url, { cache: 'force-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      md = await res.text();
      descCache.set(url, md);
    }
    // Guard against re-render race: only apply if still the open mod.
    if (document.getElementById('desc-md') === target) target.innerHTML = renderMarkdown(md);
  } catch (err) {
    target.innerHTML = '<p class="desc-loading">Description unavailable (' + esc(err.message) + ').</p>';
  }
}

function closeDetail() {
  if (typeof els.detail.close === 'function') els.detail.close();
  else els.detail.removeAttribute('open');
  location.hash = hashString(hashFilters());
}

// ---------------------------------------------------------------- markdown
// Minimal, safe markdown → HTML. Escapes first, then applies a small subset.
// Not a full parser; enough for mod descriptions (headings, lists, code,
// links, images, bold/italic, blockquotes).

function renderMarkdown(src) {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  let html = '';
  let inCode = false, codeBuf = [];
  let listType = null;

  const closeList = () => { if (listType) { html += '</' + listType + '>'; listType = null; } };
  const inline = (t) => {
    t = esc(t);
    // images ![alt](url) then links [text](url)
    t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g,
      (_, a, u) => '<img alt="' + a + '" src="' + safeUrl(u) + '" />');
    t = t.replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g,
      (_, txt, u) => '<a href="' + safeUrl(u) + '" target="_blank" rel="noopener">' + txt + '</a>');
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    t = t.replace(/\bhttps?:\/\/[^\s<]+/g, (u) =>
      /"/.test(u) ? u : '<a href="' + safeUrl(u) + '" target="_blank" rel="noopener">' + u + '</a>');
    return t;
  };

  for (const raw of lines) {
    if (/^```/.test(raw)) {
      if (inCode) { html += '<pre><code>' + esc(codeBuf.join('\n')) + '</code></pre>'; codeBuf = []; inCode = false; }
      else { closeList(); inCode = true; }
      continue;
    }
    if (inCode) { codeBuf.push(raw); continue; }

    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { closeList(); continue; }

    let m;
    if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) {
      closeList();
      const n = m[1].length;
      html += '<h' + n + '>' + inline(m[2]) + '</h' + n + '>';
    } else if ((m = /^\s*[-*+]\s+(.*)$/.exec(line))) {
      if (listType !== 'ul') { closeList(); html += '<ul>'; listType = 'ul'; }
      html += '<li>' + inline(m[1]) + '</li>';
    } else if ((m = /^\s*\d+\.\s+(.*)$/.exec(line))) {
      if (listType !== 'ol') { closeList(); html += '<ol>'; listType = 'ol'; }
      html += '<li>' + inline(m[1]) + '</li>';
    } else if ((m = /^\s*>\s?(.*)$/.exec(line))) {
      closeList();
      html += '<blockquote>' + inline(m[1]) + '</blockquote>';
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      closeList();
      html += '<hr />';
    } else {
      closeList();
      html += '<p>' + inline(line) + '</p>';
    }
  }
  if (inCode) html += '<pre><code>' + esc(codeBuf.join('\n')) + '</code></pre>';
  closeList();
  return html;
}

function safeUrl(u) {
  // Block javascript:/data: (except images already escaped); allow http(s), relative, anchors.
  if (/^\s*(javascript|vbscript):/i.test(u)) return '#';
  return esc(u);
}

// ---------------------------------------------------------------- filters UI

function buildCategoryFilters(cats) {
  const counts = {};
  for (const m of state.mods) for (const c of m.categories || []) counts[c] = (counts[c] || 0) + 1;
  els.catFilters.innerHTML = '';
  for (const c of cats) {
    if (!counts[c]) continue; // hide categories nothing uses
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.value = c;
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = esc(c) + '<span class="count">' + counts[c] + '</span>';
    btn.addEventListener('click', () => {
      if (state.categories.has(c)) state.categories.delete(c);
      else state.categories.add(c);
      btn.setAttribute('aria-pressed', String(state.categories.has(c)));
      render();
    });
    li.appendChild(btn);
    els.catFilters.appendChild(li);
  }
}

function buildTagFilters() {
  const counts = {};
  for (const m of state.mods) for (const t of m.tags || []) counts[t] = (counts[t] || 0) + 1;
  // Tags are freeform (many one-offs); only surface those shared by ≥2 mods.
  const tags = Object.keys(counts)
    .filter((t) => counts[t] >= 2)
    .sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
  els.tagFilters.innerHTML = '';
  for (const t of tags) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.value = t;
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = '#' + esc(t) + '<span class="count">' + counts[t] + '</span>';
    btn.addEventListener('click', () => {
      if (state.tags.has(t)) state.tags.delete(t);
      else state.tags.add(t);
      btn.setAttribute('aria-pressed', String(state.tags.has(t)));
      render();
    });
    li.appendChild(btn);
    els.tagFilters.appendChild(li);
  }
}

function syncControls() {
  els.search.value = state.search;
  els.sort.value = state.sort;
  setChip(els.flagThumb, state.hasThumb);
  setChip(els.flagExp, state.experimentalOnly);
  setChip(els.flagHideExp, state.hideExperimental);
  els.catFilters.querySelectorAll('.chip').forEach((btn) => {
    setChip(btn, state.categories.has(btn.value));
  });
  els.tagFilters.querySelectorAll('.chip').forEach((btn) => {
    setChip(btn, state.tags.has(btn.value));
  });
}

function setChip(btn, on) { btn.setAttribute('aria-pressed', String(!!on)); }
function chipOn(btn) { return btn.getAttribute('aria-pressed') === 'true'; }

function clearFilters() {
  state.search = '';
  state.categories.clear();
  state.tags.clear();
  state.hasThumb = state.experimentalOnly = state.hideExperimental = false;
  syncControls();
  render();
}

// ---------------------------------------------------------------- hash sync
// Filters + open mod live in the URL hash so views are shareable.

function hashFilters() {
  const h = {};
  if (state.search) h.q = state.search;
  if (state.categories.size) h.cat = [...state.categories].join(',');
  if (state.tags.size) h.tag = [...state.tags].join(',');
  if (state.sort !== 'title') h.sort = state.sort;
  if (state.hasThumb) h.thumb = 1;
  if (state.experimentalOnly) h.exp = 1;
  if (state.hideExperimental) h.noexp = 1;
  return h;
}

function hashString(obj) {
  const parts = Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== '' && v !== 0)
    .map(([k, v]) => k + '=' + encodeURIComponent(v));
  return parts.join('&');
}

function writeHash() {
  const target = hashString(hashFilters());
  const current = location.hash.replace(/^#/, '');
  // Don't stomp an open-mod hash written by openDetail.
  if (els.detail.open) return;
  if (current !== target) history.replaceState(null, '', '#' + target);
}

function readHash() {
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  state.search = p.get('q') || '';
  state.sort = p.get('sort') || 'title';
  state.hasThumb = p.has('thumb');
  state.experimentalOnly = p.has('exp');
  state.hideExperimental = p.has('noexp');
  state.categories = new Set((p.get('cat') || '').split(',').filter(Boolean));
  state.tags = new Set((p.get('tag') || '').split(',').filter(Boolean));
  const modFolder = p.get('mod');
  if (modFolder) {
    const mod = state.mods.find((m) => m.folder === modFolder);
    if (mod) setTimeout(() => openDetail(mod), 0);
  }
}

// ---------------------------------------------------------------- wiring

els.search.addEventListener('input', (e) => { state.search = e.target.value; render(); });
els.sort.addEventListener('change', (e) => { state.sort = e.target.value; render(); });
function toggleFlag(btn, key) {
  const on = !chipOn(btn);
  setChip(btn, on);
  state[key] = on;
  render();
}
els.flagThumb.addEventListener('click', () => toggleFlag(els.flagThumb, 'hasThumb'));
els.flagExp.addEventListener('click', () => toggleFlag(els.flagExp, 'experimentalOnly'));
els.flagHideExp.addEventListener('click', () => toggleFlag(els.flagHideExp, 'hideExperimental'));
els.clear.addEventListener('click', clearFilters);
els.detailClose.addEventListener('click', closeDetail);
els.detail.addEventListener('cancel', () => { closeDetail(); });
els.detail.addEventListener('click', (e) => { if (e.target === els.detail) closeDetail(); });

load();
