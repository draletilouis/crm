/* Lefori Sales: phone-first app for the field team. No build step, no framework. */
(() => {
  'use strict';

  const root = document.getElementById('root');
  const state = {
    user: null,
    meta: null,
    team: [],
    leadsFilter: { chip: 'open', q: '', agent: '' },
    todayAgent: '',
    numbersAgent: '',
  };

  // ---------- Small helpers

  const esc = (v) => String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const localDate = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const today = () => localDate(new Date());
  const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return localDate(d); };
  const parseDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  const daysFromToday = (iso) => Math.round((parseDate(iso) - parseDate(today())) / 86400000);

  function fmtDate(iso) {
    if (!iso) return '';
    const diff = daysFromToday(iso);
    if (diff === 0) return 'today';
    if (diff === 1) return 'tomorrow';
    if (diff === -1) return 'yesterday';
    const d = parseDate(iso);
    const opts = { weekday: 'short', day: 'numeric', month: 'short' };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString('en-GB', opts);
  }
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || `${one}s`)}`;
  const ugx = (n) => `UGX ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
  const firstName = (name) => String(name || '').split(/\s+/)[0];

  const stageLabel = (key) => (state.meta.stages.find((s) => s.key === key) || {}).label || key;
  const interestLabel = (key) => (state.meta.interest.find((s) => s.key === key) || {}).label || '';
  const isClosed = (lead) => lead.stage === 'paying' || lead.stage === 'lost';

  function dueText(lead) {
    if (isClosed(lead) || !lead.nextFollowUpOn) return '';
    const diff = daysFromToday(lead.nextFollowUpOn);
    if (diff < 0) return `${plural(-diff, 'day')} late`;
    if (diff === 0) return 'Due today';
    if (diff === 1) return 'Due tomorrow';
    const d = parseDate(lead.nextFollowUpOn);
    return `Due ${d.toLocaleDateString('en-GB', diff < 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' })}`;
  }

  const ICONS = {
    today: '<path d="M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/><path d="m9 15 2 2 4-4"/>',
    leads: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15v2M11 11v6M15 7v10M19 12v5"/>',
    more: '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z"/>',
    wa: '<path d="M3 21l1.6-4.7A8.5 8.5 0 1 1 7.9 19.6Z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.3-1.8-1-1 .8a4 4 0 0 1-2-2l.8-1-1-1.8Z"/>',
    log: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  };
  ICONS.back = '<path d="M15 18l-6-6 6-6"/>';
  ICONS.download = '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>';

  // The LEFORI lockup from the brand manual (mark, wordmark, tagline).
  const lockup = ({ onBlue = false, large = false, tagline = true } = {}) => `
    <span class="lockup${onBlue ? ' on-blue' : ''}${large ? ' large' : ''}">
      <img src="/icons/${onBlue ? 'mark-on-blue' : 'mark'}.svg" alt="">
      <span class="words"><span class="wm">LEFORI</span>${tagline ? '<span class="tg">next starts here</span>' : ''}</span>
    </span>`;

  const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

  function toast(message, isError) {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    const t = document.createElement('div');
    t.className = `toast${isError ? ' error' : ''}`;
    t.setAttribute('role', 'status');
    t.textContent = message;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), isError ? 5000 : 2600);
  }

  class ApiError extends Error {
    constructor(status, data) { super(data.error || 'Something went wrong'); this.status = status; this.data = data; }
  }

  async function api(path, { method = 'GET', body, form } = {}) {
    const headers = { 'X-Requested-With': 'lefori-sales' };
    let payload;
    if (form) payload = form;
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    let res;
    try {
      res = await fetch(`/api${path}`, { method, headers, body: payload, credentials: 'same-origin' });
    } catch {
      throw new ApiError(0, { error: 'No connection. Check your data and try again.' });
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !path.startsWith('/auth/login')) {
      state.user = null;
      renderLogin();
      throw new ApiError(401, data);
    }
    if (!res.ok) throw new ApiError(res.status, data);
    return data;
  }

  const showError = (err) => { if (err.status !== 401) toast(err.message, true); };

  // ---------- Shell and routing

  const NAV = [
    { href: '#/today', key: 'today', label: 'Today', icon: 'today' },
    { href: '#/leads', key: 'leads', label: 'Leads', icon: 'leads' },
    { href: '#/add', key: 'add', label: 'Add lead', icon: 'plus' },
    { href: '#/numbers', key: 'numbers', label: 'Numbers', icon: 'chart' },
    { href: '#/more', key: 'more', label: 'More', icon: 'more' },
  ];

  function renderShell() {
    root.innerHTML = `
      <header class="topbar">
        <button class="back" id="back" hidden aria-label="Back">${icon('back')}</button>
        <span id="topBrand">${lockup({ onBlue: true, tagline: false })} <span class="app-tag">SALES</span></span>
        <div class="title" id="topTitle" hidden></div>
        <div class="spacer"></div>
        <div class="who">${esc(firstName(state.user.name))}<small>${state.user.role === 'manager' ? 'Manager' : 'Agent'}</small></div>
      </header>
      <main id="main"></main>
      <nav class="nav" aria-label="Main">
        ${NAV.map((n) => `<a href="${n.href}" data-key="${n.key}" class="${n.key === 'add' ? 'add' : ''}">
          ${n.key === 'add' ? `<span class="plus">${icon(n.icon)}</span>` : icon(n.icon)}<span>${n.label}</span></a>`).join('')}
      </nav>`;
    document.getElementById('back').addEventListener('click', () => history.back());
  }

  function setChrome(navKey, { title, back } = {}) {
    document.querySelectorAll('.nav a').forEach((a) => {
      const on = a.dataset.key === navKey;
      a.classList.toggle('on', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.getElementById('back').hidden = !back;
    document.getElementById('topBrand').hidden = !!title;
    const t = document.getElementById('topTitle');
    t.hidden = !title;
    t.textContent = title || '';
    document.title = title ? `${title} · Lefori Sales` : 'Lefori Sales';
  }

  const ROUTES = [
    [/^#\/today$/, () => viewToday()],
    [/^#\/leads$/, () => viewLeads()],
    [/^#\/add$/, () => viewLeadForm(null)],
    [/^#\/lead\/(\d+)$/, (m) => viewLead(Number(m[1]))],
    [/^#\/lead\/(\d+)\/edit$/, (m) => viewLeadForm(Number(m[1]))],
    [/^#\/numbers$/, () => viewNumbers()],
    [/^#\/more$/, () => viewMore()],
  ];

  let renderToken = 0;
  async function route() {
    if (!state.user) return;
    closeSheet();
    const hash = location.hash || '#/today';
    const match = ROUTES.map(([re, fn]) => [hash.match(re), fn]).find(([m]) => m);
    if (!match) { location.replace('#/today'); return; }
    const token = ++renderToken;
    const main = document.getElementById('main');
    main.innerHTML = '<div class="loading">Loading…</div>';
    window.scrollTo(0, 0);
    try {
      await match[1](match[0], token);
    } catch (err) {
      if (token === renderToken && err.status !== 401) main.innerHTML = `<div class="error-box">${esc(err.message)}</div>`;
    }
  }
  const stale = (token) => token !== undefined && token !== renderToken;

  // ---------- Lead card

  function leadCard(lead, { showAgent } = {}) {
    const due = dueText(lead);
    const dueClass = lead.followUpFlag === 'overdue' ? 'late' : (lead.followUpFlag === 'today' ? 'today' : '');
    const meta = [lead.ownerName, lead.area, showAgent ? lead.agentName : null].filter(Boolean).map(esc).join(' · ');
    return `
      <article class="lead" data-open="${lead.id}">
        <div class="row1">
          <a class="name" href="#/lead/${lead.id}">${esc(lead.businessName)}</a>
          ${lead.interest && !isClosed(lead) ? `<span class="pill ${lead.interest}">${esc(interestLabel(lead.interest))}</span>` : ''}
        </div>
        ${meta ? `<div class="meta">${meta}</div>` : ''}
        <div class="row3">
          <span class="pills">
            <span class="pill ${['paying', 'lost', 'trial'].includes(lead.stage) ? lead.stage : ''}">${esc(stageLabel(lead.stage))}</span>
            ${due ? `<span class="pill ${dueClass}">${esc(due)}</span>` : ''}
          </span>
          <span class="quick">
            ${lead.phoneE164 ? `<a class="icon-btn" href="tel:+${esc(lead.phoneE164)}" aria-label="Call ${esc(lead.businessName)}">${icon('phone')}</a>
            <a class="icon-btn wa" href="${waLink(lead)}" target="_blank" rel="noopener" aria-label="WhatsApp ${esc(lead.businessName)}">${icon('wa')}</a>` : ''}
            ${!isClosed(lead) ? `<button class="icon-btn" data-log="${lead.id}" aria-label="Log a visit or call">${icon('log')}</button>` : ''}
          </span>
        </div>
      </article>`;
  }

  function waLink(lead) {
    const hello = lead.ownerName ? `Hello ${firstName(lead.ownerName)}` : 'Hello';
    const msg = `${hello}, this is ${firstName(state.user.name)} from Lefori. Thank you for your time. `
      + `Lefori keeps your stock, sales and debts on your phone, so you always know what you have and who owes you. `
      + `You can see it here: ${state.meta.demoUrl}`;
    return `https://wa.me/${encodeURIComponent(lead.phoneE164)}?text=${encodeURIComponent(msg)}`;
  }

  // Cards open on tap anywhere except their own links and buttons.
  function bindLeadCards(container, onChange) {
    container.addEventListener('click', (e) => {
      const log = e.target.closest('[data-log]');
      if (log) { e.preventDefault(); openVisitSheet(Number(log.dataset.log), onChange); return; }
      if (e.target.closest('a, button')) return;
      const card = e.target.closest('[data-open]');
      if (card) location.hash = `#/lead/${card.dataset.open}`;
    });
  }

  const agentOptions = (selected, { everyone = 'Everyone', activeOnly = false } = {}) => `
    ${everyone ? `<option value="">${esc(everyone)}</option>` : ''}
    ${state.team.filter((u) => !activeOnly || u.active).map((u) => `<option value="${u.id}" ${String(selected) === String(u.id) ? 'selected' : ''}>${esc(u.name)}${u.active ? '' : ' (inactive)'}</option>`).join('')}`;

  async function loadTeam() {
    const { users } = await api('/users');
    state.team = users;
  }

  // ---------- Install on the phone's home screen

  const install = { prompt: null };
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
  const installDismissed = () => { try { return localStorage.getItem('installDismissed') === '1'; } catch { return false; } };

  function installBanner() {
    if (isStandalone() || installDismissed() || (!install.prompt && !isIos())) return '';
    return `<div class="install">
      <img src="/icons/icon-192.png" alt="">
      <div class="grow"><b>Put Lefori Sales on your phone</b>${install.prompt ? 'It opens full screen, like an app.' : 'Tap Share, then Add to Home Screen.'}</div>
      ${install.prompt ? '<button class="btn accent small" data-install>Install</button>' : ''}
      <button class="x" data-install-dismiss aria-label="Hide">&times;</button>
    </div>`;
  }

  function installCard() {
    if (isStandalone()) return '<div class="card sub">You are using the installed app.</div>';
    if (install.prompt) {
      return `<div class="card"><p class="sub" style="margin-top:0">Install it once and it opens from your home screen, full screen, like any other app.</p>
        <button class="btn accent" data-install>${icon('download')} Install the app</button></div>`;
    }
    if (isIos()) return '<div class="card sub">In Safari, tap <b>Share</b>, then <b>Add to Home Screen</b>.</div>';
    return '<div class="card sub">In Chrome, tap the <b>⋮</b> menu, then <b>Add to Home screen</b> or <b>Install app</b>.</div>';
  }

  function refreshInstallUi() {
    const slot = document.getElementById('installSlot');
    if (slot) slot.innerHTML = installBanner();
    const card = document.getElementById('installCard');
    if (card) card.innerHTML = installCard();
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    install.prompt = e;
    refreshInstallUi();
  });
  window.addEventListener('appinstalled', () => {
    install.prompt = null;
    toast('Lefori Sales is on your home screen');
    refreshInstallUi();
  });
  document.addEventListener('click', async (e) => {
    if (e.target.closest('[data-install]') && install.prompt) {
      const p = install.prompt;
      install.prompt = null;
      p.prompt();
      await p.userChoice.catch(() => {});
      refreshInstallUi();
    }
    if (e.target.closest('[data-install-dismiss]')) {
      try { localStorage.setItem('installDismissed', '1'); } catch { /* private mode */ }
      refreshInstallUi();
    }
  });

  // ---------- Today

  async function viewToday(m, token) {
    setChrome('today');
    const q = state.user.role === 'manager' && state.todayAgent ? `?agent=${state.todayAgent}` : '';
    const data = await api(`/leads/today${q}`);
    if (stale(token)) return;
    const main = document.getElementById('main');
    const manager = state.user.role === 'manager';
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : (hour < 17 ? 'Good afternoon' : 'Good evening');
    const section = (title, list, emptyText) => `
      <div class="section"><h2>${title}</h2><span class="count">${list.length || ''}</span></div>
      ${list.length ? list.map((l) => leadCard(l, { showAgent: manager })).join('') : `<div class="empty">${emptyText}</div>`}`;

    main.innerHTML = `
      <div id="installSlot">${installBanner()}</div>
      <div class="page-head">
        <div style="flex:1">
          <h1 class="bar-under">${greet}, ${esc(firstName(state.user.name))}</h1>
          <div class="sub">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        </div>
        ${manager ? `<select id="todayAgent" aria-label="Whose follow-ups">${agentOptions(state.todayAgent, { everyone: 'Whole team' })}</select>` : ''}
      </div>
      <div class="summary">
        <div class="tile ${data.overdue.length ? 'late' : ''}"><b>${data.overdue.length}</b><span>Late</span></div>
        <div class="tile"><b>${data.today.length}</b><span>Due today</span></div>
        <div class="tile"><b>${data.contactsToday}</b><span>Contacts today</span></div>
      </div>
      <div id="lists">
        ${data.overdue.length ? section('Late follow-ups', data.overdue, '') : ''}
        ${section('Due today', data.today, data.overdue.length ? 'Nothing else due today.' : 'Nothing due today. Add the shops you visit so you can follow them up.')}
        ${data.noFollowUp.length ? section('Hot and warm, no follow-up date', data.noFollowUp, '') : ''}
      </div>
      <p class="sub" style="margin-top:18px">${data.upcomingThisWeek ? `${plural(data.upcomingThisWeek, 'more follow-up')} in the next 7 days.` : ''}</p>`;

    bindLeadCards(document.getElementById('lists'), () => viewToday());
    const sel = document.getElementById('todayAgent');
    if (sel) sel.addEventListener('change', () => { state.todayAgent = sel.value; viewToday(); });
  }

  // ---------- Leads list

  const CHIPS = [
    ['open', 'Open'], ['hot', 'Hot'], ['overdue', 'Late'], ['today', 'Due today'], ['none', 'No follow-up'],
    ['trial', 'Trial'], ['paying', 'Paying'], ['lost', 'Lost'], ['all', 'All'],
  ];

  function leadsQuery() {
    const f = state.leadsFilter;
    const p = new URLSearchParams();
    if (f.chip === 'open') { p.set('stage', 'open'); p.set('sort', 'followup'); }
    else if (f.chip === 'hot') { p.set('stage', 'open'); p.set('interest', 'hot'); p.set('sort', 'followup'); }
    else if (['overdue', 'today', 'none'].includes(f.chip)) { p.set('due', f.chip); p.set('sort', 'followup'); }
    else if (['trial', 'paying', 'lost'].includes(f.chip)) p.set('stage', f.chip);
    if (f.q) p.set('q', f.q);
    if (f.agent) p.set('agent', f.agent);
    return p.toString();
  }

  async function viewLeads(m, token) {
    setChrome('leads');
    const manager = state.user.role === 'manager';
    const f = state.leadsFilter;
    const main = document.getElementById('main');
    main.innerHTML = `
      <div class="page-head"><h1 class="bar-under">Leads</h1></div>
      <div class="searchbar">
        <input type="search" id="q" placeholder="Search name, owner, area or phone" value="${esc(f.q)}" aria-label="Search leads">
        ${manager ? `<select id="agent" aria-label="Agent">${agentOptions(f.agent, { everyone: 'All agents' })}</select>` : ''}
      </div>
      <div class="filters" role="group" aria-label="Filter">
        ${CHIPS.map(([k, label]) => `<button type="button" data-chip="${k}" class="${f.chip === k ? 'on' : ''}" aria-pressed="${f.chip === k}">${label}</button>`).join('')}
      </div>
      <div id="results"><div class="loading">Loading…</div></div>`;

    const results = document.getElementById('results');
    const load = async () => {
      const t = renderToken;
      try {
        const { leads } = await api(`/leads?${leadsQuery()}`);
        if (t !== renderToken) return;
        results.innerHTML = leads.length
          ? `<div class="sub" style="margin-bottom:8px">${plural(leads.length, 'lead')}</div>${leads.map((l) => leadCard(l, { showAgent: manager })).join('')}`
          : `<div class="empty">${f.q ? 'No leads match that search.' : 'No leads here yet.'}</div>`;
      } catch (err) { showError(err); }
    };
    bindLeadCards(results, load);
    main.querySelector('.filters').addEventListener('click', (e) => {
      const b = e.target.closest('[data-chip]');
      if (!b) return;
      f.chip = b.dataset.chip;
      main.querySelectorAll('[data-chip]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
      load();
    });
    let timer;
    document.getElementById('q').addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => { f.q = e.target.value.trim(); load(); }, 300);
    });
    const agentSel = document.getElementById('agent');
    if (agentSel) agentSel.addEventListener('change', () => { f.agent = agentSel.value; load(); });
    if (stale(token)) return;
    await load();
  }

  // ---------- Form bits

  const seg = (name, options, value, extraClass = '') => `
    <div class="seg ${extraClass}" data-seg="${name}" role="group">
      ${options.map(([v, label]) => `<button type="button" data-value="${esc(v)}" class="${String(value) === String(v) ? 'on' : ''}" aria-pressed="${String(value) === String(v)}">${esc(label)}</button>`).join('')}
    </div>`;

  // Segmented buttons: click to pick, click again to clear when allowed.
  function bindSegs(container, onChange) {
    container.querySelectorAll('[data-seg]').forEach((g) => {
      g.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-value]');
        if (!b) return;
        const wasOn = b.classList.contains('on');
        g.querySelectorAll('button').forEach((x) => { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); });
        if (!(wasOn && g.dataset.clearable !== undefined)) { b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); }
        if (onChange) onChange(g.dataset.seg, segValue(container, g.dataset.seg));
      });
    });
  }
  const segValue = (container, name) => {
    const on = container.querySelector(`[data-seg="${name}"] button.on`);
    return on ? on.dataset.value : '';
  };

  const followUpPicker = (value) => `
    <div class="field">
      <label for="nextFollowUpOn">Next follow-up</label>
      <div class="seg" data-quick="nextFollowUpOn" style="margin-bottom:8px">
        <button type="button" data-days="1">Tomorrow</button>
        <button type="button" data-days="3">In 3 days</button>
        <button type="button" data-days="7">Next week</button>
      </div>
      <input type="date" id="nextFollowUpOn" name="nextFollowUpOn" value="${esc(value || '')}" min="${today()}">
      <div class="hint">Follow-up is what turns a visit into a sale.</div>
    </div>`;

  function bindFollowUpPicker(container) {
    container.querySelectorAll('[data-quick]').forEach((g) => {
      const input = container.querySelector(`#${g.dataset.quick}`);
      const sync = () => g.querySelectorAll('button').forEach((b) => b.classList.toggle('on', input.value === addDays(Number(b.dataset.days))));
      g.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-days]');
        if (!b) return;
        input.value = addDays(Number(b.dataset.days));
        sync();
      });
      input.addEventListener('change', sync);
      sync();
    });
  }

  const options = (list, selected, blank) => `
    ${blank !== undefined ? `<option value="">${esc(blank)}</option>` : ''}
    ${list.map((o) => {
      const v = typeof o === 'string' ? o : o.key;
      const label = typeof o === 'string' ? o : o.label;
      return `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(label)}</option>`;
    }).join('')}`;

  // ---------- Add / edit lead

  async function viewLeadForm(id, token) {
    const editing = !!id;
    setChrome(editing ? 'leads' : 'add', editing ? { title: 'Edit lead', back: true } : {});
    let lead = {
      stage: 'new', interest: '', firstVisitOn: today(), agentId: state.user.id, nextFollowUpOn: addDays(3),
    };
    if (editing) lead = (await api(`/leads/${id}`)).lead;
    if (stale(token)) return;
    const manager = state.user.role === 'manager';
    const main = document.getElementById('main');
    const m = state.meta;

    main.innerHTML = `
      ${editing ? '' : '<div class="page-head"><h1 class="bar-under">Add a lead</h1></div>'}
      <form class="form" id="leadForm" novalidate>
        <div class="field">
          <label for="businessName">Business name</label>
          <input type="text" id="businessName" name="businessName" required maxlength="120" value="${esc(lead.businessName)}" autocomplete="off">
        </div>
        <div class="two wrap">
          <div class="field">
            <label for="ownerName">Owner or contact</label>
            <input type="text" id="ownerName" name="ownerName" maxlength="80" value="${esc(lead.ownerName)}" autocomplete="off">
          </div>
          <div class="field">
            <label for="phone">Phone / WhatsApp</label>
            <input type="tel" id="phone" name="phone" inputmode="tel" placeholder="07XX XXX XXX" value="${esc(lead.phone)}" autocomplete="off">
            <div class="warn" id="phoneWarn" hidden></div>
          </div>
        </div>
        <div class="field">
          <span class="label">Interest</span>
          ${seg('interest', m.interest.map((i) => [i.key, i.label]), lead.interest, 'hotwarm').replace('data-seg="interest"', 'data-seg="interest" data-clearable')}
        </div>
        <div class="two">
          <div class="field">
            <label for="stage">Stage</label>
            <select id="stage" name="stage">${options(m.stages, lead.stage)}</select>
          </div>
          <div class="field">
            <label for="businessType">Type of business</label>
            <select id="businessType" name="businessType">${options(m.businessTypes, lead.businessType, 'Choose')}</select>
          </div>
        </div>
        <div class="field" id="lostWrap" ${lead.stage === 'lost' ? '' : 'hidden'}>
          <label for="lostReason">Why was it lost?</label>
          <select id="lostReason" name="lostReason">${options(m.lostReasons, lead.lostReason, 'Choose a reason')}</select>
        </div>
        ${followUpPicker(lead.nextFollowUpOn)}
        <div class="two wrap">
          <div class="field">
            <label for="area">Town or area</label>
            <input type="text" id="area" name="area" maxlength="80" value="${esc(lead.area)}">
          </div>
          <div class="field">
            <label for="tracksStockNow">Tracks stock now with</label>
            <select id="tracksStockNow" name="tracksStockNow">${options(m.tracksStock, lead.tracksStockNow, 'Choose')}</select>
          </div>
        </div>
        <div class="field">
          <label for="landmark">Landmark or directions</label>
          <input type="text" id="landmark" name="landmark" maxlength="200" placeholder="Opposite the taxi park, blue door" value="${esc(lead.landmark)}">
        </div>
        <div class="two">
          <div class="field">
            <label for="expectedUgx">Expected UGX a month</label>
            <input type="text" id="expectedUgx" name="expectedUgx" inputmode="numeric" value="${lead.expectedUgx ? Number(lead.expectedUgx).toLocaleString('en-US') : ''}">
          </div>
          <div class="field">
            <label for="firstVisitOn">First visited</label>
            <input type="date" id="firstVisitOn" name="firstVisitOn" value="${esc(lead.firstVisitOn)}" max="${today()}">
          </div>
        </div>
        ${manager ? `<div class="field">
          <label for="agentId">Agent</label>
          <select id="agentId" name="agentId">${agentOptions(lead.agentId, { everyone: '', activeOnly: !editing })}</select>
        </div>` : ''}
        <div class="field">
          <label for="notes">Notes</label>
          <textarea id="notes" name="notes" maxlength="2000" placeholder="What they said, what they need">${esc(lead.notes)}</textarea>
        </div>
        <div class="error-box" id="formError" hidden></div>
        <div class="form-foot">
          ${editing ? '<button type="button" class="btn" id="cancel">Cancel</button>' : ''}
          <button type="submit" class="btn primary" id="save">${editing ? 'Save changes' : 'Save lead'}</button>
        </div>
      </form>
      ${editing && manager ? '<p style="margin-top:24px"><button type="button" class="btn danger small" id="deleteLead">Delete this lead</button></p><p class="sub">Only for mistakes and duplicates. Mark real leads as Lost instead.</p>' : ''}`;

    const form = document.getElementById('leadForm');
    bindSegs(form);
    bindFollowUpPicker(form);
    const stageSel = form.querySelector('#stage');
    stageSel.addEventListener('change', () => { document.getElementById('lostWrap').hidden = stageSel.value !== 'lost'; });
    if (editing) document.getElementById('cancel').addEventListener('click', () => history.back());

    // Warn about duplicates while typing, so two agents never chase the same shop.
    const phoneInput = form.querySelector('#phone');
    const warn = document.getElementById('phoneWarn');
    let phoneTimer;
    phoneInput.addEventListener('input', () => {
      clearTimeout(phoneTimer);
      phoneTimer = setTimeout(async () => {
        const v = phoneInput.value.trim();
        if (v.replace(/\D/g, '').length < 9) { warn.hidden = true; return; }
        try {
          const r = await api(`/leads/check-phone?phone=${encodeURIComponent(v)}${editing ? `&except=${id}` : ''}`);
          if (!r.valid) { warn.textContent = 'This does not look like a full phone number.'; warn.hidden = false; return; }
          if (r.duplicate) {
            const d = r.duplicate;
            warn.innerHTML = `Already logged: ${esc(d.businessName)} (${esc(d.ref)}) by ${esc(d.agentName)}.${d.id ? ` <a href="#/lead/${d.id}">Open it</a>` : ''}`;
            warn.hidden = false;
          } else warn.hidden = true;
        } catch { /* the save will report it */ }
      }, 400);
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = document.getElementById('formError');
      err.hidden = true;
      const fd = new FormData(form);
      const body = Object.fromEntries(fd.entries());
      body.interest = segValue(form, 'interest') || null;
      body.expectedUgx = body.expectedUgx ? body.expectedUgx.replace(/[,\s]/g, '') : null;
      if (body.stage !== 'lost') delete body.lostReason;
      if (!body.businessName.trim()) { err.textContent = 'Enter the business name.'; err.hidden = false; form.businessName.focus(); return; }
      const btn = document.getElementById('save');
      btn.disabled = true;
      try {
        const r = editing ? await api(`/leads/${id}`, { method: 'PATCH', body }) : await api('/leads', { method: 'POST', body });
        toast(editing ? 'Saved' : 'Lead saved');
        if (editing) history.back(); else location.hash = `#/lead/${r.lead.id}`;
      } catch (ex) {
        if (ex.status === 401) return;
        err.innerHTML = esc(ex.message) + (ex.data.duplicate && ex.data.duplicate.id ? ` <a href="#/lead/${ex.data.duplicate.id}">Open it</a>` : '');
        err.hidden = false;
        err.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } finally {
        btn.disabled = false;
      }
    });

    const del = document.getElementById('deleteLead');
    if (del) {
      del.addEventListener('click', async () => {
        if (!confirm(`Delete ${lead.businessName} and all its visits? This cannot be undone.`)) return;
        try {
          await api(`/leads/${id}`, { method: 'DELETE' });
          toast('Lead deleted');
          location.hash = '#/leads';
        } catch (ex) { showError(ex); }
      });
    }
  }

  // ---------- Lead detail

  async function viewLead(id, token) {
    const { lead, visits } = await api(`/leads/${id}`);
    if (stale(token)) return;
    setChrome('leads', { title: lead.ref, back: true });
    const main = document.getElementById('main');
    const stageIdx = state.meta.stages.findIndex((s) => s.key === lead.stage);
    const lostAt = lead.stage === 'lost';
    const filled = lostAt ? 0 : stageIdx + 1;
    const due = dueText(lead);
    const fact = (label, value, wide) => (value ? `<div class="${wide ? 'wide' : ''}"><dt>${label}</dt><dd>${value}</dd></div>` : '');

    main.innerHTML = `
      <div class="detail-head">
        <div style="flex:1;min-width:0">
          <h1>${esc(lead.businessName)}</h1>
          <div class="sub">${[lead.ownerName, lead.businessType, lead.area].filter(Boolean).map(esc).join(' · ')}</div>
        </div>
        ${lead.interest && !isClosed(lead) ? `<span class="pill ${lead.interest}">${esc(interestLabel(lead.interest))}</span>` : ''}
      </div>

      <div class="card" style="margin-top:14px">
        <div style="display:flex;align-items:center;gap:8px">
          <b style="flex:1">${esc(stageLabel(lead.stage))}${lostAt && lead.lostReason ? ` · ${esc(lead.lostReason)}` : ''}</b>
          ${due ? `<span class="pill ${lead.followUpFlag === 'overdue' ? 'late' : (lead.followUpFlag === 'today' ? 'today' : '')}">${esc(due)}</span>` : ''}
        </div>
        <div class="stage-track ${lead.stage}" aria-hidden="true">${[0, 1, 2, 3, 4].map((i) => `<span class="${i < filled ? 'done' : ''}"></span>`).join('')}</div>
      </div>

      <div class="actions" style="margin-top:12px">
        ${lead.phoneE164 ? `<a class="btn" href="tel:+${esc(lead.phoneE164)}">${icon('phone')} Call</a>
        <a class="btn" href="${waLink(lead)}" target="_blank" rel="noopener">${icon('wa')} WhatsApp</a>` : ''}
        <button class="btn accent" id="logBtn">${icon('log')} Log visit</button>
      </div>

      <div class="card" style="margin-top:12px">
        <dl class="facts">
          ${fact('Phone', esc(lead.phone))}
          ${fact('Agent', esc(lead.agentName))}
          ${fact('Last contact', esc(cap(fmtDate(lead.lastContactOn))))}
          ${fact('Next follow-up', esc(cap(fmtDate(lead.nextFollowUpOn))))}
          ${fact('First visited', esc(cap(fmtDate(lead.firstVisitOn))))}
          ${fact('Days in pipeline', lead.daysInPipeline !== null ? esc(lead.daysInPipeline) : '')}
          ${fact('Tracks stock with', esc(lead.tracksStockNow))}
          ${fact('Expected a month', lead.expectedUgx ? esc(ugx(lead.expectedUgx)) : '')}
          ${fact('Landmark', esc(lead.landmark), true)}
          ${fact('Notes', `<span style="white-space:pre-wrap;font-weight:400">${esc(lead.notes)}</span>`.replace(/<span[^>]*><\/span>/, ''), true)}
        </dl>
        <p style="margin:14px 0 0"><a class="btn small" href="#/lead/${lead.id}/edit">Edit details</a></p>
      </div>

      <div class="section"><h2>Visits and calls</h2><span class="count">${visits.length || ''}</span></div>
      ${visits.length ? `<div class="card"><ul class="timeline">
        ${visits.map((v) => `<li>
          <div class="when">${esc(cap(fmtDate(v.happenedOn)))} · ${esc(cap(v.kind === 'whatsapp' ? 'WhatsApp' : v.kind))} · ${esc(v.agentName)}
            ${state.user.role === 'manager' || v.agentId === state.user.id ? ` · <button class="del" data-del-visit="${v.id}">Remove</button>` : ''}</div>
          ${v.whatHappened ? `<div class="what">${esc(v.whatHappened)}</div>` : ''}
          ${v.nextStep ? `<div class="next"><b>Next:</b> ${esc(v.nextStep)}</div>` : ''}
        </li>`).join('')}
      </ul></div>` : '<div class="empty">No visits logged yet.</div>'}`;

    document.getElementById('logBtn').addEventListener('click', () => openVisitSheet(lead.id, () => viewLead(lead.id), lead));
    main.querySelectorAll('[data-del-visit]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Remove this visit from the log?')) return;
      try {
        await api(`/leads/${lead.id}/visits/${b.dataset.delVisit}`, { method: 'DELETE' });
        viewLead(lead.id);
      } catch (ex) { showError(ex); }
    }));
  }

  // ---------- Log a visit (bottom sheet)

  function closeSheet() {
    document.querySelectorAll('.sheet-back').forEach((s) => s.remove());
    document.body.style.overflow = '';
  }

  function openSheet(title, html) {
    closeSheet();
    const back = document.createElement('div');
    back.className = 'sheet-back';
    back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-head"><h2>${esc(title)}</h2><button class="btn small" data-close>Close</button></div>
      ${html}</div>`;
    back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) closeSheet(); });
    document.body.appendChild(back);
    document.body.style.overflow = 'hidden';
    const firstInput = back.querySelector('textarea, input:not([type=hidden])');
    if (firstInput && window.matchMedia('(min-width: 640px)').matches) firstInput.focus();
    return back.querySelector('.sheet');
  }

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

  async function openVisitSheet(leadId, onSaved, knownLead) {
    let lead = knownLead;
    if (!lead) {
      try { lead = (await api(`/leads/${leadId}`)).lead; } catch (ex) { showError(ex); return; }
    }
    const m = state.meta;
    const sheet = openSheet(`Log: ${lead.businessName}`, `
      <form class="form" id="visitForm" novalidate>
        <div class="field">
          <span class="label">How did you reach them?</span>
          ${seg('kind', m.visitKinds.map((k) => [k.key, k.label]), 'visit')}
        </div>
        <div class="field">
          <label for="whatHappened">What happened</label>
          <textarea id="whatHappened" name="whatHappened" maxlength="2000" placeholder="Showed stock and sales screens on the phone"></textarea>
        </div>
        <div class="field">
          <label for="nextStep">Next step</label>
          <input type="text" id="nextStep" name="nextStep" maxlength="500" placeholder="Call Thursday to start the trial">
        </div>
        <div class="two">
          <div class="field">
            <label for="vStage">Stage now</label>
            <select id="vStage" name="stage">${options(m.stages, lead.stage)}</select>
          </div>
          <div class="field">
            <label for="happenedOn">Date</label>
            <input type="date" id="happenedOn" name="happenedOn" value="${today()}" max="${today()}">
          </div>
        </div>
        <div class="field" id="vLostWrap" hidden>
          <label for="vLostReason">Why was it lost?</label>
          <select id="vLostReason" name="lostReason">${options(m.lostReasons, lead.lostReason, 'Choose a reason')}</select>
        </div>
        <div class="field">
          <span class="label">Interest now</span>
          ${seg('interest', m.interest.map((i) => [i.key, i.label]), lead.interest, 'hotwarm')}
        </div>
        <div id="vFollow">${followUpPicker('')}</div>
        <div class="error-box" id="visitError" hidden></div>
        <button type="submit" class="btn primary block" id="visitSave">Save</button>
      </form>`);

    const form = sheet.querySelector('#visitForm');
    bindSegs(form);
    bindFollowUpPicker(form);
    const stageSel = form.querySelector('#vStage');
    const syncStage = () => {
      const closed = stageSel.value === 'paying' || stageSel.value === 'lost';
      form.querySelector('#vLostWrap').hidden = stageSel.value !== 'lost';
      form.querySelector('#vFollow').hidden = closed;
    };
    stageSel.addEventListener('change', syncStage);
    syncStage();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = form.querySelector('#visitError');
      err.hidden = true;
      const fd = Object.fromEntries(new FormData(form).entries());
      const closed = fd.stage === 'paying' || fd.stage === 'lost';
      const body = {
        kind: segValue(form, 'kind') || 'visit',
        whatHappened: fd.whatHappened,
        nextStep: fd.nextStep,
        happenedOn: fd.happenedOn || today(),
        stage: fd.stage !== lead.stage ? fd.stage : undefined,
        interest: segValue(form, 'interest') || undefined,
        nextFollowUpOn: closed ? undefined : (fd.nextFollowUpOn || undefined),
        lostReason: fd.stage === 'lost' ? fd.lostReason : undefined,
      };
      if (!closed && !body.nextFollowUpOn && !confirm('No next follow-up date. Save anyway?')) return;
      const btn = form.querySelector('#visitSave');
      btn.disabled = true;
      try {
        await api(`/leads/${lead.id}/visits`, { method: 'POST', body });
        closeSheet();
        toast('Logged');
        if (onSaved) onSaved();
      } catch (ex) {
        if (ex.status === 401) return;
        err.textContent = ex.message;
        err.hidden = false;
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ---------- Numbers

  async function viewNumbers(m, token) {
    setChrome('numbers');
    const manager = state.user.role === 'manager';
    const d = await api(`/dashboard${manager && state.numbersAgent ? `?agent=${state.numbersAgent}` : ''}`);
    if (stale(token)) return;
    const main = document.getElementById('main');
    const k = d.key;
    const maxStage = Math.max(1, ...d.pipeline.map((p) => p.count));
    const maxWeek = Math.max(1, ...d.weeks.map((w) => w.contacts));
    const maxLost = Math.max(1, ...d.lostReasons.map((r) => r.count));

    main.innerHTML = `
      <div class="page-head">
        <h1 class="bar-under">${manager && !state.numbersAgent ? 'Team numbers' : 'Numbers'}</h1>
        ${manager ? `<select id="numAgent" aria-label="Whose numbers">${agentOptions(state.numbersAgent, { everyone: 'Whole team' })}</select>` : ''}
      </div>
      <div class="kpis">
        <div class="kpi ${k.overdue ? 'late' : ''}"><b>${k.overdue}</b><span>Late follow-ups</span></div>
        <div class="kpi"><b>${k.dueToday}</b><span>Due today</span></div>
        <div class="kpi"><b>${k.hotOpen}</b><span>Hot leads open</span></div>
        <div class="kpi"><b>${k.contacts7d}</b><span>Contacts, last 7 days</span></div>
        <div class="kpi"><b>${k.newThisMonth}</b><span>New leads this month</span></div>
        <div class="kpi"><b>${(k.conversion * 100).toFixed(1)}%</b><span>Paying out of all leads</span></div>
        <div class="kpi"><b>${esc(ugx(k.expectedUgxOpen))}</b><span>Expected a month (hot + warm)</span></div>
        <div class="kpi"><b>${esc(ugx(k.payingUgx))}</b><span>Paying a month</span></div>
      </div>

      <div class="section"><h2>Pipeline</h2><span class="count">${plural(k.total, 'lead')}</span></div>
      <div class="card bars">
        ${d.pipeline.map((p) => `<div class="bar ${p.stage}"><span>${esc(p.label)}</span>
          <div class="track"><div class="fill" style="width:${(p.count / maxStage) * 100}%"></div></div><span class="n">${p.count}</span></div>`).join('')}
      </div>

      <div class="section"><h2>Visits and calls per week</h2></div>
      <div class="card">
        <div class="weeks">
          ${d.weeks.map((w) => `<div class="wk" title="${w.contacts} contacts, ${w.newLeads} new leads">
            <b>${w.contacts}</b><div class="col" style="height:${(w.contacts / maxWeek) * 80}%"></div>
            <small>${parseDate(w.week).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</small></div>`).join('')}
        </div>
      </div>

      ${manager && !state.numbersAgent && d.byAgent.length ? `
        <div class="section"><h2>By agent</h2></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Agent</th><th>Leads</th><th>Demo+</th><th>Trial+</th><th>Paying</th><th>Lost</th><th>Late</th><th>7 days</th></tr></thead>
          <tbody>${d.byAgent.map((a) => `<tr><td>${esc(a.name)}${a.active ? '' : ' (inactive)'}</td><td>${a.leads}</td><td>${a.demos}</td>
            <td>${a.trials}</td><td>${a.paying}</td><td>${a.lost}</td><td class="${a.overdue ? 'late' : ''}">${a.overdue}</td><td>${a.contacts7d}</td></tr>`).join('')}</tbody>
        </table></div>
        <p class="sub">Demo+ counts leads at demo or further. "7 days" is visits and calls logged in the last week.</p>` : ''}

      <div class="section"><h2>Why we lose leads</h2></div>
      ${d.lostReasons.length ? `<div class="card bars">${d.lostReasons.map((r) => `<div class="bar lost"><span>${esc(r.reason)}</span>
        <div class="track"><div class="fill" style="width:${(r.count / maxLost) * 100}%"></div></div><span class="n">${r.count}</span></div>`).join('')}</div>`
        : '<div class="empty">No lost leads yet.</div>'}`;

    const sel = document.getElementById('numAgent');
    if (sel) sel.addEventListener('change', () => { state.numbersAgent = sel.value; viewNumbers(); });
  }

  // ---------- More: account, team, import

  async function viewMore(m, token) {
    setChrome('more');
    const manager = state.user.role === 'manager';
    if (manager) await loadTeam();
    if (stale(token)) return;
    const main = document.getElementById('main');
    main.innerHTML = `
      <div class="page-head"><h1 class="bar-under">More</h1></div>
      <div class="list-item">
        <div class="grow"><b>${esc(state.user.name)}</b><div class="muted">${esc(state.user.phone)} · ${state.user.role === 'manager' ? 'Manager' : 'Agent'}</div></div>
        <button class="btn small" id="changePin">Change PIN</button>
      </div>

      ${manager ? `
        <div class="section"><h2>Team</h2><span class="count">${state.team.filter((u) => u.active).length} active</span>
          <span style="flex:1"></span><button class="btn small primary" id="addMember">Add person</button></div>
        <div>${state.team.map((u) => `
          <div class="list-item ${u.active ? '' : 'off'}">
            <div class="grow"><b>${esc(u.name)}</b>
              <div class="muted">${esc(u.phone)} · ${u.role === 'manager' ? 'Manager' : 'Agent'} · ${plural(u.openLeads, 'open lead')}${u.active ? '' : ' · Inactive'}</div></div>
            <button class="btn small" data-edit-user="${u.id}">Edit</button>
          </div>`).join('')}</div>

        <div class="section"><h2>Import the old spreadsheet</h2></div>
        <div class="card">
          <p style="margin-top:0" class="sub">Upload the Lefori Field Leads Tracker (.xlsx). Add your agents first, using the same names as the sheet's Agent column, so their leads go to them.</p>
          <input type="file" id="importFile" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
          <div id="importResult" style="margin-top:10px"></div>
        </div>` : ''}

      <div class="section"><h2>Put it on your home screen</h2></div>
      <div id="installCard">${installCard()}</div>

      <p style="margin-top:24px"><button class="btn block" id="logout">Log out</button></p>`;

    document.getElementById('logout').addEventListener('click', async () => {
      try { await api('/auth/logout', { method: 'POST' }); } catch { /* already out */ }
      state.user = null;
      renderLogin();
    });
    document.getElementById('changePin').addEventListener('click', openPinSheet);
    if (!manager) return;

    document.getElementById('addMember').addEventListener('click', () => openMemberSheet(null));
    main.querySelectorAll('[data-edit-user]').forEach((b) => b.addEventListener('click', () => {
      openMemberSheet(state.team.find((u) => u.id === Number(b.dataset.editUser)));
    }));

    const file = document.getElementById('importFile');
    const out = document.getElementById('importResult');
    const send = async (commit) => {
      const fd = new FormData();
      fd.append('file', file.files[0]);
      return api(`/import${commit ? '?commit=1' : ''}`, { method: 'POST', form: fd });
    };
    const issues = (r) => {
      const lines = [
        ...r.skipped.map((s) => `${s.sheet} row ${s.row}: skipped, ${s.reason}`),
        ...r.warnings.map((w) => `${w.sheet} row ${w.row}: ${w.message}`),
      ];
      return lines.length ? `<ul class="result-list">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : '';
    };
    file.addEventListener('change', async () => {
      if (!file.files[0]) return;
      out.innerHTML = '<div class="sub">Reading the file…</div>';
      try {
        const r = await send(false);
        out.innerHTML = `
          <p><b>${plural(r.leads, 'lead')}</b> and <b>${plural(r.visits, 'visit')}</b> ready to import.</p>
          ${r.unmatchedAgents.length ? `<div class="error-box">Not on the team: ${r.unmatchedAgents.map(esc).join(', ')}. Their leads will be given to you. Add them first if you want the leads to go to them.</div>` : ''}
          ${issues(r)}
          <p><button class="btn primary" id="doImport" ${r.leads ? '' : 'disabled'}>Import ${plural(r.leads, 'lead')}</button></p>`;
        const go = document.getElementById('doImport');
        go.addEventListener('click', async () => {
          go.disabled = true;
          try {
            const done = await send(true);
            out.innerHTML = `<p><b>Imported ${plural(done.leads, 'lead')} and ${plural(done.visits, 'visit')}.</b></p>`;
            file.value = '';
            toast('Import finished');
          } catch (ex) { go.disabled = false; showError(ex); }
        });
      } catch (ex) {
        out.innerHTML = `<div class="error-box">${esc(ex.message)}</div>`;
      }
    });
  }

  function openPinSheet() {
    const sheet = openSheet('Change your PIN', `
      <form class="form" id="pinForm" novalidate>
        <div class="field"><label for="curPin">Current PIN</label><input type="password" id="curPin" inputmode="numeric" autocomplete="current-password" maxlength="6"></div>
        <div class="field"><label for="newPin">New PIN (4 to 6 digits)</label><input type="password" id="newPin" inputmode="numeric" autocomplete="new-password" maxlength="6"></div>
        <div class="error-box" id="pinError" hidden></div>
        <button class="btn primary block" type="submit">Save PIN</button>
      </form>`);
    sheet.querySelector('#pinForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = sheet.querySelector('#pinError');
      try {
        await api('/auth/pin', { method: 'POST', body: { current: sheet.querySelector('#curPin').value, next: sheet.querySelector('#newPin').value } });
        closeSheet();
        toast('PIN changed');
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    });
  }

  function openMemberSheet(user) {
    const editing = !!user;
    const self = editing && user.id === state.user.id;
    const sheet = openSheet(editing ? `Edit ${user.name}` : 'Add a person', `
      <form class="form" id="memberForm" novalidate>
        <div class="field"><label for="mName">Name</label><input type="text" id="mName" maxlength="80" value="${esc(editing ? user.name : '')}"></div>
        ${editing ? `<div class="field"><span class="label">Phone</span><div>${esc(user.phone)}</div></div>`
          : '<div class="field"><label for="mPhone">Phone (they log in with it)</label><input type="tel" id="mPhone" inputmode="tel" placeholder="07XX XXX XXX"></div>'}
        <div class="field"><label for="mPin">${editing ? 'New PIN (leave empty to keep)' : 'PIN (4 to 6 digits)'}</label>
          <input type="text" id="mPin" inputmode="numeric" maxlength="6" autocomplete="off"><div class="hint">Tell them the PIN in person. They can change it under More.</div></div>
        <div class="field"><span class="label">Role</span>${seg('role', [['agent', 'Agent'], ['manager', 'Manager']], editing ? user.role : 'agent')}</div>
        ${editing && !self ? `<div class="field"><span class="label">Access</span>${seg('active', [['1', 'Active'], ['0', 'Switched off']], user.active ? '1' : '0')}
          <div class="hint">Switching someone off logs them out. Their leads stay; give them to someone else from each lead.</div></div>` : ''}
        <div class="error-box" id="memberError" hidden></div>
        <button class="btn primary block" type="submit">${editing ? 'Save' : 'Add to the team'}</button>
      </form>`);
    const form = sheet.querySelector('#memberForm');
    bindSegs(form);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = form.querySelector('#memberError');
      const body = { name: form.querySelector('#mName').value, role: segValue(form, 'role') || 'agent' };
      const pin = form.querySelector('#mPin').value.trim();
      if (pin || !editing) body.pin = pin;
      if (!editing) body.phone = form.querySelector('#mPhone').value;
      if (editing && !self) body.active = segValue(form, 'active') === '1';
      if (self) delete body.role;
      try {
        await api(editing ? `/users/${user.id}` : '/users', { method: editing ? 'PATCH' : 'POST', body });
        closeSheet();
        toast(editing ? 'Saved' : 'Added to the team');
        if (self) state.user.name = body.name;
        viewMore();
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    });
  }

  // ---------- Login

  function renderLogin() {
    closeSheet();
    document.title = 'Log in · Lefori Sales';
    root.innerHTML = `
      <div class="login">
        <div class="cover-top">${lockup({ large: true })}</div>
        <div class="cover-body">
          <h1 class="bar-under">Sales team</h1>
          <p class="sub">Log in with your phone number and the PIN your manager gave you.</p>
          <form class="form" id="loginForm" novalidate>
            <div class="field"><label for="lPhone">Phone number</label>
              <input type="tel" id="lPhone" inputmode="tel" autocomplete="username" placeholder="07XX XXX XXX"></div>
            <div class="field"><label for="lPin">PIN</label>
              <input type="password" id="lPin" inputmode="numeric" autocomplete="current-password" maxlength="6"></div>
            <div class="error-box" id="loginError" hidden></div>
            <button class="btn accent block" type="submit" id="loginBtn">Log in</button>
          </form>
        </div>
      </div>`;
    const form = document.getElementById('loginForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = document.getElementById('loginError');
      const btn = document.getElementById('loginBtn');
      err.hidden = true;
      btn.disabled = true;
      try {
        const { user } = await api('/auth/login', { method: 'POST', body: { phone: form.lPhone.value, pin: form.lPin.value } });
        state.user = user;
        await start();
      } catch (ex) {
        err.textContent = ex.message;
        err.hidden = false;
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ---------- Start

  async function start() {
    if (!state.meta) state.meta = await api('/meta');
    await loadTeam();
    renderShell();
    if (!location.hash || location.hash === '#/') location.replace('#/today');
    route();
  }

  window.addEventListener('hashchange', route);

  (async () => {
    try {
      const { user } = await api('/auth/me');
      state.user = user;
      await start();
    } catch (err) {
      if (err.status !== 401) root.innerHTML = `<div class="login"><div class="box"><div class="error-box">${esc(err.message)}</div></div></div>`;
    }
  })();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
})();
