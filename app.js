'use strict';
/* 教基真题通 — 纯前端复习平台，数据保存在浏览器 localStorage */
const QB = window.QB;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const L = i => String.fromCharCode(65 + i);
const DAY = 86400000;
const INTERVALS = [1, 2, 4, 7, 15, 30]; // 艾宾浩斯复习间隔（天）
const WEIGHT = {'判断': 1, '单选': 1, '多选': 1.5, '不定项': 2, '主观': 0};
const QMAP = new Map(QB.questions.map(q => [q.id, q]));
const EXAM = new Map(QB.exams.map(e => [e.id, e]));
const GMAP = new Map(QB.groups.map(g => [g.id, g]));
const MODULES = [...new Set(QB.questions.map(q => q.module))];
const MODORDER = ['教育学原理','课程与教学','德育与班级管理','心理学基础','教育心理学','教育法律法规','教师职业道德','教育时政与政策','综合/其他'];
MODULES.sort((a, b) => MODORDER.indexOf(a) - MODORDER.indexOf(b));

/* ---------------- 存储 ---------------- */
const SKEY = 'jiaoji_sc_v1';
const defState = () => ({ v: 1, rec: {}, srs: {}, fav: {}, notes: {}, wrong: {}, daily: {}, exams: [], session: null, settings: { theme: 'auto', removeN: 3, srsScope: 'all', autoNext: false } });
let S;
try { S = Object.assign(defState(), JSON.parse(localStorage.getItem(SKEY) || '{}')); S.settings = Object.assign(defState().settings, S.settings || {}); } catch (e) { S = defState(); }
let saveTimer = null;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(SKEY, JSON.stringify(S)); } catch (e) { toast('保存失败：浏览器存储空间不足'); } }, 120); }
function saveNow() { clearTimeout(saveTimer); localStorage.setItem(SKEY, JSON.stringify(S)); }
window.addEventListener('beforeunload', saveNow);
const todayKey = (t = Date.now()) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const dayStart = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

/* ---------------- 主题 ---------------- */
function applyTheme() {
  const t = S.settings.theme;
  const dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
applyTheme();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 1800); }
function modal(html) { $('#modal-body').innerHTML = html; $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal(); });

/* ---------------- 记录答题 ---------------- */
function judgeAns(q, sel) { return q.answer ? sel === q.answer : null; }
function record(q, sel, ok) {
  const r = S.rec[q.id] || (S.rec[q.id] = { n: 0, ok: 0, last: 0, lastOk: null, sel: '' });
  const first = r.n === 0;
  r.n++; if (ok) r.ok++; r.last = Date.now(); r.lastOk = ok; r.sel = sel;
  const dk = todayKey(); const d = S.daily[dk] || (S.daily[dk] = { n: 0, ok: 0 }); d.n++; if (ok) d.ok++;
  // 错题本
  if (ok === false) { S.wrong[q.id] = { t: Date.now(), streak: 0, cnt: ((S.wrong[q.id] || {}).cnt || 0) + 1 }; }
  else if (ok && S.wrong[q.id]) { S.wrong[q.id].streak++; if (S.wrong[q.id].streak >= S.settings.removeN) { delete S.wrong[q.id]; toast(`已连续答对 ${S.settings.removeN} 次，移出错题本 🎉`); } }
  // 艾宾浩斯
  srsUpdate(q.id, ok, first);
  save();
}
function srsUpdate(id, ok, first) {
  if (ok === null) return;
  let s = S.srs[id];
  if (!s) { if (ok && S.settings.srsScope === 'wrong') return; s = S.srs[id] = { st: 0, due: 0, m: false }; if (ok && first) s.st = 1; }
  const today = dayStart();
  if (!ok) { s.st = 0; s.m = false; s.due = today + INTERVALS[0] * DAY; }
  else {
    if (s.st >= INTERVALS.length) { s.m = true; s.due = 0; }
    else { s.due = today + INTERVALS[s.st] * DAY; s.st++; }
  }
}
function srsRate(id, known) { // 背题模式/主观题自评
  const s = S.srs[id] || (S.srs[id] = { st: 0, due: 0, m: false });
  const today = dayStart();
  if (!known) { s.st = 0; s.m = false; s.due = today + DAY; } else if (s.st >= INTERVALS.length) { s.m = true; s.due = 0; } else { s.due = today + INTERVALS[s.st] * DAY; s.st++; }
  save();
}
const dueList = () => { const end = dayStart() + DAY; return Object.entries(S.srs).filter(([id, s]) => !s.m && s.due && s.due < end && QMAP.has(id)).sort((a, b) => a[1].due - b[1].due).map(([id]) => id); };
function streakDays() { let n = 0; let t = Date.now(); if (!S.daily[todayKey(t)]) t -= DAY; while (S.daily[todayKey(t)]) { n++; t -= DAY; } return n; }

/* ---------------- 路由 ---------------- */
const NAV = [
  ['home', '🏠', '首页'], ['bank', '📚', '刷题'], ['review', '🧠', '复习'], ['analysis', '📊', '考点'], ['me', '👤', '我的'],
];
const SIDE = [
  ['学习', [['home', '🏠', '学习首页'], ['bank', '📚', '分类刷题'], ['papers', '📄', '历年真题'], ['groups', '🧩', '同类题合并'], ['exam', '⏱️', '模拟考试']]],
  ['复习', [['review', '🧠', '艾宾浩斯复习'], ['wrong', '❌', '错题本'], ['fav', '⭐', '我的收藏'], ['notes', '📝', '我的笔记']]],
  ['分析', [['analysis', '📊', '高频考点'], ['stats', '📈', '学习统计'], ['search', '🔍', '搜索题目']]],
  ['设置', [['me', '⚙️', '设置与备份']]],
];
function renderNav(cur) {
  const top = cur.split('/')[0];
  const tabFor = {papers: 'bank', groups: 'bank', exam: 'bank', quiz: 'bank', wrong: 'review', fav: 'review', notes: 'review', stats: 'me', search: 'home', group: 'bank', result: 'bank'};
  const tcur = tabFor[top] || top;
  $('#tabbar').innerHTML = NAV.map(([k, i, t]) => `<a href="#/${k}" class="${tcur === k ? 'on' : ''}"><span class="ic">${i}</span>${t}</a>`).join('');
  $('#sidenav').innerHTML = SIDE.map(([sec, items]) => `<div class="sec">${sec}</div>` + items.map(([k, i, t]) => `<a href="#/${k}" class="${top === k ? 'on' : ''}"><span class="ic">${i}</span>${t}${k === 'review' && dueList().length ? ` <span class="tag bad" style="margin-left:auto">${dueList().length}</span>` : ''}${k === 'wrong' && Object.keys(S.wrong).length ? ` <span class="tag" style="margin-left:auto">${Object.keys(S.wrong).length}</span>` : ''}</a>`).join('')).join('');
}
const routes = {};
function go(h) { if (location.hash === '#/' + h) router(); else location.hash = '#/' + h; }
function router() {
  const h = decodeURIComponent(location.hash.slice(2)) || 'home';
  const [name, ...args] = h.split('/');
  renderNav(h);
  const fn = routes[name] || routes.home;
  if (name !== 'quiz') stopTimer();
  $('#view').innerHTML = '';
  fn(...args);
  if (name !== 'quiz') window.scrollTo(0, 0);
}
window.addEventListener('hashchange', router);

/* ---------------- 工具 ---------------- */
const qLabel = q => { const e = EXAM.get(q.exam); return `${e ? e.label : q.exam} · 第${q.num}题`; };
function filterQs(f) {
  return QB.questions.filter(q => {
    if (f.mods && f.mods.length && !f.mods.includes(q.module)) return false;
    if (f.kp && q.kp !== f.kp) return false;
    if (f.types && f.types.length && !f.types.includes(q.qtype)) return false;
    if (f.exams && f.exams.length && !f.exams.includes(q.exam)) return false;
    if (f.years && f.years.length && !f.years.includes(q.year)) return false;
    const r = S.rec[q.id];
    if (f.scope === 'new' && r) return false;
    if (f.scope === 'wrong' && !S.wrong[q.id]) return false;
    if (f.scope === 'fav' && !S.fav[q.id]) return false;
    if (f.scope === 'done' && !r) return false;
    if (f.noSubj && q.qtype === '主观') return false;
    return true;
  });
}
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function startSession(title, qids, mode = 'practice', opts = {}) {
  if (!qids.length) { toast('没有符合条件的题目'); return; }
  S.session = Object.assign({ title, qids, idx: 0, mode, ans: {}, start: Date.now(), limit: 0, back: location.hash.slice(2) || 'home' }, opts);
  save(); go('quiz');
}
function bar(label, val, max, extra = '', attrs = '') { const w = max ? Math.max(2, Math.round(val / max * 100)) : 0; return `<div class="b" ${attrs}><span class="t" title="${esc(label)}">${esc(label)}</span><span class="bar"><i style="width:${w}%"></i></span><span class="n">${extra || val}</span></div>`; }
function ansText(q) { if (!q.answer) return '暂无'; if (q.qtype === '判断') return q.answer === 'A' ? '正确（√）' : '错误（×）'; return q.answer; }
function srcTag(src, kind) {
  if (!src) return '';
  if (/AI/.test(src)) return `<span class="tag ai">${esc(src)}</span>`;
  return `<span class="tag ok">${esc(src)}</span>`;
}

/* ---------------- 首页 ---------------- */
routes.home = () => {
  const total = QB.questions.length, done = Object.keys(S.rec).filter(id => QMAP.has(id)).length;
  const all = Object.values(S.rec); const n = all.reduce((a, r) => a + r.n, 0), ok = all.reduce((a, r) => a + r.ok, 0);
  const due = dueList().length; const td = S.daily[todayKey()] || { n: 0, ok: 0 };
  const sess = S.session && S.session.idx < S.session.qids.length ? S.session : null;
  const hot = topKps().slice(0, 6);
  $('#view').innerHTML = `
  <h1>👋 今天也要加油，冲刺上岸！</h1>
  <div class="grid g4">
    <div class="kpi pri"><div class="l">今日待复习</div><div class="v">${due}</div><div class="l">艾宾浩斯计划</div></div>
    <div class="kpi"><div class="l">今日已答</div><div class="v">${td.n}</div><div class="l small">正确率 ${td.n ? Math.round(td.ok / td.n * 100) : 0}%</div></div>
    <div class="kpi"><div class="l">题库进度</div><div class="v">${done}<small class="muted" style="font-size:14px">/${total}</small></div><div class="l small">累计正确率 ${n ? Math.round(ok / n * 100) : 0}%</div></div>
    <div class="kpi"><div class="l">连续学习</div><div class="v">${streakDays()} 天</div><div class="l small">错题 ${Object.keys(S.wrong).length} 道</div></div>
  </div>
  ${sess ? `<div class="card row between" style="margin-top:14px"><div><b>继续上次练习</b><div class="muted small">${esc(sess.title)} · 第 ${sess.idx + 1}/${sess.qids.length} 题</div></div><a class="btn pri" href="#/quiz">继续 →</a></div>` : ''}
  <h2>快速开始</h2>
  <div class="grid g3">
    <button class="btn block" data-act="review">🧠 今日复习（${due}）</button>
    <button class="btn block" data-act="rand20">🎲 随机 20 题</button>
    <button class="btn block" data-act="new20">✨ 未做新题 20 道</button>
    <button class="btn block" data-act="wrong">❌ 错题重练（${Object.keys(S.wrong).length}）</button>
    <a class="btn block" href="#/exam">⏱️ 模拟考试</a>
    <a class="btn block" href="#/groups">🧩 同类题合并学习</a>
  </div>
  <h2>🔥 高频考点 Top 6 <a class="small" href="#/analysis" style="float:right;font-weight:400">全部 →</a></h2>
  <div class="card bars">${hot.map(k => bar(k.kp, k.count, hot[0].count, k.count + '题', `data-kp="${esc(k.kp)}"`)).join('')}</div>
  <div class="card small muted">
    题库收录 <b>${QB.exams.length}</b> 场考试（${QB.meta.yearMin}–${QB.meta.yearMax}）共 <b>${total}</b> 道真题，合并为 <b>${QB.meta.multiGroups}</b> 个同类题组（覆盖 ${QB.meta.inGroups} 题）。
    答案/解析均来自你提供的真题资料，标注「AI」的为补充内容。数据仅保存在本机浏览器，可在「我的」中导出备份。
  </div>`;
  $('#view').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); const k = e.target.closest('[data-kp]');
    if (k) return startSession('考点：' + k.dataset.kp, QB.questions.filter(q => q.kp === k.dataset.kp).map(q => q.id));
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'review') return startReview();
    if (a === 'rand20') return startSession('随机 20 题', shuffle(QB.questions.filter(q => q.qtype !== '主观')).slice(0, 20).map(q => q.id));
    if (a === 'new20') return startSession('未做新题', shuffle(QB.questions.filter(q => !S.rec[q.id] && q.qtype !== '主观')).slice(0, 20).map(q => q.id));
    if (a === 'wrong') return startSession('错题重练', Object.keys(S.wrong).filter(id => QMAP.has(id)));
  });
};

/* ---------------- 刷题（筛选） ---------------- */
let F = { mods: [], kp: '', types: [], years: [], exams: [], scope: 'all', order: 'seq', limit: 0, mode: 'practice' };
routes.bank = () => {
  const years = [...new Set(QB.questions.map(q => q.year))].sort();
  const kps = [...new Set(QB.questions.filter(q => !F.mods.length || F.mods.includes(q.module)).map(q => q.kp))];
  const types = ['判断', '单选', '多选', '不定项', '主观'];
  const chips = (arr, key, vals, fmt = x => x) => vals.map(v => `<span class="chip ${arr.includes(v) ? 'on' : ''}" data-k="${key}" data-v="${esc(v)}">${esc(fmt(v))}</span>`).join('');
  const list = filterQs(F);
  const modCount = m => QB.questions.filter(q => q.module === m).length;
  $('#view').innerHTML = `
  <h1>📚 分类刷题</h1>
  <div class="card">
    <h3 style="margin-top:0">模块</h3><div>${chips(F.mods, 'mods', MODULES, m => `${m} ${modCount(m)}`)}</div>
    <h3>知识点</h3><select id="kp" style="width:100%"><option value="">全部知识点</option>${kps.map(k => `<option ${F.kp === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select>
    <h3>题型</h3><div>${chips(F.types, 'types', types)}</div>
    <h3>年份</h3><div>${chips(F.years, 'years', years, y => y + '年')}</div>
    <h3>范围</h3><div class="seg" id="scope">${[['all', '全部'], ['new', '未做'], ['done', '已做'], ['wrong', '错题'], ['fav', '收藏']].map(([k, t]) => `<button data-v="${k}" class="${F.scope === k ? 'on' : ''}">${t}</button>`).join('')}</div>
    <h3>顺序 / 数量 / 模式</h3>
    <div class="row">
      <div class="seg" id="order"><button data-v="seq" class="${F.order === 'seq' ? 'on' : ''}">顺序</button><button data-v="rand" class="${F.order === 'rand' ? 'on' : ''}">随机</button></div>
      <select id="limit">${[[0, '全部'], [10, '10题'], [20, '20题'], [50, '50题'], [100, '100题']].map(([v, t]) => `<option value="${v}" ${F.limit == v ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <div class="seg" id="mode"><button data-v="practice" class="${F.mode === 'practice' ? 'on' : ''}">练习模式</button><button data-v="memo" class="${F.mode === 'memo' ? 'on' : ''}">背题模式</button></div>
    </div>
    <div class="row between" style="margin-top:16px"><span class="muted">符合条件：<b style="color:var(--text)">${list.length}</b> 题</span>
      <span class="row"><button class="btn sm" id="reset">重置</button><button class="btn pri" id="go">开始刷题 →</button></span></div>
  </div>
  <h2>按模块进度</h2>
  <div class="card bars">${MODULES.map(m => { const qs = QB.questions.filter(q => q.module === m); const d = qs.filter(q => S.rec[q.id]).length; return bar(m, d, qs.length, `${d}/${qs.length}`, `data-mod="${esc(m)}"`); }).join('')}</div>`;
  const v = $('#view');
  v.addEventListener('click', e => {
    const c = e.target.closest('.chip');
    if (c) { const arr = F[c.dataset.k]; let val = c.dataset.v; if (c.dataset.k === 'years') val = +val; const i = arr.indexOf(val); i >= 0 ? arr.splice(i, 1) : arr.push(val); if (c.dataset.k === 'mods') F.kp = ''; return routes.bank(); }
    const sb = e.target.closest('.seg button'); if (sb) { F[sb.parentNode.id] = sb.dataset.v; return routes.bank(); }
    const m = e.target.closest('[data-mod]'); if (m) { F.mods = [m.dataset.mod]; F.kp = ''; return routes.bank(); }
    if (e.target.id === 'reset') { F = { mods: [], kp: '', types: [], years: [], exams: [], scope: 'all', order: 'seq', limit: 0, mode: 'practice' }; return routes.bank(); }
    if (e.target.id === 'go') {
      let ids = filterQs(F).map(q => q.id); if (F.order === 'rand') ids = shuffle(ids); if (+F.limit) ids = ids.slice(0, +F.limit);
      const title = [F.mods.join('、'), F.kp, F.types.join('/'), F.years.map(y => y + '年').join('、')].filter(Boolean).join(' · ') || '全部题目';
      startSession(title, ids, F.mode);
    }
  });
  $('#kp').onchange = e => { F.kp = e.target.value; routes.bank(); };
  $('#limit').onchange = e => { F.limit = +e.target.value; };
};

/* ---------------- 历年真题 ---------------- */
routes.papers = () => {
  const ex = QB.exams.slice().sort((a, b) => b.date.localeCompare(a.date));
  $('#view').innerHTML = `<h1>📄 历年真题（${ex.length} 场）</h1>
  <div class="card list" style="padding:0">${ex.map(e => { const qs = QB.questions.filter(q => q.exam === e.id); const d = qs.filter(q => S.rec[q.id]).length; return `
    <div class="item"><div class="row between"><div><b>${esc(e.label)}</b><div class="tiny muted">${esc(e.subject)} · ${e.count} 题${e.files.length > 1 ? ` · 合并了 ${e.files.length} 份同场资料` : ''}</div></div>
    <div class="row"><span class="tag ${d === qs.length ? 'ok' : ''}">${d}/${qs.length}</span><button class="btn sm" data-p="${e.id}">练习</button><button class="btn sm pri" data-x="${e.id}">模考</button></div></div></div>`; }).join('')}</div>`;
  $('#view').addEventListener('click', e => {
    const p = e.target.closest('[data-p]'), x = e.target.closest('[data-x]');
    if (p) startSession(EXAM.get(p.dataset.p).label, QB.questions.filter(q => q.exam === p.dataset.p).map(q => q.id));
    if (x) startExam(x.dataset.x);
  });
};

/* ---------------- 答题界面 ---------------- */
let timerInt = null;
function stopTimer() { clearInterval(timerInt); timerInt = null; }
routes.quiz = () => {
  const ss = S.session;
  if (!ss) { $('#view').innerHTML = '<div class="empty">当前没有进行中的练习<br><br><a class="btn pri" href="#/bank">去刷题</a></div>'; return; }
  if (ss.idx >= ss.qids.length) ss.idx = ss.qids.length - 1;
  renderQuiz();
};
function fmtTime(ms) { ms = Math.max(0, ms); const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
function renderQuiz() {
  const ss = S.session; const id = ss.qids[ss.idx]; const q = QMAP.get(id);
  if (!q) { ss.idx++; return renderQuiz(); }
  const a = ss.ans[id]; const isExam = ss.mode === 'exam'; const memo = ss.mode === 'memo';
  const shown = !isExam && (a && a.done || memo);
  const multi = q.qtype === '多选' || q.qtype === '不定项';
  const sel = a ? a.sel : '';
  const mat = q.mat ? QB.materials[q.mat] : '';
  const g = q.group && GMAP.get(q.group);
  let opts = '';
  if (q.qtype !== '主观') {
    const o = q.qtype === '判断' ? ['正确（√）', '错误（×）'] : q.options;
    opts = `<div class="opts">${o.map((t, i) => { const k = L(i); let cls = 'opt' + (multi ? ' multi' : '');
      if (shown && q.answer) { if (q.answer.includes(k)) cls += sel.includes(k) || memo ? ' right' : ' missed'; else if (sel.includes(k)) cls += ' wrong'; }
      else if (sel.includes(k)) cls += ' sel';
      return `<button class="${cls}" data-o="${k}"><span class="k">${q.qtype === '判断' ? (i ? '×' : '√') : k}</span><span>${esc(t)}</span></button>`; }).join('')}</div>`;
  }
  const fb = shown ? feedback(q, a, memo) : '';
  const answeredCnt = Object.values(ss.ans).filter(x => x.sel || x.done).length;
  $('#view').innerHTML = `
  <div class="row between"><a href="#/${esc(ss.back || 'home')}" class="small">← 返回</a><span class="small muted clamp" style="max-width:60%">${esc(ss.title)}</span>
   ${isExam ? `<span class="tag bad" id="timer">${ss.limit ? fmtTime(ss.start + ss.limit - Date.now()) : ''}</span>` : `<span class="small muted">${memo ? '背题模式' : ss.mode === 'review' ? '复习模式' : '练习模式'}</span>`}</div>
  <div class="progress"><i style="width:${(ss.idx + 1) / ss.qids.length * 100}%"></i></div>
  <div class="card">
    <div class="qhead"><span class="tag pri">${q.qtype}${q.section === '案例分析' ? '·案例' : ''}</span><span class="small muted">${ss.idx + 1}/${ss.qids.length}</span><span class="tiny muted grow">${esc(qLabel(q))}</span>
      <button class="icon-btn star ${S.fav[id] ? 'on' : ''}" id="fav" title="收藏">${S.fav[id] ? '★' : '☆'}</button><button class="icon-btn" id="note" title="笔记">📝</button></div>
    ${mat ? `<div class="material" id="mat"><b>【材料】</b>\n${esc(mat)}</div>` : ''}
    <div class="stem">${esc(q.stem)}</div>
    ${opts}
    ${q.qtype === '主观' && !shown ? `<button class="btn pri" id="showans">查看参考答案</button>` : ''}
    ${!shown && multi && !isExam ? `<button class="btn pri" id="submit" style="margin-top:12px" ${sel ? '' : 'disabled'}>提交答案</button>` : ''}
    ${fb}
    ${S.notes[id] ? `<div class="note" style="margin-top:12px">📝 ${esc(S.notes[id])}</div>` : ''}
  </div>
  <div class="quizbar">
    <button class="btn" id="prev" ${ss.idx ? '' : 'disabled'}>上一题</button>
    <button class="btn" id="sheet">答题卡 ${answeredCnt}/${ss.qids.length}</button>
    ${isExam ? `<button class="btn danger" id="finish">交卷</button>` : ''}
    <button class="btn pri grow" id="next">${ss.idx === ss.qids.length - 1 ? (isExam ? '交卷' : '完成') : '下一题'}</button>
  </div>
  <div class="tiny muted hide-m" style="text-align:center">快捷键：<span class="kbd">A–E</span>/<span class="kbd">1–5</span> 选择 · <span class="kbd">Enter</span> 提交/下一题 · <span class="kbd">←</span><span class="kbd">→</span> 翻页 · <span class="kbd">F</span> 收藏</div>`;
  if (isExam && ss.limit) { stopTimer(); timerInt = setInterval(() => { const t = $('#timer'); const left = ss.start + ss.limit - Date.now(); if (t) t.textContent = fmtTime(left); if (left <= 0) { stopTimer(); toast('时间到，自动交卷'); finishExam(); } }, 1000); }
  bindQuiz(q, multi);
}
function feedback(q, a, memo) {
  const g = q.group && GMAP.get(q.group);
  let res = '';
  if (q.qtype === '主观') res = `<div class="res">📖 参考答案 / 解析</div>`;
  else if (memo) res = `<div class="res">✅ 正确答案：${ansText(q)}</div>`;
  else if (!q.answer) res = `<div class="res">⚠️ 原资料未给出本题答案</div>`;
  else res = a.ok ? `<div class="res" style="color:var(--ok)">✔ 回答正确</div>` : `<div class="res" style="color:var(--bad)">✘ 回答错误　你的答案：${a.sel ? (q.qtype === '判断' ? (a.sel === 'A' ? '√' : '×') : a.sel) : '未作答'}</div>`;
  const cls = q.qtype === '主观' || memo || !q.answer ? 'na' : a.ok ? 'ok' : 'bad';
  const others = g && g.size > 1 ? `<div style="margin-top:10px"><a href="#/group/${g.id}">🧩 同类题 ${g.size} 道 · 考过 ${g.years.join('、')} →</a></div>` : '';
  return `<div class="fb ${cls}">${res}
    ${q.qtype !== '主观' ? `<div class="small" style="margin-top:4px">正确答案：<b>${ansText(q)}</b> ${srcTag(q.asrc)}</div>` : ''}
    ${q.anote ? `<div class="small" style="margin-top:4px;color:var(--warn)">⚠️ ${esc(q.anote)}</div>` : ''}
    <div class="expl">${q.expl ? `<b>【解析】</b>${srcTag(q.esrc)}\n${esc(q.expl)}` : '<span class="muted">原资料暂无本题解析，可点击 📝 记录自己的理解。</span>'}</div>
    <div style="margin-top:10px"><span class="tag">${esc(q.module)}</span><a class="tag pri" href="javascript:void 0" data-kp="${esc(q.kp)}">${esc(q.kp)}</a>${q.concept ? `<span class="tag">考点：${esc(q.concept)}</span>` : ''}</div>
    ${others}
    ${memo || q.qtype === '主观' ? `<div class="row" style="margin-top:12px"><span class="small muted">掌握程度：</span><button class="btn sm" data-rate="0">😕 不熟，加入复习</button><button class="btn sm" data-rate="1">😀 已掌握</button></div>` : ''}
  </div>`;
}
function bindQuiz(q, multi) {
  const ss = S.session; const id = q.id; const isExam = ss.mode === 'exam'; const memo = ss.mode === 'memo';
  const a = () => ss.ans[id] || (ss.ans[id] = { sel: '', done: false, ok: null });
  const submit = () => {
    const x = a(); if (x.done) return;
    x.done = true; x.ok = judgeAns(q, x.sel); record(q, x.sel, x.ok); renderQuiz();
    if (x.ok && S.settings.autoNext && ss.idx < ss.qids.length - 1) setTimeout(() => { if (S.session === ss && ss.qids[ss.idx] === id) { ss.idx++; save(); renderQuiz(); window.scrollTo(0, 0); } }, 700);
  };
  $$('.opt').forEach(b => b.onclick = () => {
    const x = a(); if (x.done && !isExam) return; if (memo) return;
    const k = b.dataset.o;
    if (multi) { x.sel = x.sel.includes(k) ? x.sel.replace(k, '') : [...x.sel + k].sort().join(''); save(); renderQuiz(); }
    else { x.sel = k; save(); if (isExam) { renderQuiz(); if (ss.idx < ss.qids.length - 1) setTimeout(() => { if (S.session === ss && ss.qids[ss.idx] === id) { ss.idx++; save(); renderQuiz(); } }, 250); } else submit(); }
  });
  const sb = $('#submit'); if (sb) sb.onclick = submit;
  const sa = $('#showans'); if (sa) sa.onclick = () => { const x = a(); x.done = true; save(); renderQuiz(); };
  if (memo && !(ss.ans[id] && ss.ans[id].seen)) { a().seen = true; const r = S.rec[id] || (S.rec[id] = { n: 0, ok: 0, last: 0, lastOk: null, sel: '', memo: true }); r.last = Date.now(); save(); }
  $('#prev').onclick = () => { if (ss.idx > 0) { ss.idx--; save(); renderQuiz(); window.scrollTo(0, 0); } };
  $('#next').onclick = () => {
    if (ss.idx < ss.qids.length - 1) { ss.idx++; save(); renderQuiz(); window.scrollTo(0, 0); }
    else if (isExam) confirmFinish(); else finishPractice();
  };
  const fin = $('#finish'); if (fin) fin.onclick = confirmFinish;
  $('#sheet').onclick = showSheet;
  $('#fav').onclick = () => { if (S.fav[id]) delete S.fav[id]; else S.fav[id] = Date.now(); save(); toast(S.fav[id] ? '已收藏' : '已取消收藏'); renderQuiz(); };
  $('#note').onclick = () => editNote(id, renderQuiz);
  const mat = $('#mat'); if (mat) mat.onclick = () => mat.classList.toggle('open');
  $$('[data-rate]').forEach(b => b.onclick = () => { srsRate(id, b.dataset.rate === '1'); toast(b.dataset.rate === '1' ? '已标记掌握' : '已加入艾宾浩斯复习计划'); $('#next').click(); });
  $$('[data-kp]').forEach(b => b.onclick = () => startSession('考点：' + b.dataset.kp, QB.questions.filter(x => x.kp === b.dataset.kp).map(x => x.id)));
}
document.addEventListener('keydown', e => {
  if (!location.hash.startsWith('#/quiz') || !S.session || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || !$('#modal').classList.contains('hidden')) return;
  const k = e.key.toUpperCase();
  let opt = null;
  if (/^[A-F]$/.test(k)) opt = k; if (/^[1-6]$/.test(k)) opt = L(+k - 1);
  if (opt) { const b = $(`.opt[data-o="${opt}"]`); if (b) b.click(); return; }
  if (e.key === 'Enter') { const sb = $('#submit'); if (sb && !sb.disabled) sb.click(); else $('#next')?.click(); }
  if (e.key === 'ArrowRight') $('#next')?.click();
  if (e.key === 'ArrowLeft') $('#prev')?.click();
  if (k === 'F') $('#fav')?.click();
});
function showSheet() {
  const ss = S.session; const isExam = ss.mode === 'exam';
  modal(`<div class="row between"><b>答题卡</b><button class="btn sm" data-close>关闭</button></div>
  <div class="tiny muted" style="margin:6px 0 10px">${isExam ? '蓝色=已作答' : '绿色=答对 红色=答错 蓝色=已选未提交'}</div>
  <div class="sheet">${ss.qids.map((id, i) => { const a = ss.ans[id]; let c = ''; if (a) { if (!isExam && a.done) c = a.ok === false ? 'bad' : 'ok'; else if (a.sel) c = 'ans'; } return `<button class="${c} ${i === ss.idx ? 'cur' : ''}" data-i="${i}">${i + 1}</button>`; }).join('')}</div>`);
  $$('.sheet button').forEach(b => b.onclick = () => { ss.idx = +b.dataset.i; save(); closeModal(); renderQuiz(); window.scrollTo(0, 0); });
}
function editNote(id, cb) {
  modal(`<b>📝 我的笔记</b><div class="tiny muted" style="margin:4px 0 8px">${esc(QMAP.get(id).stem.slice(0, 60))}…</div><textarea id="nt" placeholder="写下你的理解、口诀、易错点…">${esc(S.notes[id] || '')}</textarea>
  <div class="row" style="margin-top:10px;justify-content:flex-end"><button class="btn" data-close>取消</button><button class="btn pri" id="ntsave">保存</button></div>`);
  $('#nt').focus();
  $('#ntsave').onclick = () => { const v = $('#nt').value.trim(); if (v) S.notes[id] = v; else delete S.notes[id]; save(); closeModal(); toast('笔记已保存'); cb && cb(); };
}
function finishPractice() {
  const ss = S.session; const vals = ss.qids.map(id => ss.ans[id]).filter(a => a && a.done && a.ok !== null);
  const ok = vals.filter(a => a.ok).length;
  modal(`<div style="text-align:center"><div style="font-size:44px">🎉</div><h2 style="margin:6px 0">本轮练习完成</h2>
   <p class="muted">共 ${ss.qids.length} 题，作答 ${vals.length} 题，答对 ${ok} 题，正确率 ${vals.length ? Math.round(ok / vals.length * 100) : 0}%</p>
   <div class="row" style="justify-content:center"><button class="btn" id="redo">只练本轮错题</button><a class="btn pri" href="#/home" data-close>回首页</a></div></div>`);
  $('#redo').onclick = () => { const ids = ss.qids.filter(id => ss.ans[id] && ss.ans[id].ok === false); closeModal(); if (!ids.length) return toast('本轮没有错题 👍'); startSession(ss.title + '（错题）', ids); };
}

/* ---------------- 模拟考试 ---------------- */
routes.exam = () => {
  const ex = QB.exams.filter(e => e.count >= 60).sort((a, b) => b.date.localeCompare(a.date));
  $('#view').innerHTML = `<h1>⏱️ 模拟考试</h1>
  <div class="card"><b>智能组卷（按近年真题结构）</b><div class="small muted" style="margin:4px 0 10px">判断 24 + 单选 45 + 多选 10 + 案例分析 8，共 100 分，限时 120 分钟。从全部真题中随机抽取，优先抽取你未做过的题。</div>
   <button class="btn pri" id="smart">开始智能模考</button></div>
  <div class="card"><b>整套真题模考</b><div class="small muted" style="margin:4px 0 10px">按原卷顺序作答，限时 120 分钟，交卷后自动评分并加入错题本。</div>
   <div class="list">${ex.map(e => `<div class="item row between" data-x="${e.id}"><span>${esc(e.label)}</span><span class="tag">${e.count}题</span></div>`).join('')}</div></div>
  <h2>考试记录</h2>
  <div class="card list" style="padding:0">${S.exams.length ? S.exams.slice().reverse().map((r, i) => `<div class="item row between" data-r="${S.exams.length - 1 - i}"><span>${esc(r.title)}<div class="tiny muted">${new Date(r.t).toLocaleString('zh-CN')}</div></span><b>${r.score}/${r.full} 分</b></div>`).join('') : '<div class="empty">还没有考试记录</div>'}</div>`;
  $('#view').addEventListener('click', e => {
    const x = e.target.closest('[data-x]'); if (x) return startExam(x.dataset.x);
    const r = e.target.closest('[data-r]'); if (r) return go('result/' + r.dataset.r);
    if (e.target.id === 'smart') smartExam();
  });
};
function startExam(eid) {
  const ids = QB.questions.filter(q => q.exam === eid && q.qtype !== '主观').map(q => q.id);
  startSession('模考：' + EXAM.get(eid).label, ids, 'exam', { limit: 120 * 60000, back: 'exam' });
}
function smartExam() {
  const pool = t => { const qs = QB.questions.filter(q => q.qtype === t && q.answer && q.year >= 2018); const fresh = shuffle(qs.filter(q => !S.rec[q.id])); const old = shuffle(qs.filter(q => S.rec[q.id])); return fresh.concat(old); };
  const pick = (t, n) => pool(t).slice(0, n).map(q => q.id);
  // 案例：按材料成组抽 4 组
  const mats = shuffle([...new Set(QB.questions.filter(q => q.qtype === '不定项' && q.mat && q.answer && q.year >= 2018).map(q => q.mat))]);
  let caseIds = [];
  for (const m of mats) { const qs = QB.questions.filter(q => q.mat === m && q.qtype === '不定项'); if (qs.length >= 2) caseIds.push(...qs.slice(0, 2).map(q => q.id)); if (caseIds.length >= 8) break; }
  const ids = [...pick('判断', 24), ...pick('单选', 45), ...pick('多选', 10), ...caseIds.slice(0, 8)];
  startSession('智能组卷模考', ids, 'exam', { limit: 120 * 60000, back: 'exam' });
}
function confirmFinish() {
  const ss = S.session; const un = ss.qids.filter(id => !(ss.ans[id] && ss.ans[id].sel)).length;
  modal(`<b>确认交卷？</b><p class="muted">${un ? `还有 <b style="color:var(--bad)">${un}</b> 题未作答。` : '已全部作答。'}</p><div class="row" style="justify-content:flex-end"><button class="btn" data-close>继续答题</button><button class="btn pri" id="dofin">交卷</button></div>`);
  $('#dofin').onclick = () => { closeModal(); finishExam(); };
}
function finishExam() {
  stopTimer();
  const ss = S.session; let score = 0, full = 0; const byMod = {}; const wrong = [];
  for (const id of ss.qids) {
    const q = QMAP.get(id); const a = ss.ans[id] || { sel: '' }; const w = WEIGHT[q.qtype] || 1;
    if (!q.answer) continue;
    full += w; const ok = a.sel === q.answer; if (ok) score += w; else wrong.push(id);
    const m = byMod[q.module] || (byMod[q.module] = { n: 0, ok: 0 }); m.n++; if (ok) m.ok++;
    a.done = true; a.ok = ok; ss.ans[id] = a;
    record(q, a.sel, ok);
  }
  const r = { title: ss.title, t: Date.now(), score: Math.round(score * 10) / 10, full: Math.round(full * 10) / 10, used: Date.now() - ss.start, byMod, wrong, qids: ss.qids, ans: Object.fromEntries(ss.qids.map(id => [id, (ss.ans[id] || {}).sel || ''])) };
  S.exams.push(r); if (S.exams.length > 30) S.exams.shift();
  S.session = null; saveNow();
  go('result/' + (S.exams.length - 1));
}
routes.result = (i) => {
  const r = S.exams[+i]; if (!r) return go('exam');
  const pct = r.full ? r.score / r.full : 0;
  $('#view').innerHTML = `<a href="#/exam" class="small">← 模拟考试</a><h1>📝 ${esc(r.title)}</h1>
  <div class="card row" style="gap:20px"><div class="ring" style="background:conic-gradient(var(--pri) ${pct * 360}deg,var(--line) 0)"><div><b style="font-size:22px">${r.score}</b><span class="tiny muted">/ ${r.full} 分</span></div></div>
   <div><div>得分率 <b>${Math.round(pct * 100)}%</b></div><div class="muted small">用时 ${fmtTime(r.used)} · 错 ${r.wrong.length} 题（已加入错题本）</div>
   <div class="row" style="margin-top:8px"><button class="btn pri" id="rv">查看错题解析</button><button class="btn" id="rall">逐题回顾</button></div></div></div>
  <h2>各模块得分</h2><div class="card bars">${Object.entries(r.byMod).map(([m, v]) => bar(m, v.ok, v.n, `${v.ok}/${v.n}`)).join('')}</div>`;
  const review = (ids) => { const ans = {}; ids.forEach(id => { const q = QMAP.get(id); const sel = r.ans[id] || ''; ans[id] = { sel, done: true, ok: q.answer ? sel === q.answer : null }; }); S.session = { title: r.title + '（回顾）', qids: ids, idx: 0, mode: 'practice', ans, start: Date.now(), limit: 0, back: 'result/' + i }; save(); go('quiz'); };
  $('#rv').onclick = () => r.wrong.length ? review(r.wrong) : toast('全对，太棒了！');
  $('#rall').onclick = () => review(r.qids);
};

/* ---------------- 艾宾浩斯复习 ---------------- */
function startReview() { const ids = dueList(); if (!ids.length) return toast('今天没有需要复习的题目 👍'); startSession('今日艾宾浩斯复习', ids, 'review', { back: 'review' }); }
routes.review = () => {
  const due = dueList(); const all = Object.values(S.srs);
  const stages = Array(INTERVALS.length + 2).fill(0); all.forEach(s => { if (s.m) stages[INTERVALS.length + 1]++; else stages[Math.min(s.st, INTERVALS.length)]++; });
  const fc = []; for (let d = 0; d < 14; d++) { const st = dayStart() + d * DAY; fc.push(all.filter(s => !s.m && s.due && (d === 0 ? s.due < st + DAY : s.due >= st && s.due < st + DAY)).length); }
  const mx = Math.max(1, ...fc);
  $('#view').innerHTML = `<h1>🧠 艾宾浩斯复习</h1>
  <div class="grid g3"><div class="kpi pri"><div class="l">今日待复习</div><div class="v">${due.length}</div></div><div class="kpi"><div class="l">复习计划中</div><div class="v">${all.filter(s => !s.m).length}</div></div><div class="kpi"><div class="l">已牢固掌握</div><div class="v">${stages[INTERVALS.length + 1]}</div></div></div>
  <div class="card" style="margin-top:14px"><button class="btn pri block" id="start" ${due.length ? '' : 'disabled'}>${due.length ? `开始今日复习（${due.length} 题）` : '今日复习已完成 ✔'}</button>
   <div class="small muted" style="margin-top:10px">记忆曲线：做错的题目 1 天后复习；每答对一次，间隔依次延长为 ${INTERVALS.join(' → ')} 天，连续通过全部节点即视为「牢固掌握」。答错则回到第 1 天重新开始。</div></div>
  <h2>未来 14 天复习量</h2><div class="card"><div class="spark">${fc.map((n, i) => `<i title="${n}题" style="height:${n / mx * 100}%"></i>`).join('')}</div><div class="row between tiny muted"><span>今天</span><span>7天后</span><span>14天后</span></div></div>
  <h2>记忆阶段分布</h2><div class="card bars">${stages.map((n, i) => bar(i === INTERVALS.length + 1 ? '已掌握' : i === 0 ? '新进/答错' : `第${i}轮（${INTERVALS[i - 1]}天后）`, n, Math.max(1, ...stages))).join('')}</div>
  <div class="grid g3"><a class="btn" href="#/wrong">❌ 错题本 ${Object.keys(S.wrong).length}</a><a class="btn" href="#/fav">⭐ 收藏 ${Object.keys(S.fav).length}</a><a class="btn" href="#/notes">📝 笔记 ${Object.keys(S.notes).length}</a></div>`;
  $('#start').onclick = startReview;
};

/* ---------------- 错题 / 收藏 / 笔记 ---------------- */
function qList(ids, extra = () => '') {
  if (!ids.length) return '<div class="empty">这里还空空的</div>';
  return `<div class="card list" style="padding:0">${ids.map((id, i) => { const q = QMAP.get(id); if (!q) return ''; return `<div class="item" data-i="${i}"><div class="clamp">${esc(q.stem)}</div><div class="tiny muted" style="margin-top:4px"><span class="tag pri">${q.qtype}</span>${esc(q.kp)} · ${esc(qLabel(q))} ${extra(id)}</div></div>`; }).join('')}</div>`;
}
function listPage(title, ids, extra, actions = '') {
  $('#view').innerHTML = `<h1>${title}</h1><div class="row" style="margin-bottom:12px">${ids.length ? `<button class="btn pri" id="all">全部练习（${ids.length}）</button><button class="btn" id="memo">背题模式</button>` : ''}${actions}</div>${qList(ids, extra)}`;
  const back = location.hash.slice(2);
  $('#all') && ($('#all').onclick = () => startSession(title.replace(/^\S+\s/, ''), ids, 'practice', { back }));
  $('#memo') && ($('#memo').onclick = () => startSession(title.replace(/^\S+\s/, ''), ids, 'memo', { back }));
  $$('.list .item').forEach(it => it.onclick = () => startSession(title.replace(/^\S+\s/, ''), ids, 'practice', { idx: +it.dataset.i, back }));
}
routes.wrong = () => {
  const ids = Object.entries(S.wrong).filter(([id]) => QMAP.has(id)).sort((a, b) => b[1].t - a[1].t).map(([id]) => id);
  listPage('❌ 错题本', ids, id => `· 错 ${S.wrong[id].cnt} 次 · 连对 ${S.wrong[id].streak}/${S.settings.removeN}`, `<span class="small muted">连续答对 ${S.settings.removeN} 次自动移出</span>`);
};
routes.fav = () => listPage('⭐ 我的收藏', Object.entries(S.fav).filter(([id]) => QMAP.has(id)).sort((a, b) => b[1] - a[1]).map(([id]) => id));
routes.notes = () => {
  const ids = Object.keys(S.notes).filter(id => QMAP.has(id));
  listPage('📝 我的笔记', ids, id => `<div class="note" style="margin-top:6px">${esc(S.notes[id])}</div>`);
};

/* ---------------- 同类题合并 ---------------- */
let GF = { mod: '', q: '', min: 2 };
routes.groups = () => {
  let gs = QB.groups.filter(g => g.size >= GF.min && (!GF.mod || g.module === GF.mod) && (!GF.q || g.name.includes(GF.q) || g.kp.includes(GF.q)));
  gs.sort((a, b) => b.exams.length - a.exams.length || b.size - a.size);
  $('#view').innerHTML = `<h1>🧩 同类题合并</h1>
  <div class="card small muted">系统将历年真题按「考点 + 题干相似度」自动聚类：同一考点反复出现的题目合并成一个题组。先学题组里的<b>代表题</b>（含完整解析），再快速过一遍变式题，<b>一次学懂，不再重复刷</b>。共 ${QB.groups.filter(g => g.size > 1).length} 个题组，覆盖 ${QB.meta.inGroups} 道题。</div>
  <div class="row" style="margin-bottom:10px"><input type="search" id="gq" placeholder="搜索考点，如：最近发展区、学生伤害事故" value="${esc(GF.q)}" class="grow">
   <select id="gm"><option value="">全部模块</option>${MODULES.map(m => `<option ${GF.mod === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
   <select id="gmin">${[[2, '≥2 题'], [3, '≥3 题'], [5, '≥5 题'], [1, '含单题']].map(([v, t]) => `<option value="${v}" ${GF.min == v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
  <div class="small muted" style="margin-bottom:8px">${gs.length} 个题组 · 按「考过的场次」排序</div>
  <div class="card list" style="padding:0">${gs.slice(0, 300).map(g => { const d = g.qids.filter(id => S.rec[id]).length; return `<a class="item" href="#/group/${g.id}"><div class="row between"><b>${esc(g.name)}</b><span class="row" style="gap:4px">${g.exams.length >= 4 ? '<span class="tag bad">高频</span>' : ''}<span class="tag pri">${g.size} 题</span></span></div>
   <div class="tiny muted" style="margin-top:3px">${esc(g.module)} › ${esc(g.kp)} · 考过 ${g.exams.length} 场：${g.years.join('、')} · 已做 ${d}/${g.size}</div></a>`; }).join('')}${gs.length > 300 ? '<div class="empty">仅显示前 300 个，请用搜索缩小范围</div>' : ''}</div>`;
  $('#gq').oninput = e => { GF.q = e.target.value.trim(); clearTimeout(window._gq); window._gq = setTimeout(() => { routes.groups(); const i = $('#gq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300); };
  $('#gm').onchange = e => { GF.mod = e.target.value; routes.groups(); };
  $('#gmin').onchange = e => { GF.min = +e.target.value; routes.groups(); };
};
routes.group = (gid) => {
  const g = GMAP.get(gid); if (!g) return go('groups');
  const can = QMAP.get(g.canon);
  const qhtml = (q, open) => { const mat = q.mat ? QB.materials[q.mat] : '';
    return `<div class="tiny muted">${esc(qLabel(q))} <span class="tag pri">${q.qtype}</span></div>
    ${mat ? `<details><summary class="small">查看材料</summary><div class="material">${esc(mat)}</div></details>` : ''}
    <div class="stem" style="font-size:15.5px;margin:6px 0">${esc(q.stem)}</div>
    ${q.qtype !== '判断' && q.options.length ? `<div class="small">${q.options.map((o, i) => `<div style="${q.answer && q.answer.includes(L(i)) ? 'color:var(--ok);font-weight:600' : ''}">${L(i)}. ${esc(o)}</div>`).join('')}</div>` : ''}
    <div class="small" style="margin-top:6px">答案：<b style="color:var(--ok)">${ansText(q)}</b> ${srcTag(q.asrc)}</div>
    ${q.expl ? (open ? `<div class="expl small"><b>解析：</b>${esc(q.expl)}</div>` : `<details><summary class="small">展开解析</summary><div class="expl small">${esc(q.expl)}</div></details>`) : ''}`; };
  $('#view').innerHTML = `<a href="#/groups" class="small">← 同类题合并</a>
  <h1>🧩 ${esc(g.name)}</h1>
  <div class="row small muted" style="margin:-6px 0 12px"><span>${esc(g.module)} › ${esc(g.kp)}</span><span>· ${g.size} 道同类题 · 考过 ${g.exams.length} 场（${g.years.join('、')}）</span></div>
  <div class="row" style="margin-bottom:12px"><button class="btn pri" id="pg">练习本组（${g.size}）</button><button class="btn" id="mg">背题模式</button></div>
  <h2>⭐ 代表题（先学这道）</h2><div class="card">${qhtml(can, true)}</div>
  ${g.size > 1 ? `<h2>🔁 变式 / 重复考查（${g.size - 1}）</h2>${g.qids.slice(1).map(id => `<div class="card">${qhtml(QMAP.get(id), false)}</div>`).join('')}` : ''}`;
  $('#pg').onclick = () => startSession('题组：' + g.name, g.qids, 'practice', { back: 'group/' + gid });
  $('#mg').onclick = () => startSession('题组：' + g.name, g.qids, 'memo', { back: 'group/' + gid });
};

/* ---------------- 高频考点分析 ---------------- */
function topKps() {
  const m = {};
  for (const q of QB.questions) { const k = m[q.kp] || (m[q.kp] = { kp: q.kp, module: q.module, count: 0, exams: new Set(), recent: 0 }); k.count++; k.exams.add(q.exam); if (q.year >= QB.meta.yearMax - 2) k.recent++; }
  return Object.values(m).map(k => Object.assign(k, { ne: k.exams.size })).sort((a, b) => b.count - a.count);
}
routes.analysis = () => {
  const kps = topKps(); const qs = QB.questions;
  const mods = MODULES.map(m => ({ m, n: qs.filter(q => q.module === m).length }));
  const years = [...new Set(qs.map(q => q.year))].sort();
  const yc = {}; qs.forEach(q => { yc[q.year] = yc[q.year] || {}; yc[q.year][q.module] = (yc[q.year][q.module] || 0) + 1; });
  const ytot = y => Object.values(yc[y]).reduce((a, b) => a + b, 0);
  const types = {}; qs.forEach(q => types[q.qtype] = (types[q.qtype] || 0) + 1);
  const topG = QB.groups.filter(g => g.size > 1).sort((a, b) => b.exams.length - a.exams.length || b.size - a.size).slice(0, 20);
  const nExams = QB.exams.length;
  const recentKps = kps.filter(k => k.recent >= 3).sort((a, b) => b.recent - a.recent).slice(0, 12);
  $('#view').innerHTML = `<h1>📊 高频考点分析</h1>
  <div class="grid g4"><div class="kpi"><div class="l">考试场次</div><div class="v">${nExams}</div></div><div class="kpi"><div class="l">真题总数</div><div class="v">${qs.length}</div></div><div class="kpi"><div class="l">覆盖年份</div><div class="v">${QB.meta.yearMin}–${String(QB.meta.yearMax).slice(2)}</div></div><div class="kpi"><div class="l">同类题组</div><div class="v">${QB.meta.multiGroups}</div></div></div>
  <h2>各模块占比</h2><div class="card bars">${mods.map(x => bar(x.m, x.n, mods[0] ? Math.max(...mods.map(y => y.n)) : 1, `${(x.n / qs.length * 100).toFixed(1)}%`, `data-mod="${esc(x.m)}"`)).join('')}</div>
  <h2>知识点频次 Top 30 <span class="small muted" style="font-weight:400">（点击即可专项练习）</span></h2>
  <div class="card bars">${kps.slice(0, 30).map(k => bar(k.kp, k.count, kps[0].count, `${k.count}`, `data-kp="${esc(k.kp)}" title="${k.ne}/${nExams} 场考过"`)).join('')}<div class="tiny muted">数字为历年出题数；悬停可见考过场次</div></div>
  <h2>近 3 年（${QB.meta.yearMax - 2}–${QB.meta.yearMax}）热点</h2>
  <div class="card bars">${recentKps.map(k => bar(k.kp, k.recent, recentKps[0].recent, `${k.recent}`, `data-kp="${esc(k.kp)}"`)).join('')}</div>
  <h2>模块 × 年份 热力图（占当年题量%）</h2>
  <div class="card heat"><table><tr><th>模块</th>${years.map(y => `<th>${String(y).slice(2)}</th>`).join('')}</tr>${MODULES.map(m => `<tr><td class="l">${m}</td>${years.map(y => { const v = (yc[y][m] || 0) / ytot(y); return `<td style="background:rgba(37,99,235,${Math.min(1, v * 3.2).toFixed(2)});color:${v > .18 ? '#fff' : 'inherit'}">${Math.round(v * 100)}</td>`; }).join('')}</tr>`).join('')}</table></div>
  <h2>反复考查的题组 Top 20</h2>
  <div class="card list" style="padding:0">${topG.map(g => `<a class="item" href="#/group/${g.id}"><div class="row between"><b>${esc(g.name)}</b><span class="tag bad">${g.exams.length} 场</span></div><div class="tiny muted">${esc(g.kp)} · ${g.size} 题 · ${g.years.join('、')}</div></a>`).join('')}</div>
  <h2>题型分布</h2><div class="card bars">${Object.entries(types).sort((a, b) => b[1] - a[1]).map(([t, n]) => bar(t, n, qs.length, `${n}`)).join('')}</div>
  <div class="card small muted">说明：知识点由系统依据「本题考查…」解析语句与关键词自动归类，同类题组由考点词 + 题干文本相似度聚类得到，仅供复习参考。</div>`;
  $('#view').addEventListener('click', e => {
    const k = e.target.closest('[data-kp]'); if (k) return startSession('考点：' + k.dataset.kp, QB.questions.filter(q => q.kp === k.dataset.kp).map(q => q.id), 'practice', { back: 'analysis' });
    const m = e.target.closest('[data-mod]'); if (m) { F.mods = [m.dataset.mod]; F.kp = ''; go('bank'); }
  });
};

/* ---------------- 学习统计 ---------------- */
routes.stats = () => {
  const recs = Object.entries(S.rec).filter(([id]) => QMAP.has(id));
  const n = recs.reduce((a, [, r]) => a + r.n, 0), ok = recs.reduce((a, [, r]) => a + r.ok, 0);
  const days = []; for (let i = 29; i >= 0; i--) { const k = todayKey(Date.now() - i * DAY); days.push((S.daily[k] || { n: 0 }).n); }
  const mx = Math.max(1, ...days);
  $('#view').innerHTML = `<h1>📈 学习统计</h1>
  <div class="grid g4"><div class="kpi"><div class="l">累计答题</div><div class="v">${n}</div></div><div class="kpi"><div class="l">总正确率</div><div class="v">${n ? Math.round(ok / n * 100) : 0}%</div></div><div class="kpi"><div class="l">学习天数</div><div class="v">${Object.keys(S.daily).length}</div></div><div class="kpi"><div class="l">连续学习</div><div class="v">${streakDays()}天</div></div></div>
  <h2>近 30 天答题量</h2><div class="card"><div class="spark">${days.map(d => `<i title="${d}题" style="height:${d / mx * 100}%"></i>`).join('')}</div><div class="row between tiny muted"><span>30天前</span><span>今天</span></div></div>
  <h2>各模块：覆盖率 / 正确率</h2><div class="card">${MODULES.map(m => { const qs = QB.questions.filter(q => q.module === m); const rs = qs.map(q => S.rec[q.id]).filter(Boolean); const tn = rs.reduce((a, r) => a + r.n, 0), tk = rs.reduce((a, r) => a + r.ok, 0);
    return `<div style="margin:10px 0"><div class="row between small"><b>${m}</b><span class="muted">已做 ${rs.length}/${qs.length} · 正确率 ${tn ? Math.round(tk / tn * 100) : '-'}%</span></div><div class="progress" style="margin:4px 0"><i style="width:${rs.length / qs.length * 100}%"></i></div></div>`; }).join('')}</div>
  <h2>薄弱知识点（正确率最低）</h2><div class="card bars">${weakKps().map(k => bar(k.kp, Math.round(k.acc * 100), 100, Math.round(k.acc * 100) + '%', `data-kp="${esc(k.kp)}"`)).join('') || '<div class="empty">多做些题后这里会显示你的薄弱点</div>'}</div>`;
  $('#view').addEventListener('click', e => { const k = e.target.closest('[data-kp]'); if (k) startSession('薄弱点：' + k.dataset.kp, QB.questions.filter(q => q.kp === k.dataset.kp).map(q => q.id), 'practice', { back: 'stats' }); });
};
function weakKps() {
  const m = {}; for (const q of QB.questions) { const r = S.rec[q.id]; if (!r || !r.n) continue; const k = m[q.kp] || (m[q.kp] = { kp: q.kp, n: 0, ok: 0 }); k.n += r.n; k.ok += r.ok; }
  return Object.values(m).filter(k => k.n >= 3).map(k => Object.assign(k, { acc: k.ok / k.n })).sort((a, b) => a.acc - b.acc).slice(0, 10);
}

/* ---------------- 搜索 ---------------- */
let SQ = '';
routes.search = () => {
  $('#view').innerHTML = `<h1>🔍 搜索题目</h1><input type="search" id="sq" placeholder="输入关键词：如 最近发展区、班级授课制、教师法…" value="${esc(SQ)}" autofocus><div id="sr" style="margin-top:12px"></div>`;
  const run = () => {
    SQ = $('#sq').value.trim(); const box = $('#sr');
    if (SQ.length < 2) { box.innerHTML = '<div class="empty">至少输入 2 个字</div>'; return; }
    const words = SQ.split(/\s+/);
    const res = QB.questions.filter(q => { const t = q.stem + q.options.join('') + (q.expl || '') + q.kp + (q.concept || ''); return words.every(w => t.includes(w)); });
    const hl = s => { let h = esc(s); words.forEach(w => { h = h.split(esc(w)).join(`<span class="hl">${esc(w)}</span>`); }); return h; };
    box.innerHTML = `<div class="small muted" style="margin-bottom:8px">找到 ${res.length} 题${res.length > 200 ? '（显示前 200）' : ''}</div>` + (res.length ? `<div class="row" style="margin-bottom:10px"><button class="btn pri sm" id="sall">练习全部结果</button></div><div class="card list" style="padding:0">${res.slice(0, 200).map((q, i) => `<div class="item" data-i="${i}"><div class="clamp">${hl(q.stem)}</div><div class="tiny muted">${esc(q.kp)} · ${esc(qLabel(q))}</div></div>`).join('')}</div>` : '');
    const ids = res.slice(0, 200).map(q => q.id);
    $('#sall') && ($('#sall').onclick = () => startSession('搜索：' + SQ, ids, 'practice', { back: 'search' }));
    $$('#sr .item').forEach(it => it.onclick = () => startSession('搜索：' + SQ, ids, 'practice', { idx: +it.dataset.i, back: 'search' }));
  };
  let t; $('#sq').oninput = () => { clearTimeout(t); t = setTimeout(run, 250); };
  run(); $('#sq').focus();
};

/* ---------------- 我的 / 设置 ---------------- */
routes.me = () => {
  const st = S.settings;
  $('#view').innerHTML = `<h1>👤 我的</h1>
  <div class="grid g3"><a class="btn block" href="#/stats">📈 学习统计</a><a class="btn block" href="#/wrong">❌ 错题本</a><a class="btn block" href="#/fav">⭐ 收藏</a><a class="btn block" href="#/notes">📝 笔记</a><a class="btn block" href="#/search">🔍 搜索</a><a class="btn block" href="#/papers">📄 历年真题</a></div>
  <h2>设置</h2><div class="card">
   <div class="row between" style="margin:6px 0"><span>外观主题</span><div class="seg" id="theme">${[['auto', '跟随系统'], ['light', '浅色'], ['dark', '深色']].map(([k, t]) => `<button data-v="${k}" class="${st.theme === k ? 'on' : ''}">${t}</button>`).join('')}</div></div>
   <div class="row between" style="margin:12px 0"><span>错题连续答对几次后移出</span><select id="rn">${[1, 2, 3, 4, 5].map(n => `<option ${st.removeN == n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
   <div class="row between" style="margin:12px 0"><span>艾宾浩斯复习范围</span><div class="seg" id="scope">${[['all', '所有做过的题'], ['wrong', '仅错题']].map(([k, t]) => `<button data-v="${k}" class="${st.srsScope === k ? 'on' : ''}">${t}</button>`).join('')}</div></div>
   <div class="row between" style="margin:12px 0"><span>答对后自动跳到下一题</span><div class="seg" id="autonext"><button data-v="1" class="${st.autoNext ? 'on' : ''}">开</button><button data-v="0" class="${!st.autoNext ? 'on' : ''}">关</button></div></div>
  </div>
  <h2>数据备份</h2><div class="card">
   <div class="small muted">学习记录只保存在当前浏览器里。换手机/电脑前请先导出备份，再在新设备导入。</div>
   <div class="row" style="margin-top:10px"><button class="btn pri" id="exp">⬇️ 导出备份</button><label class="btn">⬆️ 导入备份<input type="file" id="imp" accept=".json,application/json" hidden></label><button class="btn danger" id="clr">清空学习记录</button></div>
  </div>
  <h2>关于题库</h2><div class="card small">
   <p>共收录 <b>${QB.exams.length}</b> 场考试、<b>${QB.questions.length}</b> 道真题（${QB.meta.yearMin}–${QB.meta.yearMax}），来源于你提供的《教基》真题资料包（试卷 / 答案 / 解析 PDF，扫描件经 OCR 识别）。</p>
   <p>答案来源：<span class="tag ok">原卷答案</span> 来自答案 PDF；<span class="tag ok">原卷解析</span> 来自解析 PDF 中的结论；<span class="tag ai">AI</span> 标记为 AI 补充（如有）。题目为考生回忆版，个别题目可能存在文字识别误差，以官方为准。</p>
   <details><summary>收录试卷清单</summary><ul>${QB.exams.slice().sort((a, b) => a.date.localeCompare(b.date)).map(e => `<li>${esc(e.label)}（${e.count}题）<div class="tiny muted">${e.files.map(esc).join('；')}</div></li>`).join('')}</ul></details>
   <p class="tiny muted">数据版本：${esc(QB.meta.generated)}</p></div>`;
  const v = $('#view');
  v.querySelectorAll('.seg button').forEach(b => b.onclick = () => { const id = b.parentNode.id; if (id === 'theme') { st.theme = b.dataset.v; applyTheme(); } if (id === 'scope') st.srsScope = b.dataset.v; if (id === 'autonext') st.autoNext = b.dataset.v === '1'; save(); routes.me(); });
  $('#rn').onchange = e => { st.removeN = +e.target.value; save(); toast('已保存'); };
  $('#exp').onclick = () => { saveNow(); const blob = new Blob([JSON.stringify(Object.assign({ app: 'jiaoji-sc', exported: new Date().toISOString() }, S))], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `教基刷题备份_${todayKey()}.json`; document.body.appendChild(a); a.click(); a.remove(); toast('已导出备份文件'); };
  $('#imp').onchange = e => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { try { const d = JSON.parse(rd.result); if (!d.rec || !d.settings) throw 0; S = Object.assign(defState(), d); delete S.app; delete S.exported; saveNow(); applyTheme(); toast('导入成功'); routes.me(); } catch (err) { toast('导入失败：文件格式不正确'); } }; rd.readAsText(f); };
  $('#clr').onclick = () => { modal(`<b>确定清空所有学习记录？</b><p class="muted small">包括做题记录、错题、收藏、笔记和复习计划，且不可恢复。建议先导出备份。</p><div class="row" style="justify-content:flex-end"><button class="btn" data-close>取消</button><button class="btn danger" id="doclr">确认清空</button></div>`); $('#doclr').onclick = () => { const th = S.settings; S = defState(); S.settings = th; saveNow(); closeModal(); toast('已清空'); routes.me(); }; };
};

router();
