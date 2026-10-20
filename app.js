/* Lsan — anglais et darija, une séance par jour. */
(function () {
'use strict';

/* ---------- Petits outils ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
const digits = html => html.replace(/(?<![0-9])([379])(?=[a-zA-Z])|(?<=[a-zA-Z])([379])(?![0-9])/g, (m) => `<span class="dg">${m}</span>`);
const T = (lang, s) => lang === 'dj' ? digits(esc(s)) : esc(s);       /* texte dans la langue étudiée */
const M = (lang, s) => lang === 'dj' ? digits(md(s)) : md(s);         /* texte riche (règles) */
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = a => a[Math.floor(Math.random() * a.length)];
const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const mondayOf = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const fmtMin = sec => Math.round(sec / 60);
const fmtClock = sec => `${Math.floor(sec / 60)}:${pad(Math.floor(sec % 60))}`;
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").replace(/[?!.,;:…«»"()]/g, ' ').replace(/\s+/g, ' ').trim();
function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[n];
}
const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>'
};
const LANGS = { en: 'Anglais', dj: 'Darija' };
const GOAL_HOURS = { en: 700, dj: 350 };     /* ordre de grandeur pour 900 au TOEIC / aisance en darija */
const GOAL_TEXT = { en: '900 au TOEIC', dj: 'darija courant' };
const OREILLE_CAP = 420 * 60;                /* le gain plafonne vers 7 h d'entraînement */

/* Voix (doivent correspondre à tools/generate_audio.py) */
const EN_MAIN = [6, 1], EN_VARIED = [1, 3, 5, 6, 7, 9], EN_DIAL = { A: 3, B: 5 };

/* ---------- Stockage ---------- */
const KEY = 'lsan.v1';
const blankLang = () => ({ cards: {}, days: {}, lesson: {}, quiz: {}, placement: null, oreilleSec: 0, flags: {} });
let S;
function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { s = null; }
  if (!s || s.v !== 1) s = { v: 1, lang: 'en', start: null, unlockAll: { en: false, dj: false }, L: { en: blankLang(), dj: blankLang() } };
  for (const l of ['en', 'dj']) s.L[l] = Object.assign(blankLang(), s.L[l] || {});
  return s;
}
let saveTimer = null;
function save(now) {
  clearTimeout(saveTimer);
  const go = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast("Impossible d'enregistrer la progression sur cet appareil."); } };
  if (now) go(); else saveTimer = setTimeout(go, 300);
}

/* ---------- Contenu et audio ---------- */
const C = {}, AUDIO = {};
async function loadContent() {
  for (const l of ['en', 'dj']) {
    const [c, a] = await Promise.all([
      fetch(`content/${l}.json`).then(r => r.json()),
      fetch(`audio/${l}/index.json`).then(r => r.ok ? r.json() : {}).catch(() => ({}))
    ]);
    C[l] = c; AUDIO[l] = a;
    c.items = {};
    for (const w of c.weeks) w.items.forEach((it, i) => {
      it.key = `${l}${w.n}-${slug(it.t)}`; it.week = w.n; it.i = i;
      c.items[it.key] = it;
    });
  }
}
function src(lang, sid, text) { const f = AUDIO[lang][`${sid}|${text}`]; return f ? `audio/${lang}/${f}` : null; }
const A = {
  word: (lang, it) => lang === 'en' ? src('en', EN_MAIN[it.i % 2], it.t) : src('dj', 0, it.ar),
  ex: (lang, it) => lang === 'en' ? (it.ex ? src('en', EN_MAIN[(it.i + 1) % 2], it.ex) : null) : (it.exAr ? src('dj', 0, it.exAr) : null),
  line: (lang, l) => lang === 'en' ? src('en', EN_DIAL[l.s], l.t) : src('dj', 0, l.ar),
  varied: (word) => src('en', pick(EN_VARIED), word),
  model: (lang, t) => lang === 'en' ? src('en', EN_MAIN[0], t) : null
};
const player = new Audio();
let playingBtn = null;
function play(url, btn) {
  return new Promise(res => {
    if (!url) { res(false); return; }
    if (playingBtn) playingBtn.classList.remove('playing');
    player.pause(); player.src = url; playingBtn = btn || null;
    if (btn) btn.classList.add('playing');
    const done = ok => { player.onended = player.onerror = null; if (btn) btn.classList.remove('playing'); res(ok); };
    player.onended = () => done(true); player.onerror = () => done(false);
    player.play().catch(() => done(false));
  });
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const playBtn = (url, cls = '') => url ? `<button class="play ${cls}" data-src="${esc(url)}" aria-label="Écouter">${ICON.play}</button>` : '';
document.addEventListener('click', e => {
  const b = e.target.closest('[data-src]');
  if (b) { e.preventDefault(); play(b.dataset.src, b); act(); }
});

/* ---------- Semaines et cartes ---------- */
function startDate() { return S.start ? parseYmd(S.start) : mondayOf(new Date()); }
function weekOpensOn(n) { const d = new Date(startDate()); d.setDate(d.getDate() + 7 * (n - 1)); return d; }
function unlockedWeeks(lang) {
  const all = C[lang].weeks;
  if (S.unlockAll[lang]) return all;
  const now = new Date();
  return all.filter(w => weekOpensOn(w.n) <= now);
}
function currentWeek(lang) { const u = unlockedWeeks(lang); return u[u.length - 1] || C[lang].weeks[0]; }
function isNew(lang, w) { return !S.L[lang].lesson[w.n]; }
const L = () => S.L[S.lang];

function cardsOf(lang) { return S.L[lang].cards; }
function addCards(lang, items) {
  const now = Date.now(), cards = cardsOf(lang);
  for (const it of items) {
    if (!cards[it.key + ':r']) cards[it.key + ':r'] = FSRS.newCard(now);
    if (!cards[it.key + ':p']) cards[it.key + ':p'] = FSRS.newCard(now + FSRS.DAY / 2);
  }
  save();
}
function dueCards(lang, horizon = 0) {
  const now = Date.now() + horizon, cards = cardsOf(lang);
  return Object.keys(cards).filter(k => cards[k].due <= now && C[lang].items[k.split(':')[0]]).sort((a, b) => cards[a].due - cards[b].due);
}
function memorized(lang) {
  const cards = cardsOf(lang), items = new Set();
  for (const k in cards) if (cards[k].state === 'review' && cards[k].s >= 21) items.add(k.split(':')[0]);
  return items.size;
}
function studied(lang) { return new Set(Object.keys(cardsOf(lang)).map(k => k.split(':')[0])).size; }

/* ---------- Temps passé ---------- */
function day(lang, d = today()) { const D = S.L[lang].days; return D[d] || (D[d] = { sec: 0, steps: {} }); }
let lastAct = Date.now();
function act() { lastAct = Date.now(); }
document.addEventListener('pointerdown', act); document.addEventListener('keydown', act);
setInterval(() => {
  if (!sess || document.hidden) return;
  if (Date.now() - lastAct > 120000 && player.paused) return;     /* inactif depuis 2 min : on ne compte plus */
  sess.sec++; day(sess.lang).sec++;
  if (sess.inOreille) S.L[sess.lang].oreilleSec++;
  const c = $('.clock'); if (c) c.textContent = fmtClock(sess.sec);
  if (sess.sec % 15 === 0) save();
}, 1000);
function streak(lang) {
  let n = 0; const d = new Date();
  if (!(S.L[lang].days[ymd(d)] || {}).sec) d.setDate(d.getDate() - 1);
  while ((S.L[lang].days[ymd(d)] || {}).sec >= 300) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function totalSec(lang) { return Object.values(S.L[lang].days).reduce((a, d) => a + (d.sec || 0), 0); }

/* ---------- Rendu général ---------- */
const app = $('#app');
let view = { tab: 'today' };
let sess = null;
function setLang(l) {
  S.lang = l; document.body.dataset.lang = l; save();
  $('meta[name="theme-color"]').setAttribute('content', l === 'en' ? '#2F5D8C' : '#1E7457');
  $$('.switch button').forEach(b => b.setAttribute('aria-selected', b.dataset.switch === l));
}
$$('.switch button').forEach(b => b.addEventListener('click', () => {
  if (sess && !confirm('Quitter la séance en cours ?')) return;
  endSession(); setLang(b.dataset.switch); go('today');
}));
$$('.tabs button').forEach(b => b.addEventListener('click', () => go(b.dataset.tab)));
function go(tab, extra) { view = Object.assign({ tab }, extra || {}); render(); window.scrollTo(0, 0); }
function render() {
  document.body.classList.toggle('in-session', !!sess);
  const tabOf = { lesson: 'lessons', quiz: 'lessons', placement: 'today' }[view.tab] || view.tab;
  $$('.tabs button').forEach(b => { if (b.dataset.tab === tabOf) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  if (sess) return renderSession();
  if (!S.start) return renderWelcome();
  ({ today: renderToday, lessons: renderLessons, lesson: renderLessonPage, review: renderReviewTab, progress: renderProgress, placement: renderPlacement, quiz: renderQuiz })[view.tab]();
}
function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2800);
}

/* ---------- Accueil (premier lancement) ---------- */
function renderWelcome() {
  const mon = mondayOf(new Date());
  app.innerHTML = `<div class="stack">
    <h1>Bienvenue</h1>
    <p>Chaque jour, une séance de 45 minutes par langue. Une nouvelle leçon s'ouvre chaque lundi, et la révision espacée fait revenir chaque mot juste avant que tu l'oublies.</p>
    <div class="panel stack-s">
      <label class="field"><span>Début du programme (semaine 1)</span><input type="date" id="start" value="${ymd(mon)}"></label>
      <p class="muted small">La semaine 1 s'ouvre ce jour-là, puis une semaine de plus chaque lundi.</p>
    </div>
    <p class="callout">Fais l'anglais et le darija dans deux séances séparées, par exemple l'un le matin et l'autre le soir. Mélanger les deux à la suite gêne la mémorisation.</p>
    <button class="btn block" id="go">Commencer</button>
  </div>`;
  $('#go').onclick = () => { S.start = ymd(mondayOf(parseYmd($('#start').value || ymd(mon)))); save(true); go('today'); };
}

/* ---------- Aujourd'hui ---------- */
const STEP_INFO = {
  review: { name: 'Réviser', min: 10, detail: 'Les mots du jour, en rappel actif' },
  lesson: { name: 'Leçon', min: 10, detail: '' },
  listen: { name: 'Écouter', min: 12, detail: '' },
  speak: { name: 'Parler', min: 13, detail: 'Production, puis fluidité' }
};
function lessonDetail(lang, w) {
  if (new Date().getDay() === 0 && S.L[lang].lesson[w.n]) return `Bilan de la semaine ${w.n}`;
  return isNew(lang, w) ? `Nouvelle leçon : ${w.title}` : `Exercices : ${w.title}`;
}
function listenDetail(lang, w) {
  const parts = [];
  if (S.L[lang].oreilleSec < OREILLE_CAP) parts.push(`Oreille : ${w.oreille.title.replace(/\*/g, '')}`);
  parts.push('dialogue et shadowing');
  if (w.toeic) parts.push('TOEIC');
  return parts.join(', ');
}
function renderToday() {
  const lang = S.lang, l = L(), w = currentWeek(lang), d = day(lang);
  const due = dueCards(lang).length, done = d.steps || {};
  const steps = ['review', 'lesson', 'listen', 'speak'];
  const next = steps.find(s => !done[s]);
  const opens = weekOpensOn(1);
  const notYet = opens > new Date() && !S.unlockAll[lang];
  const showPlacement = lang === 'en' && !l.placement;
  app.innerHTML = `<div class="stack">
    <div class="row between wrap">
      <span class="week-tag">${notYet ? `Le programme commence le ${opens.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` : `Semaine ${w.n} · ${esc(w.title)}`} ${!notYet && isNew(lang, w) ? '<span class="new">Nouveau</span>' : ''}</span>
    </div>
    <section class="panel stack">
      <div class="row between">
        <div class="day-total"><span class="n">${fmtMin(d.sec)}</span><span class="muted">min aujourd'hui sur 45</span></div>
      </div>
      <div class="meter" aria-hidden="true"><span style="width:${Math.min(100, d.sec / 27)}%"></span></div>
      <ol class="path">
        ${steps.map((s, i) => `<li class="${done[s] ? 'done' : s === next ? 'current' : ''}">
          <span class="dot">${done[s] ? '✓' : i + 1}</span>
          <div><div class="what">${STEP_INFO[s].name}</div><div class="detail">${esc(s === 'lesson' ? lessonDetail(lang, w) : s === 'listen' ? listenDetail(lang, w) : s === 'review' ? `${due} carte${due > 1 ? 's' : ''} à revoir` : STEP_INFO[s].detail)}</div></div>
          <span class="min">${STEP_INFO[s].min} min</span></li>`).join('')}
      </ol>
      ${notYet ? '' : `<button class="btn block" id="start">${next ? (Object.keys(done).length ? 'Reprendre la séance' : 'Commencer la séance') : 'Refaire une séance'}</button>
      <button class="btn ghost block" id="short">Version courte (20 min) : réviser et écouter</button>`}
    </section>
    ${showPlacement ? `<section class="panel stack-s"><h2>Test de niveau</h2><p class="muted">30 questions, environ 15 minutes. Il dit si tu peux avancer plus vite dans les premières semaines.</p><button class="btn ghost" id="placement">Passer le test</button></section>` : ''}
    <p class="muted small">${lang === 'en' ? "Fais le darija dans une autre séance, pas juste après." : "Fais l'anglais dans une autre séance, pas juste avant."} Série : ${streak(lang)} jour${streak(lang) > 1 ? 's' : ''} d'affilée.</p>
  </div>`;
  if (!notYet) {
    $('#start').onclick = () => startSession(lang, false);
    $('#short').onclick = () => startSession(lang, true);
  }
  if (showPlacement) $('#placement').onclick = () => go('placement');
}

/* ---------- Séance ---------- */
function startSession(lang, short) {
  const done = day(lang).steps || {};
  let steps = short ? ['review', 'listen'] : ['review', 'lesson', 'listen', 'speak'];
  const remaining = steps.filter(s => !done[s]);
  if (remaining.length) steps = remaining;
  sess = { lang, steps, i: 0, sec: 0, week: currentWeek(lang), sub: null };
  act(); enterStep();
}
function endSession() { if (sess) { save(true); sess = null; player.pause(); } }
function enterStep() {
  const s = sess.steps[sess.i];
  sess.sub = null; sess.inOreille = false;
  if (s === 'review') sess.sub = { kind: 'review', queue: dueCards(sess.lang), seen: 0, ok: 0 };
  if (s === 'lesson') sess.sub = lessonPlan();
  if (s === 'listen') sess.sub = { kind: 'listen', parts: listenParts(), p: 0 };
  if (s === 'speak') sess.sub = { kind: 'speak', phase: 'prod' };
  render();
}
function nextStep() {
  const s = sess.steps[sess.i];
  if (!sess.free) { day(sess.lang).steps[s] = true; save(); }
  sess.i++;
  if (sess.i >= sess.steps.length) { const lang = sess.lang, sec = sess.sec; sess = null; save(true); renderDone(lang, sec); return; }
  enterStep();
}
function renderDone(lang, sec) {
  document.body.classList.remove('in-session');
  const d = day(lang);
  app.innerHTML = `<div class="stack">
    <h1>Séance terminée</h1>
    <p>${fmtMin(sec)} minutes cette fois, ${fmtMin(d.sec)} aujourd'hui en ${LANGS[lang].toLowerCase()}.</p>
    <p class="callout">${lang === 'en' ? 'Le darija, ce sera pour une autre séance plus tard dans la journée.' : "L'anglais, ce sera pour une autre séance, à un autre moment de la journée."}</p>
    <button class="btn block" id="home">Retour à l'accueil</button>
  </div>`;
  $('#home').onclick = () => go('today');
}
function sessHeader(title) {
  return `<div class="sess-head">
    <button class="close" id="quit" aria-label="Quitter la séance">${ICON.close}</button>
    <div class="steps">${sess.steps.map((s, i) => `<span class="${i < sess.i ? 'done' : i === sess.i ? 'on' : ''}"></span>`).join('')}</div>
    <span class="clock">${fmtClock(sess.sec)}</span>
  </div><p class="step-title">${esc(title)}</p>`;
}
function bindQuit() { $('#quit').onclick = () => { endSession(); go('today'); }; }
function renderSession() {
  const k = sess.sub.kind;
  ({ review: renderReviewStep, lesson: renderLessonStep, listen: renderListenStep, speak: renderSpeakStep, quiz: renderLessonStep })[k]();
}

/* ----- Étape : réviser ----- */
function renderReviewStep() {
  const r = sess.sub, lang = sess.lang;
  const now = Date.now(), cards = cardsOf(lang);
  /* cartes en apprentissage revenues à échéance */
  r.queue = r.queue.filter(k => cards[k]);
  if (!r.queue.length) {
    const soon = dueCards(lang, 10 * 60000).filter(k => cards[k].state !== 'review' && cards[k].state !== 'new');
    if (soon.length && r.seen) r.queue = soon;
  }
  if (!r.queue.length) {
    app.innerHTML = `${sessHeader(r.title || 'Réviser')}<div class="stack" style="margin-top:16px">
      <h2>${r.seen ? 'Révision terminée' : 'Rien à revoir pour le moment'}</h2>
      <p class="muted">${r.seen ? `${r.ok} sur ${r.seen} réussies du premier coup.` : 'Les mots de la leçon arrivent ici dès que tu les as vus.'}</p>
      <button class="btn block" id="next">Continuer</button></div>`;
    bindQuit(); $('#next').onclick = () => r.onDone ? r.onDone() : nextStep(); return;
  }
  const key = r.queue[0], [ik, dir] = key.split(':'), it = C[lang].items[ik], card = cards[key];
  const prev = FSRS.preview(card, now);
  const isProd = dir === 'p';
  app.innerHTML = `${sessHeader(r.title || 'Réviser')}
  <div class="card" style="margin-top:12px">
    <p class="ask">${isProd ? `Comment dit-on en ${LANGS[lang].toLowerCase()} ?` : 'Que veut dire ?'} <span class="muted">· ${r.queue.length} restante${r.queue.length > 1 ? 's' : ''}</span></p>
    ${isProd ? `<p class="prompt fr">${esc(it.fr)}</p>` : `<div class="row">${playBtn(A.word(lang, it))}<p class="prompt">${T(lang, it.t)}</p></div>${lang === 'dj' ? `<p class="ar" lang="ar" style="font-size:1.4rem">${esc(it.ar)}</p>` : ''}`}
    <div id="zone">
      ${isProd ? `<form id="f" class="stack-s"><input class="typed" id="typed" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Tape la réponse, ou dis-la à voix haute"><button class="btn block" type="submit">Vérifier</button></form>`
               : `<button class="btn block" id="show">Afficher la réponse</button>`}
    </div>
  </div>`;
  bindQuit();
  const reveal = (typed) => {
    let verdict = '';
    let sugg = 3;
    if (isProd && typed != null) {
      const g = grade(lang, it, typed);
      if (typed.trim() === '') { verdict = ''; }
      else if (g === 2) verdict = '<p class="verdict ok">Juste</p>';
      else if (g === 1) verdict = '<p class="verdict ok">Presque : regarde l\'orthographe</p>';
      else { verdict = '<p class="verdict ko">Pas tout à fait</p>'; sugg = 1; }
    }
    $('#zone').innerHTML = `<div class="answer stack-s">
      ${verdict}
      ${isProd ? `<div class="row">${playBtn(A.word(lang, it))}<div><p class="t">${T(lang, it.t)}</p>${lang === 'dj' ? `<p class="ar" lang="ar">${esc(it.ar)}</p>` : ''}</div></div>` : `<p class="t" style="font-weight:600">${esc(it.fr)}</p>`}
      ${it.ex ? `<div class="row">${playBtn(A.ex(lang, it))}<p class="ex">${T(lang, it.ex)}<br>${esc(it.exFr || '')}</p></div>` : ''}
      ${it.msa ? `<p class="ex">${md(it.msa)}</p>` : ''}
      ${lang === 'dj' ? `<button class="linkbtn" id="flag">${S.L.dj.flags[it.key] ? 'Audio signalé comme douteux' : 'Audio douteux ?'}</button>` : ''}
    </div>
    <p class="muted small" style="margin:14px 0 6px">${isProd ? 'Note ta réponse honnêtement :' : 'Avais-tu trouvé le sens ?'}</p>
    <div class="rate">${[[1, 'À revoir'], [2, 'Difficile'], [3, 'Bien'], [4, 'Facile']].map(([g, n]) => `<button data-g="${g}" ${g === sugg && verdict ? 'style="outline:2px solid currentColor"' : ''}>${n}<small>${prev[g]}</small></button>`).join('')}</div>`;
    if (isProd) play(A.word(lang, it));
    const fl = $('#flag'); if (fl) fl.onclick = () => { S.L.dj.flags[it.key] = !S.L.dj.flags[it.key]; save(); fl.textContent = S.L.dj.flags[it.key] ? 'Audio signalé comme douteux' : 'Audio douteux ?'; };
    $$('.rate button').forEach(b => b.onclick = () => rate(+b.dataset.g));
  };
  const rate = g => {
    const c = FSRS.review(card, g, Date.now());
    cards[key] = c; save();
    r.seen++; if (g >= 3 && !r.again?.[key]) r.ok++;
    r.queue.shift();
    if (c.due - Date.now() < 15 * 60000) { r.again = r.again || {}; r.again[key] = 1; r.queue.splice(Math.min(3, r.queue.length), 0, key); }
    renderReviewStep();
  };
  if (isProd) {
    $('#f').onsubmit = e => { e.preventDefault(); reveal($('#typed').value); };
    setTimeout(() => $('#typed') && $('#typed').focus({ preventScroll: true }), 50);
  } else {
    play(A.word(lang, it), $('.card .play'));
    $('#show').onclick = () => reveal(null);
  }
}
function grade(lang, it, typed) {
  const t = norm(typed);
  const strip = s => lang === 'en' ? s.replace(/^to /, '').replace(/…/g, '').trim() : s.replace(/…/g, '').trim();
  const answers = [it.t, ...(it.alt || [])].map(a => strip(norm(a)));
  const tt = strip(t);
  if (answers.includes(tt)) return 2;
  if (answers.some(a => a.length >= 4 && lev(a, tt) <= (a.length >= 8 ? 2 : 1))) return 1;
  return 0;
}

/* ----- Étape : leçon ----- */
function lessonPlan() {
  const lang = sess.lang, w = sess.week;
  if (isNew(lang, w)) return { kind: 'lesson', mode: 'learn', w, page: 'rule' };
  if (new Date().getDay() === 0) return quizPlan(lang, w, true);
  return { kind: 'lesson', mode: 'drill', w, list: shuffle(w.drills).slice(0, 6), j: 0, ok: 0 };
}
function lessonBody(lang, w) {
  return `<div class="lesson">${w.rule.map(b => b.h ? `<h3>${M(lang, b.h)}</h3>` : b.p ? `<p>${M(lang, b.p)}</p>` : b.table ? `<table>${b.table.map(r => `<tr>${r.map((c, i) => `<td${/[؀-ۿ]/.test(c) ? ' lang="ar" class="ar"' : ''}>${M(lang, c)}</td>`).join('')}</tr>`).join('')}</table>` : '').join('')}</div>`;
}
function wordList(lang, items) {
  return `<ul class="words">${items.map(it => `<li>${playBtn(A.word(lang, it))}<div class="grow"><div class="t">${T(lang, it.t)} ${lang === 'dj' ? `<span class="ar" lang="ar">${esc(it.ar)}</span>` : ''}</div><div class="fr">${esc(it.fr)}</div>${it.ex ? `<div class="fr">${T(lang, it.ex)}</div>` : ''}${it.msa ? `<div class="note">${md(it.msa)}</div>` : ''}</div>${it.ex ? playBtn(A.ex(lang, it)) : ''}</li>`).join('')}</ul>`;
}
function renderLessonStep() {
  const r = sess.sub, lang = sess.lang, w = r.w;
  if (r.kind === 'quiz') return renderQuizInSession();
  if (r.mode === 'learn') {
    if (r.page === 'rule') {
      app.innerHTML = `${sessHeader(`Leçon · semaine ${w.n}`)}<div class="stack" style="margin-top:12px"><h1>${esc(w.title)}</h1>${lessonBody(lang, w)}
        ${w.faux ? `<h3 style="margin-top:22px">Faux amis</h3><ul class="words">${w.faux.map(f => `<li>${playBtn(src('en', EN_MAIN[0], f.t))}<div><div class="t">${esc(f.t)}</div><div class="fr">${md(f.fr)}</div></div></li>`).join('')}</ul>` : ''}
        <button class="btn block" id="next">Voir les mots de la semaine</button></div>`;
      bindQuit(); $('#next').onclick = () => { r.page = 'words'; render(); window.scrollTo(0, 0); };
    } else if (r.page === 'words') {
      app.innerHTML = `${sessHeader(`Leçon · semaine ${w.n}`)}<div class="stack" style="margin-top:12px"><h2>${w.items.length} ${lang === 'en' ? 'mots et expressions' : 'expressions'}</h2>
        <p class="muted">Écoute chacun et répète-le à voix haute. Ensuite, un premier passage en rappel actif.</p>
        ${wordList(lang, w.items)}
        <button class="btn block" id="next">Ajouter à mes révisions et m'entraîner</button></div>`;
      bindQuit();
      $('#next').onclick = () => {
        addCards(lang, w.items);
        S.L[lang].lesson[w.n] = today(); save();
        const sub = { kind: 'review', title: 'Premier passage', queue: shuffle(w.items.map(it => it.key + ':r')), seen: 0, ok: 0 };
        sub.onDone = () => { sess.sub = { kind: 'lesson', mode: 'drill', w, list: shuffle(w.drills).slice(0, 6), j: 0, ok: 0, after: true }; render(); };
        sess.sub = sub; render(); window.scrollTo(0, 0);
      };
    }
    return;
  }
  /* exercices de grammaire */
  if (r.j >= r.list.length) {
    app.innerHTML = `${sessHeader('Exercices')}<div class="stack" style="margin-top:16px"><h2>${r.ok} sur ${r.list.length}</h2>
      <p class="muted">${r.ok === r.list.length ? 'Tout juste.' : 'Relis la règle de la semaine si une erreur revient.'}</p>
      <button class="btn block" id="next">Continuer</button></div>`;
    bindQuit(); $('#next').onclick = nextStep; return;
  }
  const d = r.list[r.j];
  app.innerHTML = `${sessHeader(`Exercices · semaine ${w.n}`)}
    <div class="card" style="margin-top:12px">
      <p class="ask">Complète · ${r.j + 1} sur ${r.list.length}</p>
      <p class="prompt fr" style="font-size:1.35rem">${T(lang, d.q)}</p>
      <form id="f" class="stack-s"><input class="typed" id="typed" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Ta réponse"><button class="btn block" type="submit">Vérifier</button></form>
      <div id="fb"></div>
    </div>`;
  bindQuit();
  setTimeout(() => $('#typed').focus({ preventScroll: true }), 50);
  $('#f').onsubmit = e => {
    e.preventDefault();
    const v = norm($('#typed').value), ok = d.a.some(a => norm(a) === v);
    if (ok) r.ok++;
    $('#f').innerHTML = `<button class="btn block" id="cont" type="button">Suivant</button>`;
    $('#fb').innerHTML = `<p class="verdict ${ok ? 'ok' : 'ko'}">${ok ? 'Juste' : `Réponse : ${T(lang, d.a[0])}`}</p><p class="ex">${T(lang, d.fr)}</p>`;
    $('#cont').onclick = () => { r.j++; render(); };
    $('#cont').focus();
  };
}

/* ----- Bilan de la semaine ----- */
function quizPlan(lang, w, inSession) {
  const items = shuffle(w.items).slice(0, 12);
  const qs = items.map((it, i) => {
    const type = i % 3;
    if (type === 2) return { type: 'write', it };
    const pool = shuffle(w.items.filter(x => x !== it)).slice(0, 3);
    if (type === 0) return { type: 'listen', it, opts: shuffle([it, ...pool]) };
    return { type: 'pick', it, opts: shuffle([it, ...pool]) };
  });
  return { kind: 'quiz', lang, w, qs, j: 0, ok: 0, wrong: [], inSession };
}
function renderQuiz() {
  if (!view.q) view.q = quizPlan(S.lang, C[S.lang].weeks.find(w => w.n === view.n), false);
  renderQuizBody(view.q);
}
function renderQuizInSession() { renderQuizBody(sess.sub); }
function renderQuizBody(q) {
  const lang = q.lang, inS = q.inSession;
  const head = inS ? sessHeader(`Bilan de la semaine ${q.w.n}`) : `<p class="step-title">Bilan de la semaine ${q.w.n}</p>`;
  if (q.j >= q.qs.length) {
    const pct = Math.round(100 * q.ok / q.qs.length);
    const L0 = S.L[lang]; L0.quiz[q.w.n] = Math.max(L0.quiz[q.w.n] || 0, pct);
    const now = Date.now();
    for (const it of q.wrong) for (const d of ['r', 'p']) { const c = cardsOf(lang)[it.key + ':' + d]; if (c) cardsOf(lang)[it.key + ':' + d] = Object.assign(c, { due: now, state: c.state === 'review' ? 'relearning' : c.state }); }
    save();
    app.innerHTML = `${head}<div class="stack" style="margin-top:16px"><h1>${pct} %</h1><p>${q.ok} bonnes réponses sur ${q.qs.length}.</p>
      ${q.wrong.length ? `<p class="muted">Ces mots reviennent dans ta révision dès maintenant :</p>${wordList(lang, q.wrong)}` : '<p class="muted">Aucune erreur cette semaine.</p>'}
      <button class="btn block" id="next">${inS ? 'Continuer' : 'Terminer'}</button></div>`;
    if (inS) bindQuit();
    $('#next').onclick = () => { if (inS) nextStep(); else go('lessons'); };
    return;
  }
  const x = q.qs[q.j], it = x.it;
  let body = '';
  if (x.type === 'listen') body = `<p class="ask">Écoute : que veut dire ce mot ?</p><div class="row">${playBtn(A.word(lang, it), 'big')}</div><div class="choices">${x.opts.map((o, i) => `<button class="choice" data-i="${i}">${esc(o.fr)}</button>`).join('')}</div>`;
  if (x.type === 'pick') body = `<p class="ask">Comment dit-on ?</p><p class="prompt fr">${esc(it.fr)}</p><div class="choices">${x.opts.map((o, i) => `<button class="choice" data-i="${i}">${T(lang, o.t)}</button>`).join('')}</div>`;
  if (x.type === 'write') body = `<p class="ask">Écris en ${LANGS[lang].toLowerCase()}</p><p class="prompt fr">${esc(it.fr)}</p><form id="f" class="stack-s"><input class="typed" id="typed" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn block">Vérifier</button></form>`;
  app.innerHTML = `${head}<div class="card" style="margin-top:12px"><p class="muted small">${q.j + 1} sur ${q.qs.length}</p>${body}<div id="fb"></div></div>`;
  if (inS) bindQuit();
  const after = ok => {
    if (ok) q.ok++; else q.wrong.push(it);
    $('#fb').innerHTML = `<p class="verdict ${ok ? 'ok' : 'ko'}">${ok ? 'Juste' : 'Réponse :'}</p>${ok ? '' : `<div class="row">${playBtn(A.word(lang, it))}<p><strong>${T(lang, it.t)}</strong> : ${esc(it.fr)}</p></div>`}<button class="btn block" id="cont" style="margin-top:12px">Suivant</button>`;
    $('#cont').onclick = () => { q.j++; renderQuizBody(q); };
  };
  if (x.type === 'listen') setTimeout(() => play(A.word(lang, it), $('.play.big')), 200);
  if (x.type === 'write') { setTimeout(() => $('#typed').focus({ preventScroll: true }), 50); $('#f').onsubmit = e => { e.preventDefault(); const g = grade(lang, it, $('#typed').value); $('#f').remove(); after(g > 0); }; }
  else $$('.choice').forEach(b => b.onclick = () => {
    const o = x.opts[+b.dataset.i], ok = o === it;
    $$('.choice').forEach(c => { c.disabled = true; if (x.opts[+c.dataset.i] === it) c.classList.add('right'); });
    if (!ok) b.classList.add('wrong');
    after(ok);
  });
}

/* ----- Étape : écouter ----- */
function listenParts() {
  const lang = sess.lang, w = sess.week, parts = [];
  if (S.L[lang].oreilleSec < OREILLE_CAP) parts.push('oreille');
  parts.push('dialogue');
  if (w.toeic) parts.push('toeic');
  return parts;
}
function renderListenStep() {
  const r = sess.sub;
  if (r.p >= r.parts.length) return nextStep();
  const part = r.parts[r.p];
  sess.inOreille = part === 'oreille';
  if (part === 'oreille') return renderOreille(r);
  if (part === 'dialogue') return renderDialogue(r);
  if (part === 'toeic') return renderToeic(r);
}
function oreilleTrials(lang, w, n = 12) {
  const o = w.oreille, out = [];
  for (let i = 0; i < n; i++) {
    if (o.pairs) { const p = pick(o.pairs), k = Math.random() < 0.5 ? 0 : 1; out.push({ kind: 'pair', opts: p, a: k, url: A.varied(p[k]) }); }
    else if (o.stress) { const s = o.stress[i % o.stress.length]; out.push({ kind: 'stress', s, url: A.varied(s.w) }); }
    else { const l = o.letters[i % o.letters.length]; out.push({ kind: 'letter', l, url: src('dj', 0, l.ar) }); }
  }
  if (!o.pairs) return shuffle(out);
  return out;
}
function renderOreille(r) {
  const lang = sess.lang, w = sess.week, o = w.oreille;
  if (!r.or) r.or = { trials: oreilleTrials(lang, w), j: 0, ok: 0, intro: true };
  const s = r.or;
  if (s.intro) {
    app.innerHTML = `${sessHeader('Écouter · Oreille')}<div class="stack" style="margin-top:12px"><h2>${md(o.title)}</h2><p>${M(lang, o.tip)}</p>
      <p class="muted small">${lang === 'en' ? 'Les mots sont dits par six voix différentes, américaines et britanniques : c\'est ce qui entraîne l\'oreille.' : 'Écoute plusieurs fois si besoin : le bouton rejoue le mot.'}</p>
      <button class="btn block" id="go">Commencer (12 écoutes)</button></div>`;
    bindQuit(); $('#go').onclick = () => { s.intro = false; render(); }; return;
  }
  if (s.j >= s.trials.length) {
    app.innerHTML = `${sessHeader('Écouter · Oreille')}<div class="stack" style="margin-top:16px"><h2>${s.ok} sur ${s.trials.length}</h2><p class="muted">${s.ok >= 10 ? 'Très bonne oreille.' : 'Normal au début : ces sons demandent quelques semaines.'}</p><button class="btn block" id="next">Continuer : dialogue</button></div>`;
    bindQuit(); $('#next').onclick = () => { r.p++; render(); }; return;
  }
  const t = s.trials[s.j];
  let opts, answerIdx, label;
  if (t.kind === 'pair') { opts = t.opts; answerIdx = t.a; label = o.prompt; }
  else if (t.kind === 'stress') { opts = t.s.syl; answerIdx = t.s.a; label = `${o.prompt} « ${t.s.w} »`; }
  else { opts = w.oreille.choices; answerIdx = opts.indexOf(t.l.a); label = o.prompt; }
  const cls = opts.length === 2 ? 'two' : opts.length === 3 ? 'three' : 'four';
  app.innerHTML = `${sessHeader('Écouter · Oreille')}<div class="card" style="margin-top:12px;align-items:center;text-align:center">
    <p class="ask">${esc(label)} · ${s.j + 1} sur ${s.trials.length}</p>
    ${playBtn(t.url, 'big')}
    <div class="choices ${cls}" style="width:100%">${opts.map((x, i) => `<button class="choice" data-i="${i}">${T(lang, x)}</button>`).join('')}</div>
    <div id="fb" style="min-height:64px"></div></div>`;
  bindQuit();
  setTimeout(() => play(t.url, $('.play.big')), 250);
  $$('.choice').forEach(b => b.onclick = () => {
    const i = +b.dataset.i, ok = i === answerIdx;
    if (ok) s.ok++;
    $$('.choice').forEach(c => { c.disabled = true; if (+c.dataset.i === answerIdx) c.classList.add('right'); });
    if (!ok) b.classList.add('wrong');
    let extra = '';
    if (t.kind === 'pair') extra = `<div class="row" style="justify-content:center">${t.opts.map(wd => `${playBtn(A.varied(wd))}<span>${esc(wd)}</span>`).join('')}</div>`;
    if (t.kind === 'letter') extra = `<p><strong>${T(lang, t.l.w)}</strong> <span class="ar" lang="ar">${esc(t.l.ar)}</span> : ${esc(t.l.fr)}</p>`;
    $('#fb').innerHTML = `<p class="verdict ${ok ? 'ok' : 'ko'}">${ok ? 'Juste' : 'Non'}</p>${extra}<button class="btn block" id="cont" style="margin-top:10px">Suivant</button>`;
    $('#cont').onclick = () => { s.j++; render(); };
  });
}
function renderDialogue(r) {
  const lang = sess.lang, w = sess.week, d = w.dialogue;
  if (!r.dg) r.dg = { blur: true, tr: false };
  const g = r.dg;
  app.innerHTML = `${sessHeader('Écouter · Dialogue')}<div class="stack" style="margin-top:12px">
    <h2>${esc(d.title)}</h2>
    <ol class="stack-s muted small" style="padding-left:18px;margin:0">
      <li>Écoute une première fois sans lire.</li><li>Réécoute avec le texte et la traduction.</li><li>Shadowing : répète chaque réplique juste après l'audio, en imitant la mélodie.</li></ol>
    <ul class="lines ${g.blur ? 'blurred' : ''}" id="lines">${d.lines.map((l, i) => `<li class="${l.s}" data-i="${i}">${playBtn(A.line(lang, l))}<div class="bubble"><div class="t">${T(lang, l.t)}</div>${lang === 'dj' ? `<div class="ar" lang="ar">${esc(l.ar)}</div>` : ''}<div class="tr ${g.tr ? '' : 'hidden'}">${esc(l.fr)}</div></div></li>`).join('')}</ul>
    <div class="row wrap">
      <button class="btn small" id="all">Écouter tout</button>
      <button class="btn small ghost" id="blur">${g.blur ? 'Afficher le texte' : 'Masquer le texte'}</button>
      <button class="btn small ghost" id="tr">${g.tr ? 'Masquer la traduction' : 'Traduction'}</button>
    </div>
    <button class="btn block quiet" id="shadow">Shadowing : répète après chaque réplique</button>
    <p id="say" class="callout hidden"></p>
    <button class="btn block" id="next">Continuer</button></div>`;
  bindQuit();
  let stop = false;
  const runAll = async (shadow) => {
    stop = false;
    for (const li of $$('#lines li')) {
      if (stop) break;
      $$('#lines li').forEach(x => x.classList.remove('active')); li.classList.add('active');
      const url = A.line(lang, d.lines[+li.dataset.i]);
      const t0 = Date.now(); await play(url, $('.play', li)); act();
      if (shadow && !stop) { const s = $('#say'); s.classList.remove('hidden'); s.textContent = 'À toi : répète la réplique.'; await wait(Math.max(1500, (Date.now() - t0) * 1.4)); s.classList.add('hidden'); }
      else await wait(350);
    }
    $$('#lines li').forEach(x => x.classList.remove('active'));
  };
  $('#all').onclick = () => runAll(false);
  $('#shadow').onclick = () => { g.blur = false; $('#lines').classList.remove('blurred'); $('#blur').textContent = 'Masquer le texte'; runAll(true); };
  $('#blur').onclick = () => { g.blur = !g.blur; stop = true; render(); };
  $('#tr').onclick = () => { g.tr = !g.tr; stop = true; render(); };
  $('#next').onclick = () => { stop = true; player.pause(); r.p++; r.dg = null; render(); };
}
function renderToeic(r) {
  const w = sess.week, tq = w.toeic;
  if (!r.tq) r.tq = { list: shuffle(tq.items).slice(0, 3), j: 0, ok: 0, intro: true };
  const s = r.tq;
  if (s.intro) {
    app.innerHTML = `${sessHeader('Écouter · TOEIC')}<div class="stack" style="margin-top:12px"><h2>${esc(tq.title)}</h2><p>${md(tq.tip)}</p><button class="btn block" id="go">Commencer (3 questions)</button></div>`;
    bindQuit(); $('#go').onclick = () => { s.intro = false; render(); }; return;
  }
  if (s.j >= s.list.length) {
    app.innerHTML = `${sessHeader('Écouter · TOEIC')}<div class="stack" style="margin-top:16px"><h2>${s.ok} sur ${s.list.length}</h2><button class="btn block" id="next">Continuer</button></div>`;
    bindQuit(); $('#next').onclick = () => { r.p++; render(); }; return;
  }
  const it = s.list[s.j], letters = ['A', 'B', 'C'];
  app.innerHTML = `${sessHeader('Écouter · TOEIC')}<div class="card" style="margin-top:12px;align-items:center;text-align:center">
    <p class="ask">Question ${s.j + 1} sur ${s.list.length} : écoute la question et les trois réponses</p>
    <button class="play big" id="replay" aria-label="Réécouter">${ICON.play}</button>
    <div class="choices three" style="width:100%">${letters.map((x, i) => `<button class="choice" data-i="${i}" disabled>${x}</button>`).join('')}</div>
    <div id="fb" style="width:100%;text-align:left"></div></div>`;
  bindQuit();
  const seq = async () => {
    const b = $('#replay'); b.classList.add('playing');
    await play(src('en', 5, it.q)); await wait(700);
    for (let i = 0; i < 3; i++) { $$('.choice').forEach(c => c.style.outline = ''); $(`.choice[data-i="${i}"]`).style.outline = '2px solid var(--accent)'; await play(src('en', 3, it.r[i])); await wait(500); }
    $$('.choice').forEach(c => { c.style.outline = ''; c.disabled = false; }); b.classList.remove('playing');
  };
  $('#replay').onclick = seq; setTimeout(seq, 300);
  $$('.choice').forEach(b => b.onclick = () => {
    const ok = +b.dataset.i === it.a; if (ok) s.ok++;
    $$('.choice').forEach(c => { c.disabled = true; if (+c.dataset.i === it.a) c.classList.add('right'); });
    if (!ok) b.classList.add('wrong');
    $('#fb').innerHTML = `<p class="verdict ${ok ? 'ok' : 'ko'}">${ok ? 'Juste' : 'Non'}</p><p><strong>${esc(it.q)}</strong></p><ol type="A" style="margin:6px 0 0;padding-left:22px">${it.r.map((x, i) => `<li${i === it.a ? ' style="font-weight:600"' : ''}>${esc(x)}</li>`).join('')}</ol><button class="btn block" id="cont" style="margin-top:12px">Suivant</button>`;
    $('#cont').onclick = () => { s.j++; render(); };
  });
}

/* ----- Étape : parler ----- */
let rec = null, recChunks = [], recUrl = null;
async function startRec(btn, onStop) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recChunks = []; rec = new MediaRecorder(stream);
    rec.ondataavailable = e => recChunks.push(e.data);
    rec.onstop = () => { stream.getTracks().forEach(t => t.stop()); if (recUrl) URL.revokeObjectURL(recUrl); recUrl = URL.createObjectURL(new Blob(recChunks, { type: rec.mimeType })); onStop(recUrl); rec = null; };
    rec.start(); btn.innerHTML = '<span class="rec"><span class="dotrec"></span>Arrêter</span>';
  } catch (e) { toast("Micro indisponible : autorise l'accès au micro, ou parle sans t'enregistrer."); }
}
function renderSpeakStep() {
  const r = sess.sub, lang = sess.lang, w = sess.week, p = w.production;
  if (r.phase === 'prod') {
    app.innerHTML = `${sessHeader('Parler · Production')}<div class="stack" style="margin-top:12px">
      <h2>${esc(p.prompt)}</h2>
      <p class="muted">Dis-le à voix haute. Tu peux t'enregistrer pour te réécouter.</p>
      <div class="row wrap"><button class="btn quiet" id="rec">Je m'enregistre</button><span id="mine"></span></div>
      <button class="linkbtn" id="model">Voir un exemple de réponse</button>
      <div id="mod" class="hidden"><ul class="words">${p.model.map(m => `<li>${playBtn(lang === 'en' ? A.model(lang, m) : null)}<span>${T(lang, m)}</span></li>`).join('')}</ul></div>
      <button class="btn block" id="next">Continuer : fluidité</button></div>`;
    bindQuit();
    $('#model').onclick = () => $('#mod').classList.toggle('hidden');
    $('#rec').onclick = e => {
      if (rec) { rec.stop(); e.currentTarget.textContent = "Je m'enregistre"; return; }
      startRec(e.currentTarget, url => { $('#mine').innerHTML = `<button class="btn small ghost" data-src="${url}">Réécouter</button>`; });
    };
    $('#next').onclick = () => { if (rec) rec.stop(); r.phase = 'flu'; r.round = 0; r.left = 240; render(); };
    return;
  }
  /* fluidité : la même production en 4, 3 puis 2 minutes */
  const rounds = [240, 180, 120];
  app.innerHTML = `${sessHeader('Parler · Fluidité')}<div class="stack" style="margin-top:12px">
    <h2>Redis la même chose, de plus en plus vite</h2>
    <p class="muted">Trois tours : 4 minutes, puis 3, puis 2. Garde le même contenu, sans chercher de nouveaux mots. Ajoute des détails pour remplir les 4 minutes, puis condense.</p>
    <div class="rounds">${rounds.map((s, i) => `<span class="${i < r.round ? 'done' : i === r.round ? 'on' : ''}">${s / 60} min</span>`).join('')}</div>
    <div class="timer" id="tm">${fmtClock(r.left)}</div>
    <div class="row" style="justify-content:center"><button class="btn" id="go">${r.running ? 'Pause' : r.round >= 3 ? 'Terminé' : 'Démarrer le tour'}</button><button class="btn ghost" id="skip">${r.round >= 2 ? 'Finir' : 'Tour suivant'}</button></div>
    <button class="btn block quiet" id="next">Terminer la séance</button></div>`;
  bindQuit();
  const tick = () => {
    if (!r.running) return;
    r.left--; act();
    const tm = $('#tm'); if (tm) tm.textContent = fmtClock(Math.max(0, r.left));
    if (r.left <= 0) { r.running = false; clearInterval(r.iv); r.round++; if (r.round < 3) r.left = rounds[r.round]; navigator.vibrate && navigator.vibrate(200); render(); }
  };
  $('#go').onclick = () => { if (r.round >= 3) return nextStep(); r.running = !r.running; clearInterval(r.iv); if (r.running) r.iv = setInterval(tick, 1000); render(); };
  $('#skip').onclick = () => { r.running = false; clearInterval(r.iv); r.round++; if (r.round < 3) { r.left = rounds[r.round]; render(); } else nextStep(); };
  $('#next').onclick = () => { r.running = false; clearInterval(r.iv); nextStep(); };
}

/* ---------- Onglet Leçons ---------- */
function renderLessons() {
  const lang = S.lang, unl = unlockedWeeks(lang).map(w => w.n);
  app.innerHTML = `<div class="stack"><h1>Leçons</h1>
    <p class="muted">Une leçon s'ouvre chaque lundi. Tu peux relire les leçons ouvertes et refaire leur bilan quand tu veux.</p>
    <ul class="weeklist">${C[lang].weeks.map(w => { const open = unl.includes(w.n); return `<li class="${open ? '' : 'locked'}"><button data-n="${w.n}" ${open ? '' : 'disabled'}><span class="num">${w.n}</span><span><strong>${esc(w.title)}</strong><br><span class="muted small">${open ? (S.L[lang].quiz[w.n] != null ? `Bilan : ${S.L[lang].quiz[w.n]} %` : S.L[lang].lesson[w.n] ? 'Leçon vue' : 'À découvrir') : `S'ouvre le ${weekOpensOn(w.n).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`}</span></span><span class="muted">${open ? '›' : ''}</span></button></li>`; }).join('')}</ul>
    <p class="muted small">Les semaines suivantes seront ajoutées par blocs de quatre.</p></div>`;
  $$('.weeklist button[data-n]').forEach(b => b.onclick = () => go('lesson', { n: +b.dataset.n }));
}
function renderLessonPage() {
  const lang = S.lang, w = C[lang].weeks.find(x => x.n === view.n);
  app.innerHTML = `<div class="stack">
    <button class="linkbtn" id="back">‹ Leçons</button>
    <p class="step-title">Semaine ${w.n}</p><h1>${esc(w.title)}</h1>
    ${lessonBody(lang, w)}
    <h3>${lang === 'en' ? 'Mots et expressions' : 'Expressions'}</h3>${wordList(lang, w.items)}
    ${w.faux ? `<h3>Faux amis</h3><ul class="words">${w.faux.map(f => `<li>${playBtn(src('en', EN_MAIN[0], f.t))}<div><div class="t">${esc(f.t)}</div><div class="fr">${md(f.fr)}</div></div></li>`).join('')}</ul>` : ''}
    <h3>Dialogue : ${esc(w.dialogue.title)}</h3>
    <ul class="lines">${w.dialogue.lines.map(l => `<li class="${l.s}">${playBtn(A.line(lang, l))}<div class="bubble"><div class="t">${T(lang, l.t)}</div>${lang === 'dj' ? `<div class="ar" lang="ar">${esc(l.ar)}</div>` : ''}<div class="tr">${esc(l.fr)}</div></div></li>`).join('')}</ul>
    ${S.L[lang].lesson[w.n] ? '' : `<button class="btn block ghost" id="add">Ajouter ces mots à mes révisions</button>`}
    <button class="btn block" id="quiz">Faire le bilan de la semaine</button>
  </div>`;
  $('#back').onclick = () => go('lessons');
  $('#quiz').onclick = () => go('quiz', { n: w.n });
  const add = $('#add'); if (add) add.onclick = () => { addCards(lang, w.items); S.L[lang].lesson[w.n] = today(); save(); toast('Ajoutés : ils arrivent dans ta révision.'); render(); };
}

/* ---------- Onglet Réviser ---------- */
function renderReviewTab() {
  const lang = S.lang, due = dueCards(lang).length, w = currentWeek(lang);
  app.innerHTML = `<div class="stack"><h1>Réviser</h1>
    <section class="panel stack-s"><h2>${due} carte${due > 1 ? 's' : ''} à revoir</h2><p class="muted">La révision du jour fait déjà partie de la séance. Ici, tu peux la faire à part, par exemple dans les transports.</p>
      <button class="btn block" id="rev" ${due ? '' : 'disabled'}>Réviser maintenant</button></section>
    <section class="panel stack-s"><h2>Oreille</h2><p class="muted">${md(w.oreille.title)} : 12 écoutes.</p><button class="btn ghost block" id="or">S'entraîner</button></section>
  </div>`;
  $('#rev').onclick = () => { sess = { lang, steps: ['review'], i: 0, sec: 0, week: w }; act(); enterStep(); };
  $('#or').onclick = () => { sess = { lang, steps: ['listen'], i: 0, sec: 0, week: w, free: true }; act(); sess.sub = { kind: 'listen', parts: ['oreille'], p: 0 }; render(); };
}

/* ---------- Onglet Progrès ---------- */
function renderProgress() {
  const lang = S.lang, l = L(), tot = totalSec(lang) / 3600;
  const days = []; const d = new Date(); d.setDate(d.getDate() - 27);
  for (let i = 0; i < 28; i++) { days.push((l.days[ymd(d)] || {}).sec || 0); d.setDate(d.getDate() + 1); }
  const max = Math.max(45 * 60, ...days);
  const last28h = days.reduce((a, b) => a + b, 0) / 3600, perWeek = last28h / 4;
  const left = Math.max(0, GOAL_HOURS[lang] - tot);
  let eta = '';
  if (perWeek > 0.5) { const e = new Date(); e.setDate(e.getDate() + Math.round(left / perWeek * 7)); eta = e.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); }
  const flags = Object.keys(l.flags || {}).filter(k => l.flags[k] && C[lang].items[k]);
  const pl = l.placement;
  app.innerHTML = `<div class="stack"><h1>Progrès</h1>
    <div class="stats">
      <div class="stat"><div class="n">${tot.toFixed(1).replace('.', ',')} h</div><div class="l">de travail au total</div></div>
      <div class="stat"><div class="n">${streak(lang)}</div><div class="l">jour${streak(lang) > 1 ? 's' : ''} d'affilée</div></div>
      <div class="stat"><div class="n">${memorized(lang)}</div><div class="l">${lang === 'en' ? 'mots' : 'expressions'} bien ancrés (3 semaines et plus)</div></div>
      <div class="stat"><div class="n">${studied(lang)}</div><div class="l">en cours de mémorisation</div></div>
    </div>
    <section class="panel stack-s"><h2>Les 4 dernières semaines</h2>
      <div class="bars" aria-label="Minutes par jour">${days.map(s => `<span class="${s ? '' : 'zero'}" style="height:${Math.max(2, 100 * s / max)}%" title="${fmtMin(s)} min"></span>`).join('')}</div>
      <div class="bars-axis"><span>il y a 4 semaines</span><span>aujourd'hui</span></div>
      <p class="muted small">${perWeek.toFixed(1).replace('.', ',')} h par semaine en moyenne.</p></section>
    <section class="panel stack-s"><h2>Objectif : ${GOAL_TEXT[lang]}</h2>
      <div class="meter"><span style="width:${Math.min(100, 100 * tot / GOAL_HOURS[lang])}%"></span></div>
      <p class="muted small">Environ ${GOAL_HOURS[lang]} heures de travail. ${eta ? `À ton rythme actuel, l'objectif serait atteint vers ${eta}.` : "L'estimation apparaît après quelques séances."}</p></section>
    ${lang === 'en' ? `<section class="panel stack-s"><h2>Test de niveau</h2>${pl ? `<p>Niveau estimé : <strong>${pl.level}</strong> (le ${parseYmd(pl.date).toLocaleDateString('fr-FR')}).</p>` : '<p class="muted">Pas encore passé.</p>'}<button class="btn ghost small" id="pl">${pl ? 'Repasser le test' : 'Passer le test'}</button></section>` : ''}
    ${lang === 'dj' ? `<section class="panel stack-s"><h2>Audios signalés</h2>${flags.length ? `<p class="muted small">À faire vérifier par un Marocain lors d'un séjour.</p><ul class="words">${flags.map(k => { const it = C.dj.items[k]; return `<li>${playBtn(A.word('dj', it))}<div><div class="t">${T('dj', it.t)}</div><div class="fr">${esc(it.fr)}</div></div></li>`; }).join('')}</ul>` : '<p class="muted">Aucun pour le moment. Pendant la révision, « Audio douteux ? » ajoute un mot ici.</p>'}</section>` : ''}
    <section class="panel stack-s"><h2>Réglages</h2>
      <label class="field"><span>Début du programme</span><input type="date" id="start" value="${S.start}"></label>
      <label class="toggle"><span>Ouvrir toutes les semaines disponibles en ${LANGS[lang].toLowerCase()}</span><input type="checkbox" id="all" ${S.unlockAll[lang] ? 'checked' : ''}></label>
      <div class="row wrap"><button class="btn small quiet" id="exp">Sauvegarder ma progression</button><button class="btn small quiet" id="imp">Restaurer une sauvegarde</button></div>
      <p class="muted small">La progression est enregistrée sur cet appareil. La sauvegarde permet de la passer sur un autre appareil.</p></section>
  </div>`;
  const plb = $('#pl'); if (plb) plb.onclick = () => go('placement');
  $('#start').onchange = e => { if (e.target.value) { S.start = ymd(mondayOf(parseYmd(e.target.value))); save(); toast('Date de début enregistrée.'); } };
  $('#all').onchange = e => { S.unlockAll[lang] = e.target.checked; save(); };
  $('#exp').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' }));
    a.download = `lsan-sauvegarde-${today()}.json`; a.click();
  };
  $('#imp').onclick = () => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'application/json,.json';
    i.onchange = async () => {
      try { const s = JSON.parse(await i.files[0].text()); if (s.v !== 1 || !s.L) throw 0; S = s; for (const l of ['en', 'dj']) S.L[l] = Object.assign(blankLang(), S.L[l] || {}); save(true); setLang(S.lang); toast('Progression restaurée.'); render(); }
      catch (e) { toast("Ce fichier n'est pas une sauvegarde de Lsan."); }
    };
    i.click();
  };
}

/* ---------- Test de niveau (anglais) ---------- */
function renderPlacement() {
  const P = C.en.placement;
  if (!view.pt) view.pt = { j: -1, ans: [] };
  const s = view.pt;
  if (s.j < 0) {
    app.innerHTML = `<div class="stack"><button class="linkbtn" id="back">‹ Retour</button><h1>Test de niveau</h1>
      <p>${P.length} questions : grammaire, vocabulaire et écoute, de plus en plus difficiles. Réponds sans chercher ; si tu ne sais pas, choisis « Je ne sais pas ».</p>
      <p class="muted">Pour les questions d'écoute, mets le son. Tu peux réécouter deux fois.</p>
      <button class="btn block" id="go">Commencer</button></div>`;
    $('#back').onclick = () => go('today'); $('#go').onclick = () => { s.j = 0; render(); }; return;
  }
  if (s.j >= P.length) {
    const lv = ['A1', 'A2', 'B1', 'B2'], score = {};
    for (const x of lv) { const qs = P.map((q, i) => [q, i]).filter(([q]) => q.level === x); score[x] = qs.filter(([q, i]) => s.ans[i] === q.a).length / qs.length; }
    let level = 'A1 (débutant)';
    if (score.A1 >= 0.6) level = 'A1';
    if (score.A1 >= 0.7 && score.A2 >= 0.6) level = 'A2';
    if (score.A2 >= 0.7 && score.B1 >= 0.6) level = 'B1';
    if (score.B1 >= 0.7 && score.B2 >= 0.6) level = 'B2';
    if (score.A1 < 0.6) level = 'A1 (débutant)';
    S.L.en.placement = { level, date: today(), score }; save(true);
    const advice = level.startsWith('B') ? 'Les semaines 1 à 4 seront surtout de la révision pour toi. Tu peux les ouvrir toutes maintenant dans Progrès, puis Réglages, et avancer à ton rythme.'
      : level === 'A2' ? 'Le programme commence au bon niveau : suis les semaines dans l\'ordre.'
      : 'Le programme démarre un peu au-dessus de ton niveau : prends le temps de bien écouter les mots de chaque leçon, et fais les révisions tous les jours.';
    app.innerHTML = `<div class="stack"><h1>Niveau estimé : ${level}</h1>
      <table class="lesson" style="width:100%">${lv.map(x => `<tr><td>${x}</td><td>${Math.round(100 * score[x])} %</td></tr>`).join('')}</table>
      <p>${advice}</p><button class="btn block" id="home">Retour à l'accueil</button></div>`;
    $('#home').onclick = () => { view.pt = null; go('today'); }; return;
  }
  const q = P[s.j];
  app.innerHTML = `<div class="stack"><p class="muted small">Question ${s.j + 1} sur ${P.length}</p>
    <div class="meter"><span style="width:${100 * s.j / P.length}%"></span></div>
    <div class="card">
      ${q.listen ? `<div class="row">${`<button class="play big" id="lp" aria-label="Écouter">${ICON.play}</button>`}<span class="muted small" id="lc">2 écoutes restantes</span></div>` : ''}
      <p class="prompt fr" style="font-size:1.35rem">${md(q.q)}</p>
      <div class="choices">${q.o.map((o, i) => `<button class="choice" data-i="${i}">${md(o)}</button>`).join('')}<button class="choice" data-i="-1" style="color:var(--muted)">Je ne sais pas</button></div>
    </div></div>`;
  if (q.listen) {
    let left = 2; const url = src('en', 4, q.listen);
    const lp = $('#lp');
    play(url, lp);
    lp.onclick = () => { if (left <= 0) return; left--; $('#lc').textContent = left ? `${left} écoute restante` : 'Plus d\'écoute'; play(url, lp); };
  }
  $$('.choice').forEach(b => b.onclick = () => { s.ans[s.j] = +b.dataset.i; s.j++; render(); });
}

/* ---------- Démarrage ---------- */
async function boot() {
  S = load();
  setLang(S.lang);
  try { await loadContent(); }
  catch (e) { app.innerHTML = '<p class="loading">Impossible de charger les leçons. Vérifie la connexion, puis recharge la page.</p>'; return; }
  render();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
document.addEventListener('visibilitychange', () => { if (document.hidden) save(true); });
boot();
})();
