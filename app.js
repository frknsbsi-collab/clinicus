'use strict';

/* =========================================================================
   Clinicus — hekimler için kişisel işlem kayıt defteri
   Tüm veriler cihazda saklanır. Depolama katmanı (Store) tek yerde
   toplandı; Android'e (ör. Capacitor) geçerken yalnızca burası değişir.
   ========================================================================= */

/* ---------------- Depolama ---------------- */
const Store = (() => {
  const KEY = 'clinicus.data.v1';

  const empty = () => ({
    version: 1,
    settings: { currency: 'TRY', clinicName: '', lastBackup: null },
    procedures: [], // { id, name, price }
    patients: [],   // { id, name, personalityNotes, createdAt, updatedAt }
    visits: [],     // { id, patientId, date, time, items:[{procedureId,name,price}], treatmentNotes, createdAt, updatedAt }
  });

  const normalize = (d) => {
    const base = empty();
    return {
      ...base,
      ...d,
      settings: { ...base.settings, ...(d.settings || {}) },
      procedures: Array.isArray(d.procedures) ? d.procedures : [],
      patients: Array.isArray(d.patients) ? d.patients : [],
      visits: Array.isArray(d.visits) ? d.visits : [],
    };
  };

  function load() {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    try {
      return normalize(JSON.parse(raw));
    } catch (e) {
      // Bozuk veri: üzerine yazmadan önce kenara kopyala
      localStorage.setItem(`${KEY}.corrupt.${Date.now()}`, raw);
      return empty();
    }
  }

  function save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      alert('Veriler kaydedilemedi. Depolama alanı dolu olabilir; lütfen yedek alın.');
      return false;
    }
  }

  // Tarayıcıdan verilerin otomatik silinmemesi için kalıcı depolama iste
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  return { load, save, empty, normalize };
})();

let db = Store.load();
const save = () => Store.save(db);

/* ---------------- Yardımcılar ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => ymd(new Date());
const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const diffDays = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5);
const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr');
const cleanName = (s) => String(s || '').trim().replace(/\s+/g, ' ');

// "1.500", "1.500,50", "1500.5", "1500,5" hepsini doğru okur
function num(v) {
  let s = String(v ?? '').replace(/\s|₺/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  else s = s.replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

function money(v) {
  try {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: db.settings.currency, maximumFractionDigits: 2 }).format(v || 0);
  } catch {
    return `${(v || 0).toFixed(2)} ${db.settings.currency}`;
  }
}

const dtf = (opts) => new Intl.DateTimeFormat('tr-TR', opts);
const fmtLong = (s) => dtf({ day: 'numeric', month: 'long', year: 'numeric' }).format(parseYmd(s));
const fmtShort = (s) => dtf({ day: 'numeric', month: 'short' }).format(parseYmd(s));
const fmtWeekday = (s) => dtf({ weekday: 'long' }).format(parseYmd(s));
const fmtMonth = (s) => dtf({ month: 'long', year: 'numeric' }).format(parseYmd(s));
const initials = (name) => cleanName(name).split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toLocaleUpperCase('tr')).join('');

const getPatient = (id) => db.patients.find((p) => p.id === id);
const findPatientByName = (name) => db.patients.find((p) => norm(p.name) === norm(name));
const visitTotal = (v) => v.items.reduce((s, i) => s + (Number(i.price) || 0), 0);
const sortVisits = (list) => list.sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------------- İkonlar ---------------- */
const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const I = {
  left: svg('<polyline points="15 18 9 12 15 6"/>'),
  right: svg('<polyline points="9 18 15 12 9 6"/>'),
  plus: svg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
  x: svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
  search: svg('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'),
  users: svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
  home: svg('<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>'),
  chart: svg('<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>'),
  sliders: svg('<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>'),
  trash: svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>'),
  edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>'),
  download: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
  upload: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>'),
  file: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>'),
};
document.querySelectorAll('[data-icon]').forEach((el) => { el.outerHTML = I[el.dataset.icon]; });

/* ---------------- Durum ---------------- */
const state = {
  tab: 'home',
  day: today(),
  search: '',
  period: 'month',
  offset: 0,
  from: addDays(today(), -29),
  to: today(),
};

const main = $('#main');

function render() {
  document.querySelectorAll('.nav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
  $('#clinicLabel').textContent = db.settings.clinicName || '';
  ({ home: renderHome, patients: renderPatients, earnings: renderEarnings, settings: renderSettings })[state.tab]();
}

function setTab(tab) {
  state.tab = tab;
  render();
  window.scrollTo(0, 0);
}

const stat = (label, value, isMoney = false) =>
  `<div class="stat${isMoney ? ' money' : ''}"><span>${esc(label)}</span><strong title="${esc(value)}">${esc(value)}</strong></div>`;

const emptyBox = (title, text) => `<div class="empty"><strong>${esc(title)}</strong>${esc(text)}</div>`;

function visitCard(v, { showDate = false, showName = true } = {}) {
  const p = getPatient(v.patientId);
  return `
    <button class="card" data-act="open-visit" data-id="${v.id}">
      <div class="row">
        <span class="${showDate ? 'date' : 'time'}">${showDate ? esc(fmtShort(v.date)) : esc(v.time || '--:--')}</span>
        <strong>${showName ? esc(p ? p.name : 'Silinmiş hasta') : ''}</strong>
        <span class="amount">${money(visitTotal(v))}</span>
      </div>
      <div class="chips">${v.items.map((i) => `<span class="chip">${esc(i.name)}</span>`).join('')}</div>
      ${v.treatmentNotes ? `<p class="note">${esc(v.treatmentNotes)}</p>` : ''}
    </button>`;
}

/* ---------------- Anasayfa ---------------- */
function renderHome() {
  const visits = db.visits.filter((v) => v.date === state.day).sort((a, b) => (b.time || '').localeCompare(a.time || ''));
  const patientCount = new Set(visits.map((v) => v.patientId)).size;
  const procCount = visits.reduce((s, v) => s + v.items.length, 0);
  const total = visits.reduce((s, v) => s + visitTotal(v), 0);
  const isToday = state.day === today();

  const lb = db.settings.lastBackup;
  const needsBackup = db.visits.length > 0 && (!lb || Date.now() - lb > 14 * 864e5);

  main.innerHTML = `
    <section class="daybar">
      <button class="icon-btn" data-act="prev-day" aria-label="Önceki gün">${I.left}</button>
      <label class="daylabel">
        <span class="day-title">${isToday ? 'Bugün' : esc(fmtWeekday(state.day))}</span>
        <span class="day-sub">${esc(fmtLong(state.day))}</span>
        <input type="date" id="dayPicker" value="${state.day}" aria-label="Tarih seç">
      </label>
      <button class="icon-btn" data-act="next-day" aria-label="Sonraki gün">${I.right}</button>
    </section>
    ${isToday ? '' : `<button class="link-btn center" data-act="go-today">Bugüne dön</button>`}
    <section class="stats three">
      ${stat('Hasta', patientCount)}${stat('İşlem', procCount)}${stat('Kazanç', money(total), true)}
    </section>
    ${needsBackup ? `<div class="banner"><span>${lb ? 'Son yedeğin üzerinden 2 haftadan fazla geçti.' : 'Henüz yedek almadınız.'}</span><button data-act="export-json">Şimdi yedekle</button></div>` : ''}
    <button class="primary big" data-act="add-visit">${I.plus} İşlem Ekle</button>
    <h2 class="section-title">${isToday ? 'Bugünkü kayıtlar' : 'Günün kayıtları'}</h2>
    ${visits.length
      ? `<div class="list">${visits.map((v) => visitCard(v)).join('')}</div>`
      : emptyBox('Kayıt yok', isToday ? 'Bugün için henüz işlem eklenmedi.' : 'Bu gün için kayıt bulunmuyor.')}
  `;
}

/* ---------------- Hastalar ---------------- */
function renderPatients() {
  main.innerHTML = `
    <div class="page-head">
      <h1>Hastalar</h1>
      <button class="secondary small" data-act="new-patient">${I.plus} Yeni hasta</button>
    </div>
    <div class="search">${I.search}<input type="search" id="patientSearch" placeholder="Hasta ara…" value="${esc(state.search)}" autocomplete="off"></div>
    <div id="patientList" class="list"></div>`;
  renderPatientList();
}

function renderPatientList() {
  const stats = new Map();
  for (const v of db.visits) {
    const s = stats.get(v.patientId) || { count: 0, total: 0, last: '' };
    s.count++;
    s.total += visitTotal(v);
    if (v.date > s.last) s.last = v.date;
    stats.set(v.patientId, s);
  }
  const q = norm(state.search);
  const list = db.patients
    .filter((p) => !q || norm(p.name).includes(q))
    .map((p) => ({ p, s: stats.get(p.id) || { count: 0, total: 0, last: '' } }))
    .sort((a, b) => b.s.last.localeCompare(a.s.last) || a.p.name.localeCompare(b.p.name, 'tr'));

  const el = $('#patientList');
  if (!db.patients.length) {
    el.innerHTML = emptyBox('Henüz hasta yok', 'Anasayfadan işlem eklediğinizde hastalar burada listelenir.');
    return;
  }
  if (!list.length) {
    el.innerHTML = emptyBox('Sonuç yok', `"${state.search}" ile eşleşen hasta bulunamadı.`);
    return;
  }
  el.innerHTML = list.map(({ p, s }) => `
    <button class="card" data-act="open-patient" data-id="${p.id}">
      <div class="row">
        <span class="avatar">${esc(initials(p.name))}</span>
        <div style="flex:1;min-width:0">
          <strong style="display:block">${esc(p.name)}</strong>
          <div class="meta">${s.count} ziyaret${s.last ? ` · son: ${esc(fmtLong(s.last))}` : ''}</div>
        </div>
        <span class="amount">${money(s.total)}</span>
      </div>
      ${p.personalityNotes ? `<p class="note">${esc(p.personalityNotes)}</p>` : ''}
    </button>`).join('');
}

/* ---------------- Kazanç ---------------- */
function periodRange() {
  const now = new Date();
  const o = state.offset;
  switch (state.period) {
    case 'day': {
      const d = addDays(today(), o);
      return { from: d, to: d, label: fmtLong(d) };
    }
    case 'week': {
      const dow = (now.getDay() + 6) % 7; // Pazartesi = 0
      const from = addDays(today(), -dow + 7 * o);
      const to = addDays(from, 6);
      return { from, to, label: `${fmtShort(from)} – ${fmtShort(to)}` };
    }
    case 'month': {
      const from = ymd(new Date(now.getFullYear(), now.getMonth() + o, 1));
      const d = parseYmd(from);
      const to = ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0));
      return { from, to, label: fmtMonth(from) };
    }
    case 'year': {
      const y = now.getFullYear() + o;
      return { from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) };
    }
    case 'all': {
      const dates = db.visits.map((v) => v.date).sort();
      return { from: dates[0] || today(), to: dates[dates.length - 1] || today(), label: 'Tüm zamanlar' };
    }
    default: {
      const [from, to] = state.from <= state.to ? [state.from, state.to] : [state.to, state.from];
      return { from, to, label: `${fmtLong(from)} – ${fmtLong(to)}` };
    }
  }
}

function buildChart(r, visits) {
  const days = diffDays(r.from, r.to) + 1;
  if (days <= 1) return '';
  const buckets = [];
  let keyOf;
  if (days <= 31) {
    for (let d = r.from; d <= r.to; d = addDays(d, 1)) {
      buckets.push({ key: d, label: days <= 7 ? dtf({ weekday: 'short' }).format(parseYmd(d)) : String(parseYmd(d).getDate()), title: fmtLong(d), total: 0 });
    }
    keyOf = (v) => v.date;
  } else if (days <= 731) {
    const start = parseYmd(r.from);
    const end = parseYmd(r.to);
    for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d.setMonth(d.getMonth() + 1)) {
      const s = ymd(d);
      buckets.push({ key: s.slice(0, 7), label: dtf({ month: 'short' }).format(d), title: fmtMonth(s), total: 0 });
    }
    keyOf = (v) => v.date.slice(0, 7);
  } else {
    for (let y = +r.from.slice(0, 4); y <= +r.to.slice(0, 4); y++) buckets.push({ key: String(y), label: String(y), title: String(y), total: 0 });
    keyOf = (v) => v.date.slice(0, 4);
  }
  const idx = new Map(buckets.map((b, i) => [b.key, i]));
  for (const v of visits) {
    const i = idx.get(keyOf(v));
    if (i !== undefined) buckets[i].total += visitTotal(v);
  }
  const max = Math.max(...buckets.map((b) => b.total), 1);
  const step = buckets.length > 16 ? Math.ceil(buckets.length / 8) : 1;
  return `
    <div class="chart-wrap">
      <div class="chart">${buckets.map((b) => `
        <div class="bar-col" title="${esc(b.title)}: ${esc(money(b.total))}">
          <div class="bar${b.total ? '' : ' zero'}" style="height:${(b.total / max) * 100}%"></div>
        </div>`).join('')}
      </div>
      <div class="chart-labels">${buckets.map((b, i) => `<span>${i % step === 0 ? esc(b.label) : ''}</span>`).join('')}</div>
    </div>`;
}

function renderEarnings() {
  const r = periodRange();
  const visits = db.visits.filter((v) => v.date >= r.from && v.date <= r.to);
  const total = visits.reduce((s, v) => s + visitTotal(v), 0);
  const patientCount = new Set(visits.map((v) => v.patientId)).size;
  const avg = visits.length ? total / visits.length : 0;

  const byProc = new Map();
  for (const v of visits) for (const i of v.items) {
    const o = byProc.get(i.name) || { name: i.name, count: 0, total: 0 };
    o.count++;
    o.total += Number(i.price) || 0;
    byProc.set(i.name, o);
  }
  const rows = [...byProc.values()].sort((a, b) => b.total - a.total);
  const maxRow = Math.max(...rows.map((x) => x.total), 1);

  const periods = [['day', 'Gün'], ['week', 'Hafta'], ['month', 'Ay'], ['year', 'Yıl'], ['all', 'Tümü'], ['custom', 'Aralık']];

  main.innerHTML = `
    <div class="page-head"><h1>Kazanç</h1></div>
    <div class="segmented">${periods.map(([k, l]) => `<button data-act="period" data-id="${k}" class="${state.period === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${state.period === 'custom'
      ? `<div class="grid2">
          <label class="field"><span>Başlangıç</span><input type="date" id="fromDate" value="${state.from}"></label>
          <label class="field"><span>Bitiş</span><input type="date" id="toDate" value="${state.to}"></label>
        </div>`
      : state.period === 'all'
        ? ''
        : `<div class="periodbar">
            <button class="icon-btn" data-act="prev-period" aria-label="Önceki">${I.left}</button>
            <strong>${esc(r.label)}</strong>
            <button class="icon-btn" data-act="next-period" aria-label="Sonraki" ${state.offset >= 0 ? 'disabled' : ''}>${I.right}</button>
          </div>`}
    <section class="hero-stat"><span>Toplam kazanç</span><strong>${money(total)}</strong></section>
    <section class="stats three">${stat('Ziyaret', visits.length)}${stat('Hasta', patientCount)}${stat('Ort. / ziyaret', money(avg), true)}</section>
    ${visits.length ? buildChart(r, visits) : ''}
    <h2 class="section-title">İşlem bazında</h2>
    ${rows.length
      ? `<div class="breakdown">${rows.map((x) => `
          <div>
            <div class="bd-head"><strong>${esc(x.name)}</strong><span>${x.count} adet · <b style="color:var(--text)">${money(x.total)}</b></span></div>
            <div class="bd-track"><div class="bd-fill" style="width:${(x.total / maxRow) * 100}%"></div></div>
          </div>`).join('')}</div>`
      : emptyBox('Kayıt yok', 'Seçilen dönemde işlem bulunmuyor.')}
  `;
}

/* ---------------- Ayarlar ---------------- */
function renderSettings() {
  const procs = [...db.procedures].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const lb = db.settings.lastBackup;
  const currencies = [['TRY', 'Türk lirası (₺)'], ['USD', 'ABD doları ($)'], ['EUR', 'Euro (€)'], ['GBP', 'İngiliz sterlini (£)']];

  main.innerHTML = `
    <div class="page-head"><h1>Ayarlar</h1></div>

    <section class="panel">
      <h2>İşlem türleri ve fiyatlar</h2>
      <p class="muted">İşlem eklerken bu listeden seçim yaparsınız. Fiyat değişiklikleri geçmiş kayıtları etkilemez.</p>
      <div class="proc-list">
        ${procs.length ? procs.map((p) => `
          <div class="proc-row">
            <div><strong>${esc(p.name)}</strong><span>${money(p.price)}</span></div>
            <button class="icon-btn" data-act="edit-proc" data-id="${p.id}" aria-label="Düzenle">${I.edit}</button>
            <button class="icon-btn danger-text" data-act="del-proc" data-id="${p.id}" aria-label="Sil">${I.trash}</button>
          </div>`).join('') : '<p class="muted">Henüz işlem türü eklenmedi. Aşağıdan ilk işleminizi ekleyin.</p>'}
      </div>
      <form id="procForm" class="inline-form" autocomplete="off">
        <input name="name" placeholder="İşlem adı (örn. Dolgu)" aria-label="İşlem adı">
        <input name="price" inputmode="decimal" placeholder="Fiyat" aria-label="Fiyat">
        <button class="primary" type="submit">Ekle</button>
      </form>
    </section>

    <section class="panel">
      <h2>Genel</h2>
      <label class="field"><span>Klinik / hekim adı (isteğe bağlı)</span>
        <input id="clinicName" value="${esc(db.settings.clinicName)}" placeholder="Örn. Dr. Ayşe Demir Kliniği"></label>
      <label class="field"><span>Para birimi</span>
        <select id="currency">${currencies.map(([k, l]) => `<option value="${k}" ${db.settings.currency === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </section>

    <section class="panel">
      <h2>Veriler ve yedekleme</h2>
      <p class="muted">Tüm veriler yalnızca bu cihazda saklanır, hiçbir sunucuya gönderilmez. Tarayıcı verileri silinirse veya cihaz değişirse kayıtlar kaybolabilir; düzenli yedek alın.</p>
      <div class="kv">
        <span>Hasta</span><b>${db.patients.length}</b>
        <span>İşlem kaydı</span><b>${db.visits.length}</b>
        <span>Son yedek</span><b>${lb ? esc(fmtLong(ymd(new Date(lb)))) : 'Hiç alınmadı'}</b>
      </div>
      <button class="secondary block" data-act="export-json">${I.download} Yedeği dışa aktar (.json)</button>
      <button class="secondary block" data-act="export-csv">${I.file} Excel için dışa aktar (.csv)</button>
      <button class="secondary block" data-act="import">${I.upload} Yedekten geri yükle</button>
      <input type="file" id="importFile" accept="application/json,.json" hidden>
      <hr>
      <button class="danger ghost block" data-act="wipe-records">${I.trash} Hasta ve işlem kayıtlarını sil</button>
      <button class="danger block" data-act="wipe-all">${I.trash} Tüm verileri sil (ayarlar dahil)</button>
    </section>
    <p class="muted footer">Clinicus · sürüm 1.0</p>
  `;
}

/* ---------------- Dialoglar ---------------- */
const sheet = $('#sheet');
let sheetHandlers = {};

function openSheet(html, handlers = {}) {
  sheet.innerHTML = html;
  sheetHandlers = handlers;
  if (!sheet.open) sheet.showModal();
  sheet.scrollTop = 0;
}
function closeSheet() { if (sheet.open) sheet.close(); }

sheet.addEventListener('click', (e) => {
  if (e.target === sheet) return closeSheet(); // arka plana tıklama
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.dataset.act === 'close') return closeSheet();
  if (el.dataset.act === 'open-visit') return openVisit(el.dataset.id);
  sheetHandlers[el.dataset.act]?.(el, e);
});
sheet.addEventListener('close', () => { sheet.innerHTML = ''; sheetHandlers = {}; });

function confirmBox({ title, message, ok = 'Onayla', danger = false, requireText = null }) {
  return new Promise((resolve) => {
    const d = $('#confirm');
    d.innerHTML = `
      <form method="dialog" class="confirm">
        <h3>${esc(title)}</h3>
        <p>${message}</p>
        ${requireText ? `<input id="confirmInput" autocomplete="off" placeholder="${esc(requireText)}" aria-label="Onay metni">` : ''}
        <div class="actions">
          <button value="cancel" class="ghost">Vazgeç</button>
          <button value="ok" id="confirmOk" class="${danger ? 'danger' : 'primary'}" ${requireText ? 'disabled' : ''}>${esc(ok)}</button>
        </div>
      </form>`;
    if (requireText) {
      const inp = $('#confirmInput', d);
      inp.addEventListener('input', () => { $('#confirmOk', d).disabled = inp.value.trim().toLocaleUpperCase('tr') !== requireText; });
    }
    d.returnValue = '';
    d.onclose = () => resolve(d.returnValue === 'ok');
    d.showModal();
  });
}

/* ---------------- İşlem (ziyaret) formu ---------------- */
function openVisit(id, preset = {}) {
  const v = id ? db.visits.find((x) => x.id === id) : null;
  if (id && !v) return;
  const origPatient = v ? getPatient(v.patientId) : preset.patientId ? getPatient(preset.patientId) : null;
  const items = v ? v.items.map((i) => ({ ...i })) : [];
  let notesTouched = false;

  const procs = [...db.procedures].sort((a, b) => a.name.localeCompare(b.name, 'tr'));

  openSheet(`
    <form id="visitForm" class="form" novalidate autocomplete="off">
      <header class="sheet-head">
        <h2>${v ? 'Kaydı düzenle' : 'İşlem ekle'}</h2>
        <button type="button" class="icon-btn" data-act="close" aria-label="Kapat">${I.x}</button>
      </header>

      <label class="field"><span>Hasta adı soyadı</span>
        <input name="name" list="patientNames" value="${esc(origPatient?.name || '')}" placeholder="Örn. Ayşe Yılmaz">
        <small class="hint" id="patientHint"></small>
      </label>
      <datalist id="patientNames">${db.patients.map((p) => `<option value="${esc(p.name)}"></option>`).join('')}</datalist>

      <div class="grid2">
        <label class="field"><span>Tarih</span><input type="date" name="date" value="${v?.date || preset.date || state.day}"></label>
        <label class="field"><span>Saat</span><input type="time" name="time" value="${v?.time || nowTime()}"></label>
      </div>

      <div class="field"><span>Yapılan işlemler</span>
        ${procs.length
          ? '<div class="chips pick" id="procPick"></div>'
          : `<p class="muted">Ayarlar'da henüz işlem türü tanımlanmadı. <button type="button" class="link-btn" data-act="go-settings">Ayarlara git</button> veya aşağıdan elle ekleyin.</p>`}
        <div class="items" id="itemList"></div>
        <button type="button" class="link-btn" data-act="custom-item">+ Listede olmayan işlem ekle</button>
      </div>

      <label class="field"><span>Tedavi notları</span>
        <textarea name="treatmentNotes" rows="3" placeholder="Uygulanan tedavi, kullanılan malzeme, kontrol tarihi…">${esc(v?.treatmentNotes || '')}</textarea></label>

      <label class="field"><span>Hasta kişiliği ile ilgili notlar</span>
        <textarea name="personalityNotes" rows="3" placeholder="İletişim tercihleri, kaygı düzeyi, hassasiyetler…">${esc(origPatient?.personalityNotes || '')}</textarea>
        <small class="hint">Bu not hastanın kartına kaydedilir ve tüm ziyaretlerinde görünür.</small></label>

      <div class="actions">
        ${v ? `<button type="button" class="danger ghost" data-act="delete-visit">${I.trash} Sil</button>` : ''}
        <button type="submit" class="primary">Kaydet</button>
      </div>
    </form>`, {
    'go-settings': () => { closeSheet(); setTab('settings'); },
    'toggle-proc': (el) => {
      const p = db.procedures.find((x) => x.id === el.dataset.id);
      if (p) items.push({ procedureId: p.id, name: p.name, price: p.price });
      drawItems();
    },
    'remove-item': (el) => { items.splice(+el.dataset.i, 1); drawItems(); },
    'custom-item': () => {
      items.push({ procedureId: null, name: '', price: 0 });
      drawItems();
      const inputs = sheet.querySelectorAll('[data-field="name"]');
      inputs[inputs.length - 1]?.focus();
    },
    'delete-visit': async () => {
      if (!(await confirmBox({ title: 'Kayıt silinsin mi?', message: 'Bu işlem kaydı kalıcı olarak silinecek.', ok: 'Sil', danger: true }))) return;
      db.visits = db.visits.filter((x) => x.id !== v.id);
      save();
      closeSheet();
      toast('Kayıt silindi');
      render();
    },
  });

  const form = $('#visitForm');
  const nameInput = form.elements.name;
  const notesInput = form.elements.personalityNotes;

  function drawItems() {
    const pick = $('#procPick');
    if (pick) {
      pick.innerHTML = procs.map((p) => {
        const n = items.filter((i) => i.procedureId === p.id).length;
        return `<button type="button" class="chip${n ? ' on' : ''}" data-act="toggle-proc" data-id="${p.id}">${esc(p.name)}${n > 1 ? ` <b>×${n}</b>` : ''}</button>`;
      }).join('');
    }
    $('#itemList').innerHTML = items.map((i, idx) => `
      <div class="item-row">
        ${i.procedureId
          ? `<span class="name-static">${esc(i.name)}</span>`
          : `<input data-field="name" data-i="${idx}" value="${esc(i.name)}" placeholder="İşlem adı">`}
        <input data-field="price" data-i="${idx}" inputmode="decimal" value="${i.price || ''}" placeholder="Ücret" aria-label="Ücret">
        <button type="button" class="icon-btn danger-text" data-act="remove-item" data-i="${idx}" aria-label="Kaldır">${I.x}</button>
      </div>`).join('') + (items.length ? `<div class="total-line"><span>Toplam</span><span id="itemsTotal">${money(sumItems())}</span></div>` : '');
  }
  const sumItems = () => items.reduce((s, i) => s + num(i.price), 0);

  $('#itemList').addEventListener('input', (e) => {
    const f = e.target.dataset.field;
    if (!f) return;
    items[+e.target.dataset.i][f] = e.target.value;
    const t = $('#itemsTotal');
    if (t) t.textContent = money(sumItems());
  });

  function updatePatientHint() {
    const name = cleanName(nameInput.value);
    const match = name ? findPatientByName(name) : null;
    const hint = $('#patientHint');
    if (match) {
      const count = db.visits.filter((x) => x.patientId === match.id).length;
      hint.textContent = `Kayıtlı hasta · ${count} ziyaret`;
      hint.className = 'hint ok';
    } else if (name) {
      hint.textContent = v && origPatient ? 'Hasta adı güncellenecek' : 'Yeni hasta kaydı oluşturulacak';
      hint.className = 'hint';
    } else {
      hint.textContent = '';
    }
    if (!notesTouched) {
      notesInput.value = match ? match.personalityNotes || '' : (v && origPatient ? origPatient.personalityNotes || '' : '');
    }
  }
  nameInput.addEventListener('input', updatePatientHint);
  notesInput.addEventListener('input', () => { notesTouched = true; });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = cleanName(nameInput.value);
    if (!name) { toast('Hasta adını girin'); nameInput.focus(); return; }
    const clean = items
      .map((i) => ({ procedureId: i.procedureId || null, name: cleanName(i.name), price: num(i.price) }))
      .filter((i) => i.name);
    if (!clean.length) { toast('En az bir işlem seçin'); return; }

    let patient = findPatientByName(name);
    if (!patient) {
      const origOnlyThisVisit = v && origPatient && db.visits.every((x) => x.patientId !== origPatient.id || x.id === v.id);
      if (origOnlyThisVisit) {
        origPatient.name = name; // yazım düzeltmesi
        patient = origPatient;
      } else {
        patient = { id: uid(), name, personalityNotes: '', createdAt: Date.now() };
        db.patients.push(patient);
      }
    }
    patient.personalityNotes = notesInput.value.trim();
    patient.updatedAt = Date.now();

    const data = {
      patientId: patient.id,
      date: form.elements.date.value || today(),
      time: form.elements.time.value || '',
      items: clean,
      treatmentNotes: form.elements.treatmentNotes.value.trim(),
      updatedAt: Date.now(),
    };
    if (v) Object.assign(v, data);
    else db.visits.push({ id: uid(), createdAt: Date.now(), ...data });

    if (!save()) return;
    closeSheet();
    toast(v ? 'Kayıt güncellendi' : 'İşlem kaydedildi');
    if (state.tab === 'home') state.day = data.date;
    render();
  });

  drawItems();
  updatePatientHint();
  if (!origPatient) setTimeout(() => nameInput.focus(), 50);
}

/* ---------------- Hasta kartı ---------------- */
function openPatient(id) {
  const p = id ? getPatient(id) : null;
  if (id && !p) return;
  const visits = p ? sortVisits(db.visits.filter((v) => v.patientId === p.id)) : [];
  const total = visits.reduce((s, v) => s + visitTotal(v), 0);

  openSheet(`
    <form id="patientForm" class="form" novalidate autocomplete="off">
      <header class="sheet-head">
        <h2>${p ? esc(p.name) : 'Yeni hasta'}</h2>
        <button type="button" class="icon-btn" data-act="close" aria-label="Kapat">${I.x}</button>
      </header>
      ${p ? `<div class="sheet-stats">${stat('Ziyaret', visits.length)}${stat('Toplam', money(total), true)}</div>` : ''}
      <label class="field"><span>Ad soyad</span><input name="name" value="${esc(p?.name || '')}" placeholder="Örn. Ayşe Yılmaz"></label>
      <label class="field"><span>Hasta kişiliği ile ilgili notlar</span>
        <textarea name="personalityNotes" rows="4" placeholder="İletişim tercihleri, kaygı düzeyi, hassasiyetler…">${esc(p?.personalityNotes || '')}</textarea></label>
      <div class="actions">
        ${p ? `<button type="button" class="danger ghost" data-act="delete-patient">${I.trash} Sil</button>` : ''}
        <button type="submit" class="primary">Kaydet</button>
      </div>
      ${p ? `
        <button type="button" class="secondary block" style="justify-content:center;margin-top:12px" data-act="add-visit-for">${I.plus} Bu hastaya işlem ekle</button>
        <h3 class="section-title">Geçmiş işlemler</h3>
        ${visits.length ? `<div class="list">${visits.map((v) => visitCard(v, { showDate: true, showName: false })).join('')}</div>` : emptyBox('Kayıt yok', 'Bu hastaya ait işlem bulunmuyor.')}
      ` : ''}
    </form>`, {
    'add-visit-for': () => openVisit(null, { patientId: p.id, date: today() }),
    'delete-patient': async () => {
      const ok = await confirmBox({
        title: 'Hasta silinsin mi?',
        message: `<b>${esc(p.name)}</b> ve bu hastaya ait <b>${visits.length}</b> işlem kaydı kalıcı olarak silinecek.`,
        ok: 'Sil', danger: true,
      });
      if (!ok) return;
      db.patients = db.patients.filter((x) => x.id !== p.id);
      db.visits = db.visits.filter((x) => x.patientId !== p.id);
      save();
      closeSheet();
      toast('Hasta silindi');
      render();
    },
  });

  const form = $('#patientForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = cleanName(form.elements.name.value);
    if (!name) { toast('Hasta adını girin'); return; }
    const other = findPatientByName(name);
    if (other && other !== p) { toast('Bu isimde kayıtlı bir hasta zaten var'); return; }
    const notes = form.elements.personalityNotes.value.trim();
    if (p) Object.assign(p, { name, personalityNotes: notes, updatedAt: Date.now() });
    else db.patients.push({ id: uid(), name, personalityNotes: notes, createdAt: Date.now(), updatedAt: Date.now() });
    save();
    closeSheet();
    toast('Hasta kaydedildi');
    render();
  });
  if (!p) setTimeout(() => form.elements.name.focus(), 50);
}

/* ---------------- İşlem türü düzenleme ---------------- */
function openProcedure(id) {
  const p = db.procedures.find((x) => x.id === id);
  if (!p) return;
  openSheet(`
    <form id="procEditForm" class="form" novalidate autocomplete="off">
      <header class="sheet-head"><h2>İşlem türünü düzenle</h2>
        <button type="button" class="icon-btn" data-act="close" aria-label="Kapat">${I.x}</button></header>
      <label class="field"><span>İşlem adı</span><input name="name" value="${esc(p.name)}"></label>
      <label class="field"><span>Fiyat</span><input name="price" inputmode="decimal" value="${p.price}"></label>
      <small class="hint">Yeni fiyat sadece bundan sonraki kayıtlarda kullanılır.</small>
      <div class="actions"><button type="submit" class="primary">Kaydet</button></div>
    </form>`);
  const form = $('#procEditForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = cleanName(form.elements.name.value);
    if (!name) { toast('İşlem adını girin'); return; }
    if (db.procedures.some((x) => x !== p && norm(x.name) === norm(name))) { toast('Bu isimde bir işlem zaten var'); return; }
    p.name = name;
    p.price = num(form.elements.price.value);
    save();
    closeSheet();
    toast('İşlem güncellendi');
    render();
  });
}

/* ---------------- Dışa / içe aktarma ---------------- */
async function deliverFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  // Mobilde paylaşım menüsü (Drive, WhatsApp, Dosyalar…) daha kullanışlı
  const file = typeof File === 'function' ? new File([blob], filename, { type: mime }) : null;
  if (file && matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return false;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

async function exportJson() {
  const payload = { app: 'clinicus', exportedAt: new Date().toISOString(), ...db };
  const ok = await deliverFile(`clinicus-yedek-${today()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  if (!ok) return;
  db.settings.lastBackup = Date.now();
  save();
  toast('Yedek oluşturuldu');
  render();
}

async function exportCsv() {
  const cell = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows = [['Tarih', 'Saat', 'Hasta', 'İşlem', 'Ücret', 'Tedavi notları', 'Hasta notları']];
  for (const v of sortVisits([...db.visits]).reverse()) {
    const p = getPatient(v.patientId);
    for (const i of v.items) {
      rows.push([v.date, v.time, p?.name || '', i.name, String(i.price).replace('.', ','), v.treatmentNotes, p?.personalityNotes || '']);
    }
  }
  // Türkçe Excel ayırıcı olarak ";" bekler; BOM ile UTF-8 karakterler doğru görünür
  const csv = '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
  if (await deliverFile(`clinicus-kayitlar-${today()}.csv`, csv, 'text/csv;charset=utf-8')) toast('CSV oluşturuldu');
}

async function importJson(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    toast('Dosya okunamadı: geçerli bir JSON değil');
    return;
  }
  if (!data || !Array.isArray(data.procedures) || !Array.isArray(data.patients) || !Array.isArray(data.visits)) {
    toast('Bu dosya bir Clinicus yedeği değil');
    return;
  }
  const ok = await confirmBox({
    title: 'Yedek geri yüklensin mi?',
    message: `Yedekte <b>${data.patients.length}</b> hasta ve <b>${data.visits.length}</b> işlem kaydı var. Bu cihazdaki <b>mevcut tüm veriler</b> yedekteki verilerle değiştirilecek.`,
    ok: 'Geri yükle', danger: true,
  });
  if (!ok) return;
  const { app, exportedAt, ...rest } = data;
  db = Store.normalize(rest);
  save();
  toast('Yedek geri yüklendi');
  render();
}

/* ---------------- Olaylar ---------------- */
document.querySelector('.nav').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b) setTab(b.dataset.tab);
});

main.addEventListener('click', async (e) => {
  if (e.target.id === 'dayPicker') { try { e.target.showPicker(); } catch {} return; }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const id = el.dataset.id;
  switch (el.dataset.act) {
    case 'prev-day': state.day = addDays(state.day, -1); render(); break;
    case 'next-day': state.day = addDays(state.day, 1); render(); break;
    case 'go-today': state.day = today(); render(); break;
    case 'add-visit': openVisit(null, { date: state.day }); break;
    case 'open-visit': openVisit(id); break;
    case 'open-patient': openPatient(id); break;
    case 'new-patient': openPatient(null); break;
    case 'period': state.period = id; state.offset = 0; render(); break;
    case 'prev-period': state.offset--; render(); break;
    case 'next-period': if (state.offset < 0) { state.offset++; render(); } break;
    case 'edit-proc': openProcedure(id); break;
    case 'del-proc': {
      const p = db.procedures.find((x) => x.id === id);
      if (p && await confirmBox({ title: 'İşlem türü silinsin mi?', message: `<b>${esc(p.name)}</b> listeden kaldırılacak. Geçmiş kayıtlar etkilenmez.`, ok: 'Sil', danger: true })) {
        db.procedures = db.procedures.filter((x) => x.id !== id);
        save();
        render();
      }
      break;
    }
    case 'export-json': exportJson(); break;
    case 'export-csv': exportCsv(); break;
    case 'import': $('#importFile').click(); break;
    case 'wipe-records': {
      const ok = await confirmBox({
        title: 'Kayıtlar silinsin mi?',
        message: `Tüm hastalar ve işlem kayıtları <b>kalıcı olarak</b> silinecek. İşlem türleri ve ayarlar korunur. Önce yedek almanız önerilir.<br><br>Onaylamak için <b>SİL</b> yazın.`,
        ok: 'Kalıcı olarak sil', danger: true, requireText: 'SİL',
      });
      if (!ok) return;
      db.patients = [];
      db.visits = [];
      save();
      toast('Kayıtlar silindi');
      render();
      break;
    }
    case 'wipe-all': {
      const ok = await confirmBox({
        title: 'Tüm veriler silinsin mi?',
        message: `Hastalar, işlem kayıtları, işlem türleri ve ayarlar dahil <b>her şey kalıcı olarak</b> silinecek. Önce yedek almanız önerilir.<br><br>Onaylamak için <b>SİL</b> yazın.`,
        ok: 'Her şeyi sil', danger: true, requireText: 'SİL',
      });
      if (!ok) return;
      db = Store.empty();
      save();
      toast('Tüm veriler silindi');
      render();
      break;
    }
  }
});

main.addEventListener('input', (e) => {
  if (e.target.id === 'patientSearch') { state.search = e.target.value; renderPatientList(); }
});

main.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'dayPicker' && t.value) { state.day = t.value; render(); }
  else if (t.id === 'fromDate' && t.value) { state.from = t.value; render(); }
  else if (t.id === 'toDate' && t.value) { state.to = t.value; render(); }
  else if (t.id === 'currency') { db.settings.currency = t.value; save(); toast('Para birimi güncellendi'); }
  else if (t.id === 'clinicName') { db.settings.clinicName = t.value.trim(); save(); $('#clinicLabel').textContent = db.settings.clinicName; toast('Kaydedildi'); }
  else if (t.id === 'importFile' && t.files[0]) { importJson(t.files[0]); t.value = ''; }
});

main.addEventListener('submit', (e) => {
  if (e.target.id !== 'procForm') return;
  e.preventDefault();
  const f = e.target.elements;
  const name = cleanName(f.name.value);
  if (!name) { toast('İşlem adını girin'); f.name.focus(); return; }
  if (db.procedures.some((x) => norm(x.name) === norm(name))) { toast('Bu isimde bir işlem zaten var'); return; }
  db.procedures.push({ id: uid(), name, price: num(f.price.value) });
  save();
  render();
  toast('İşlem türü eklendi');
  $('#procForm input[name=name]')?.focus();
});

// Başka sekmede değişiklik olursa güncel veriyi al
window.addEventListener('storage', () => { db = Store.load(); render(); });

/* ---------------- Başlat ---------------- */
if (!db.procedures.length && !db.visits.length) state.tab = 'settings';
render();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
