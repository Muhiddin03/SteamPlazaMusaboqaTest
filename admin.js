'use strict';
// ─── ADMIN PANEL ───────────────────────────────────────────────────────────────
(() => {
  const TOKEN_KEY = 'sp_admin';
  const REFRESH_MS = 10000;

  const A = {
    token: null,
    username: '',
    tab: 'results',
    classes: [],
    attempts: [],
    tests: [],
    editingId: null,
    refreshTimer: null,
    detailOpen: false
  };

  const STATUS = {
    active: { label: 'Yechmoqda', cls: 'st-active' },
    finished: { label: 'Yakunlandi', cls: 'st-finished' },
    terminated: { label: 'To\'xtatildi', cls: 'st-terminated' },
    abandoned: { label: 'Tashlab ketildi', cls: 'st-abandoned' },
    legacy: { label: 'Eski natija', cls: 'st-legacy' }
  };

  const RISK = {
    low: { label: 'Toza', cls: 'risk-low', icon: 'shield-check-line' },
    medium: { label: 'Shubhali', cls: 'risk-medium', icon: 'alert-line' },
    high: { label: 'Yuqori xavf', cls: 'risk-high', icon: 'spam-2-line' },
    unknown: { label: 'Nazoratsiz', cls: 'risk-unknown', icon: 'question-line' }
  };

  const EVENTS = {
    tab_hidden: 'Ilova/oynadan chiqdi',
    tab_return: 'Testga qaytdi',
    focus_lost: 'Ekran ustida boshqa oyna ochildi',
    window_blur: 'Fokus qisqa yo\'qoldi',
    fullscreen_exit: 'To\'liq ekrandan chiqdi',
    split_screen: 'Ekranni bo\'ldi / oynani kichraytirdi',
    multi_tab: 'Boshqa varaq ochdi',
    camera_off: 'Kamera o\'chirildi',
    camera_denied: 'Kameraga ruxsat bermadi',
    copy: 'Nusxalashga urindi',
    paste: 'Joylashtirishga urindi',
    key_blocked: 'Taqiqlangan tugma bosdi',
    screenshot: 'Skrinshot tugmasini bosdi',
    devtools: 'Dasturchi vositalarini ochishga urindi',
    offline: 'Internet o\'chdi',
    connection_gap: 'Aloqa uzildi',
    reload: 'Sahifani qayta yukladi',
    fast_answer: 'Juda tez javob berdi',
    auto_terminated: 'Test avtomatik to\'xtatildi',
    admin_terminated: 'Admin testni to\'xtatdi',
    abandoned: 'Test tashlab ketildi'
  };

  // ─── API (token bilan) ─────────────────────────────────────────────────────
  async function aapi(path, opts = {}) {
    try {
      return await api(path, { ...opts, token: A.token });
    } catch (err) {
      if (err.status === 401) {
        logout('Sessiya tugadi. Qaytadan kiring.');
      }
      throw err;
    }
  }

  // ─── KIRISH / CHIQISH ──────────────────────────────────────────────────────
  function showLogin(message) {
    $('app-view').hidden = true;
    $('login-view').hidden = false;
    $('login-error').textContent = message || '';
    $('login-pass').value = '';
    $('login-pass').focus();
  }

  async function onLogin(e) {
    e.preventDefault();
    const username = $('login-user').value.trim();
    const password = $('login-pass').value;
    const err = $('login-error');
    if (!username || !password) return (err.textContent = 'Login va parolni kiriting');
    const btn = $('login-btn');
    btn.disabled = true;
    err.textContent = '';
    try {
      const r = await api('/api/admin/login', { method: 'POST', body: { username, password } });
      A.token = r.token;
      sessionStore.set(TOKEN_KEY, r.token);
      $('login-pass').value = '';
      await enterApp();
    } catch (e2) {
      err.textContent = e2.message;
      $('login-pass').select();
    } finally {
      btn.disabled = false;
    }
  }

  function logout(message) {
    A.token = null;
    sessionStore.del(TOKEN_KEY);
    clearInterval(A.refreshTimer);
    document.querySelectorAll('.modal').forEach(m => m.remove());
    showLogin(message);
  }

  async function enterApp() {
    const me = await aapi('/api/admin/me');
    A.username = me.username;
    const nameChip = clear($('admin-name'));
    nameChip.append(icon('user-3-line'), ' ', me.username);
    $('p-username').value = me.username;
    $('login-view').hidden = true;
    $('app-view').hidden = false;
    await loadClasses();
    switchTab(A.tab);
  }

  // ─── BO'LIMLAR ─────────────────────────────────────────────────────────────
  function switchTab(tab) {
    A.tab = tab;
    for (const b of document.querySelectorAll('.nav-item')) b.classList.toggle('active', b.dataset.tab === tab);
    for (const s of document.querySelectorAll('.tab')) s.hidden = s.id !== 'tab-' + tab;
    clearInterval(A.refreshTimer);
    if (tab === 'results') {
      loadAttempts();
      A.refreshTimer = setInterval(() => { if (!document.hidden && !A.detailOpen) loadAttempts(true); }, REFRESH_MS);
    }
    if (tab === 'tests') loadTests();
    if (tab === 'classes') renderClasses();
    if (tab === 'settings') loadSettings();
    window.scrollTo(0, 0);
  }

  // ─── SINFLAR ───────────────────────────────────────────────────────────────
  async function loadClasses() {
    A.classes = await aapi('/api/admin/classes');
    fillClassSelects();
    renderTargets();
    if (A.tab === 'classes') renderClasses();
  }

  const gradeOf = id => id.split('-')[0];

  // "Yana qaysi sinflarga qo'shilsin" belgilash ro'yxati
  function renderTargets() {
    const box = $('t-targets');
    const current = $('t-class').value;
    const checked = new Set([...box.querySelectorAll('input:checked')].map(i => i.value));
    clear(box);
    const others = A.classes.filter(c => c.id !== current);
    $('t-targets-box').hidden = !others.length || A.editingId !== null;
    for (const c of others) {
      box.append(h('label', { class: 'target' },
        h('input', { type: 'checkbox', value: c.id, checked: checked.has(c.id) }),
        h('span', { text: c.id })));
    }
  }

  function selectedTargets() {
    return [...$('t-targets').querySelectorAll('input:checked')].map(i => i.value);
  }

  function fillClassSelects() {
    const rc = $('res-class');
    const prevR = rc.value;
    clear(rc).append(h('option', { value: '', text: 'Barcha sinflar' }), ...A.classes.map(c => h('option', { value: c.id, text: c.id })));
    rc.value = A.classes.some(c => c.id === prevR) ? prevR : '';

    const tc = $('t-class');
    const prevT = tc.value;
    clear(tc).append(h('option', { value: '', text: 'Sinfni tanlang' }), ...A.classes.map(c => h('option', { value: c.id, text: c.id })));
    tc.value = A.classes.some(c => c.id === prevT) ? prevT : (A.classes[0]?.id || '');
  }

  function renderClasses() {
    const list = clear($('c-list'));
    if (!A.classes.length) {
      list.append(h('p', { class: 'empty', text: 'Hali sinf qo\'shilmagan' }));
      return;
    }
    for (const c of A.classes) {
      list.append(h('div', { class: 'class-item' },
        h('div', { class: 'class-item-name' },
          h('span', { text: c.id }),
          h('small', { class: 'badge ' + (c.test_count ? 'risk-low' : 'risk-high'), text: `${c.test_count} ta savol` })),
        h('button', { class: 'icon-btn danger', type: 'button', 'aria-label': `${c.id} ni o'chirish`, onclick: () => delClass(c.id) },
          icon('delete-bin-line'))));
    }
  }

  async function onAddClass(e) {
    e.preventDefault();
    const input = $('c-name');
    const id = input.value.trim();
    if (!id) return input.focus();
    try {
      await aapi('/api/admin/classes', { method: 'POST', body: { id } });
      input.value = '';
      toast(`${id} qo'shildi`, 'success');
      await loadClasses();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function delClass(id) {
    const ok = await confirmDialog(`"${id}" sinfi, uning savollari va BARCHA natijalari o'chiriladi. Davom etasizmi?`,
      { title: 'Sinfni o\'chirish', okText: 'O\'chirish', danger: true });
    if (!ok) return;
    try {
      await aapi('/api/admin/classes/' + encodeURIComponent(id), { method: 'DELETE' });
      toast('Sinf o\'chirildi', 'success');
      await loadClasses();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ─── SAVOLLAR ──────────────────────────────────────────────────────────────
  async function loadTests() {
    const classId = $('t-class').value;
    const list = clear($('t-list'));
    $('t-count').textContent = 'Savollar';
    if (!classId) {
      list.append(h('p', { class: 'empty', text: 'Avval "Sinflar" bo\'limida sinf qo\'shing' }));
      return;
    }
    list.append(h('div', { class: 'skeleton' }));
    try {
      A.tests = await aapi('/api/admin/classes/' + encodeURIComponent(classId) + '/tests');
      renderTests();
    } catch (err) {
      clear(list).append(h('p', { class: 'empty error', text: err.message }));
    }
  }

  function renderTests() {
    const list = clear($('t-list'));
    $('t-count').textContent = `Savollar (${A.tests.length})`;
    if (!A.tests.length) {
      list.append(h('p', { class: 'empty', text: 'Bu sinfda hali savol yo\'q' }));
      return;
    }
    A.tests.forEach((t, i) => {
      list.append(h('div', { class: 'card q-item' },
        h('div', { class: 'q-item-head' },
          h('b', { class: 'q-item-text', text: `${i + 1}. ${t.question}` }),
          h('div', { class: 'row-tight' },
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Tahrirlash', onclick: () => editTest(t) }, icon('edit-line')),
            h('button', { class: 'icon-btn danger', type: 'button', 'aria-label': 'O\'chirish', onclick: () => delTest(t) }, icon('delete-bin-line')))),
        h('ul', { class: 'q-options' },
          t.options.map(o => h('li', { class: o === t.correct_answer ? 'correct' : '' },
            icon(o === t.correct_answer ? 'check-line' : 'close-line'), h('span', { text: o }))))));
    });
  }

  function editTest(t) {
    A.editingId = t.id;
    $('t-question').value = t.question;
    $('t-correct').value = t.correct_answer;
    const wrong = t.options.filter(o => o !== t.correct_answer);
    ['t-wrong1', 't-wrong2', 't-wrong3'].forEach((id, i) => { $(id).value = wrong[i] || ''; });
    $('t-cancel').hidden = false;
    $('t-targets-box').hidden = true;
    clear($('t-save')).append(icon('save-line'), ' Yangilash');
    $('t-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('t-question').focus();
  }

  function resetTestForm() {
    A.editingId = null;
    for (const id of ['t-question', 't-correct', 't-wrong1', 't-wrong2', 't-wrong3']) $(id).value = '';
    $('t-error').textContent = '';
    $('t-cancel').hidden = true;
    clear($('t-save')).append(icon('save-line'), ' Saqlash');
    renderTargets();
  }

  async function onSaveTest(e) {
    e.preventDefault();
    const classId = $('t-class').value;
    const err = $('t-error');
    const body = {
      question: $('t-question').value,
      correct_answer: $('t-correct').value,
      wrong_answers: ['t-wrong1', 't-wrong2', 't-wrong3'].map(id => $(id).value).filter(v => v.trim())
    };
    if (!classId) return (err.textContent = 'Sinfni tanlang');
    if (!body.question.trim() || !body.correct_answer.trim()) return (err.textContent = 'Savol va to\'g\'ri javobni kiriting');
    if (!body.wrong_answers.length) return (err.textContent = 'Kamida bitta xato javob kiriting');
    err.textContent = '';
    try {
      if (A.editingId) {
        await aapi('/api/admin/tests/' + A.editingId, { method: 'PUT', body });
        toast('Savol yangilandi', 'success');
      } else {
        body.target_classes = selectedTargets();
        const r = await aapi('/api/admin/classes/' + encodeURIComponent(classId) + '/tests', { method: 'POST', body });
        if (r.added.length) toast(`Qo'shildi: ${r.added.join(', ')}`, 'success');
        if (r.skipped.length) toast(`Allaqachon bor (o'tkazildi): ${r.skipped.join(', ')}`, 'warn', 5000);
      }
      resetTestForm();
      $('t-question').focus();
      loadTests();
      loadClasses();
    } catch (e2) {
      err.textContent = e2.message;
    }
  }

  function selectParallel() {
    const current = $('t-class').value;
    if (!current) return toast('Avval sinfni tanlang', 'warn');
    for (const cb of $('t-targets').querySelectorAll('input')) cb.checked = gradeOf(cb.value) === gradeOf(current);
  }

  async function copyToParallel() {
    const classId = $('t-class').value;
    if (!classId) return toast('Avval sinfni tanlang', 'warn');
    const parallels = A.classes.filter(c => c.id !== classId && gradeOf(c.id) === gradeOf(classId)).map(c => c.id);
    if (!parallels.length) return toast(`${gradeOf(classId)}-sinflar orasida boshqa sinf yo'q`, 'warn');
    const ok = await confirmDialog(`${classId} dagi savollar ${parallels.join(', ')} sinflariga ham qo'shiladi. U yerda bor savollar qayta qo'shilmaydi.`,
      { title: 'Parallel sinflarga tarqatish', okText: 'Tarqatish' });
    if (!ok) return;
    try {
      const r = await aapi('/api/admin/classes/' + encodeURIComponent(classId) + '/copy-to-parallel', { method: 'POST' });
      toast(`${r.parallel_classes.join(', ')} sinflariga ${r.added} ta savol qo'shildi`, 'success', 5000);
      loadClasses();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function dedupClass() {
    const classId = $('t-class').value;
    if (!classId) return toast('Avval sinfni tanlang', 'warn');
    const ok = await confirmDialog(`${classId} sinfidagi bir xil savollardan faqat bittasi qoladi, qolganlari o'chiriladi.`,
      { title: 'Takrorlarni tozalash', okText: 'Tozalash', danger: true });
    if (!ok) return;
    try {
      const r = await aapi('/api/admin/classes/' + encodeURIComponent(classId) + '/dedup', { method: 'POST' });
      toast(`${r.deleted} ta takroriy savol o'chirildi`, 'success');
      loadTests();
      loadClasses();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ─── Ommaviy yuklash ───
  // Qo'shtirnoqli maydonlarni ham to'g'ri o'qiydigan CSV parser (, yoki ; ajratgich)
  function parseCsv(text) {
    const src = text.replace(/^﻿/, '');
    const firstLine = src.split(/\r?\n/, 1)[0];
    const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (quoted) {
        if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
        else if (ch === '"') quoted = false;
        else field += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === sep) { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && src[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some(v => v.trim())) rows.push(row);
        row = [];
      } else field += ch;
    }
    row.push(field);
    if (row.some(v => v.trim())) rows.push(row);
    if (rows.length < 2) return [];
    const head = rows[0].map(x => x.trim().toLowerCase());
    return rows.slice(1).map(r => Object.fromEntries(head.map((k, i) => [k, (r[i] || '').trim()])));
  }

  async function uploadBulk() {
    const file = $('bulk-file').files[0];
    const status = clear($('bulk-status'));
    if (!file) return toast('Fayl tanlang', 'warn');
    if (file.size > 1.5 * 1024 * 1024) return toast('Fayl juda katta (maks. 1.5 MB)', 'error');
    let items;
    try {
      const text = await file.text();
      if (/\.json$/i.test(file.name)) {
        items = JSON.parse(text);
        if (!Array.isArray(items)) items = items.items || items.tests;
        if (!Array.isArray(items)) throw new Error('JSON massiv bo\'lishi kerak: [ {...}, {...} ]');
      } else if (/\.csv$/i.test(file.name)) {
        items = parseCsv(text);
      } else {
        throw new Error('Faqat .json yoki .csv fayl');
      }
    } catch (err) {
      status.append(h('p', { class: 'form-error', text: 'Fayl xatosi: ' + err.message }));
      return;
    }
    if (!items.length) return status.append(h('p', { class: 'form-error', text: 'Faylda savol topilmadi' }));

    const btn = $('bulk-upload');
    btn.disabled = true;
    status.append(h('p', { class: 'muted', text: `${items.length} ta savol yuborilmoqda...` }));
    try {
      const r = await aapi('/api/admin/tests/bulk', { method: 'POST', body: { items } });
      clear(status).append(h('p', { class: 'good', text: `✓ ${r.added} ta qo'shildi, ${r.skipped} ta takror o'tkazildi${r.failed ? `, ${r.failed} ta xato` : ''}` }));
      if (r.errors.length) {
        status.append(h('ul', { class: 'bulk-errors' }, r.errors.map(e => h('li', { text: `${e.row}-qator: ${e.error}` }))));
      }
      $('bulk-file').value = '';
      loadClasses();
      loadTests();
    } catch (err) {
      clear(status).append(h('p', { class: 'form-error', text: err.message }));
    } finally {
      btn.disabled = false;
    }
  }

  async function downloadTestsPdf() {
    const classId = $('t-class').value;
    if (!classId) return toast('Avval sinfni tanlang', 'warn');
    if (!A.tests.length) return toast('Bu sinfda savol yo\'q', 'warn');
    try {
      await ensurePdfLib();
      const doc = new window.jspdf.jsPDF();
      doc.setFontSize(16);
      doc.text(pdfText(`${classId} - Savollar bazasi`), 14, 15);
      doc.setFontSize(10);
      doc.text(pdfText(`Jami: ${A.tests.length} ta savol`), 14, 22);
      doc.autoTable({
        head: [['#', 'Savol', "To'g'ri javob", 'Xato javoblar']],
        body: A.tests.map((t, i) => [i + 1, t.question, t.correct_answer,
          t.options.filter(o => o !== t.correct_answer).join(' / ') || '-'].map(pdfText)),
        startY: 28,
        theme: 'grid',
        headStyles: { fillColor: [16, 185, 129] },
        columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 85 }, 2: { cellWidth: 45 }, 3: { cellWidth: 45 } },
        styles: { fontSize: 9, cellPadding: 2.5, overflow: 'linebreak' }
      });
      doc.save(`${classId.replace(/[^\w-]+/g, '_')}_savollar.pdf`);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function delTest(t) {
    const ok = await confirmDialog(`"${t.question.slice(0, 80)}" savoli o'chirilsinmi?`, { okText: 'O\'chirish', danger: true });
    if (!ok) return;
    try {
      await aapi('/api/admin/tests/' + t.id, { method: 'DELETE' });
      if (A.editingId === t.id) resetTestForm();
      loadTests();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ─── NATIJALAR ─────────────────────────────────────────────────────────────
  async function loadAttempts(silent) {
    const list = $('res-list');
    const classId = $('res-class').value;
    if (!silent) clear(list).append(h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' }));
    try {
      A.attempts = await aapi('/api/admin/attempts' + (classId ? '?class_id=' + encodeURIComponent(classId) : ''));
      $('live-dot').classList.remove('off');
      renderAttempts();
    } catch (err) {
      $('live-dot').classList.add('off');
      if (!silent) clear(list).append(h('p', { class: 'empty error', text: err.message }));
    }
  }

  function filteredAttempts() {
    const f = $('res-filter').value;
    return A.attempts.filter(a => {
      if (f === 'active') return a.status === 'active';
      if (f === 'suspicious') return a.risk === 'medium' || a.risk === 'high';
      if (f === 'finished') return a.status === 'finished';
      if (f === 'terminated') return a.status === 'terminated';
      return true;
    });
  }

  function stat(label, value, cls) {
    return h('div', { class: 'stat ' + (cls || '') }, h('b', { text: value }), h('span', { text: label }));
  }

  function renderAttempts() {
    const all = A.attempts;
    const done = all.filter(a => a.status !== 'active' && a.total > 0);
    const avg = done.length ? Math.round(done.reduce((s, a) => s + a.score / a.total, 0) / done.length * 100) : 0;
    clear($('res-stats')).append(
      stat('Jami', all.length),
      stat('Hozir yechmoqda', all.filter(a => a.status === 'active').length, 'stat-active'),
      stat('O\'rtacha ball', avg + '%'),
      stat('Shubhali', all.filter(a => a.risk === 'medium' || a.risk === 'high').length, 'stat-warn'));

    const list = clear($('res-list'));
    const rows = filteredAttempts();
    if (!rows.length) {
      list.append(h('p', { class: 'empty', text: 'Natija topilmadi' }));
      return;
    }
    // Sinf tanlangan bo'lsa: avval yechayotganlar, keyin ball bo'yicha o'rinlar
    if ($('res-class').value) {
      const places = rankMap(all);
      rows.sort((x, z) => {
        const ax = x.status === 'active';
        const az = z.status === 'active';
        if (ax !== az) return ax ? -1 : 1;
        return (places.get(x.id) || 1e9) - (places.get(z.id) || 1e9);
      });
      for (const a of rows) list.append(attemptCard(a, places.get(a.id)));
    } else {
      for (const a of rows) list.append(attemptCard(a));
    }
  }

  // Yakunlangan natijalar: ball ↓, teng bo'lsa kim tezroq tugatgan
  function ranked(list) {
    return list.filter(a => a.status !== 'active' && a.status !== 'abandoned')
      .sort((x, z) => z.score - x.score || duration(x) - duration(z));
  }

  function duration(a) {
    return a.finished_at ? new Date(a.finished_at) - new Date(a.started_at) : 1e12;
  }

  function rankMap(list) {
    return new Map(ranked(list).map((a, i) => [a.id, i + 1]));
  }

  const MEDALS = ['🥇', '🥈', '🥉'];

  function attemptCard(a, place) {
    const st = STATUS[a.status] || { label: a.status, cls: '' };
    const risk = RISK[a.risk] || RISK.unknown;
    const pct = a.total ? Math.round((a.score / a.total) * 100) : 0;
    const progress = a.status === 'active'
      ? h('span', { class: 'muted', text: `${Math.min(a.current_index + 1, a.question_count || 0)}/${a.question_count || 0}-savol` })
      : h('span', { class: 'score', text: `${a.score}/${a.total} (${pct}%)` });
    return h('button', { class: 'card attempt ' + risk.cls, type: 'button', onclick: () => openAttempt(a.id) },
      h('div', { class: 'attempt-top' },
        place ? h('span', { class: 'place' + (place <= 3 ? ' place-' + place : ''), text: place <= 3 ? MEDALS[place - 1] : place }) : null,
        h('div', { class: 'attempt-name' }, h('b', { text: a.student_name }), h('small', { text: a.team_name })),
        h('span', { class: 'badge ' + st.cls, text: st.label })),
      h('div', { class: 'attempt-meta' },
        h('span', { class: 'chip', text: a.class_id }),
        progress,
        h('span', { class: 'badge ' + risk.cls }, icon(risk.icon), ' ', risk.label),
        a.violations > 0 ? h('span', { class: 'badge risk-high' }, icon('alarm-warning-line'), ` ${a.violations}`) : null,
        a.snapshots > 0 ? h('span', { class: 'muted' }, icon('camera-line'), ` ${a.snapshots}`) : null),
      h('div', { class: 'attempt-date muted small', text: fmtDate(a.started_at) }));
  }

  async function openAttempt(id) {
    let d;
    try {
      d = await aapi('/api/admin/attempts/' + id);
    } catch (err) {
      return toast(err.message, 'error');
    }
    A.detailOpen = true;
    const objectUrls = [];
    const st = STATUS[d.status] || { label: d.status, cls: '' };
    const risk = RISK[d.risk] || RISK.unknown;
    const duration = d.finished_at ? new Date(d.finished_at) - new Date(d.started_at) : Date.now() - new Date(d.started_at);

    const info = h('div', { class: 'kv' },
      kv('Sinf', d.class_id),
      kv('Jamoa', d.team_name),
      kv('Holat', h('span', { class: 'badge ' + st.cls, text: st.label })),
      kv('Ball', `${d.score} / ${d.total}`),
      kv('Nazorat', h('span', { class: 'badge ' + risk.cls }, icon(risk.icon), ' ', risk.label)),
      kv('Qoidabuzarlik', String(d.violations)),
      kv('Boshlandi', fmtDate(d.started_at)),
      kv('Davomiyligi', fmtSec(duration)),
      kv('Kamera', d.camera ? 'Yoqilgan' : 'Yo\'q'),
      kv('Qurilma', shortUA(d.user_agent)),
      kv('IP', d.ip || '—'));

    const events = d.events.length
      ? h('ol', { class: 'timeline' }, d.events.map(e => h('li', { class: e.is_violation ? 'viol' : '' },
        h('time', { text: fmtTime(e.created_at) }),
        h('div', {},
          h('b', { text: EVENTS[e.type] || e.type }),
          e.question_index ? h('small', { text: ` · ${e.question_index}-savol` }) : null,
          e.detail ? h('div', { class: 'muted small', text: e.detail }) : null))))
      : h('p', { class: 'muted', text: d.status === 'legacy' ? 'Eski versiyadagi natija — nazorat ma\'lumoti yo\'q.' : 'Hech qanday qoidabuzarlik qayd etilmadi.' });

    const answers = d.answers.length
      ? h('div', { class: 'answers' }, d.answers.map((x, i) => h('div', { class: 'answer ' + (x.is_correct ? 'ok' : 'bad') },
        h('div', { class: 'answer-q', text: `${i + 1}. ${x.question || '(savol o\'chirilgan)'}` }),
        h('div', { class: 'answer-row' },
          icon(x.is_correct ? 'check-line' : 'close-line'),
          h('span', { text: x.timed_out && x.answer == null ? 'Vaqt tugadi — javob yo\'q' : (x.answer ?? '—') }),
          h('small', { class: 'muted', text: fmtSec(x.time_ms) })),
        !x.is_correct && x.correct_answer ? h('div', { class: 'muted small', text: `To'g'ri javob: ${x.correct_answer}` }) : null)))
      : h('p', { class: 'muted', text: 'Javoblar yo\'q' });

    const photos = h('div', { class: 'photos' });
    if (d.snapshots.length) {
      for (const s of d.snapshots) {
        const img = h('img', { alt: `Surat ${fmtTime(s.created_at)}`, loading: 'lazy' });
        photos.append(h('figure', {}, img, h('figcaption', { text: `${fmtTime(s.created_at)} · ${snapReason(s.reason)}` })));
        aapi('/api/admin/snapshots/' + s.id, { raw: true })
          .then(r => r.blob())
          .then(b => { const u = URL.createObjectURL(b); objectUrls.push(u); img.src = u; })
          .catch(() => { img.alt = 'Yuklanmadi'; });
      }
    } else {
      photos.append(h('p', { class: 'muted', text: 'Kamera suratlari yo\'q' }));
    }

    const actions = [];
    if (d.status === 'active') {
      actions.push(h('button', { class: 'btn btn-danger', type: 'button', onclick: async () => {
        if (!await confirmDialog('Test hozir to\'xtatilsinmi?', { okText: 'To\'xtatish', danger: true })) return;
        try {
          await aapi(`/api/admin/attempts/${d.id}/terminate`, { method: 'POST' });
          toast('Test to\'xtatildi', 'success');
          close();
        } catch (err) { toast(err.message, 'error'); }
      } }, icon('stop-circle-line'), ' To\'xtatish'));
    }
    actions.push(h('button', { class: 'btn btn-ghost', type: 'button', onclick: async () => {
      if (!await confirmDialog('Natija o\'chirilsinmi? O\'quvchi testni qayta topshira oladi.', { okText: 'O\'chirish', danger: true })) return;
      try {
        await aapi('/api/admin/attempts/' + d.id, { method: 'DELETE' });
        toast('Natija o\'chirildi', 'success');
        close();
      } catch (err) { toast(err.message, 'error'); }
    } }, icon('delete-bin-line'), ' O\'chirish (qayta topshirish)'));

    const close = openModal({
      title: d.student_name,
      wide: true,
      body: h('div', { class: 'detail' },
        info,
        h('h4', {}, icon('shield-user-line'), ' Nazorat jurnali'), events,
        h('h4', {}, icon('list-check-2'), ` Javoblar (${d.answers.length})`), answers,
        h('h4', {}, icon('camera-line'), ` Kamera suratlari (${d.snapshots.length})`), photos),
      actions,
      onClose: () => {
        A.detailOpen = false;
        objectUrls.forEach(u => URL.revokeObjectURL(u));
        loadAttempts(true);
      }
    });
  }

  function kv(k, v) {
    return h('div', { class: 'kv-row' }, h('span', { text: k }), v instanceof Node ? v : h('b', { text: v ?? '—' }));
  }

  function snapReason(r) {
    return { start: 'boshida', interval: 'davriy', violation: 'qoidabuzarlikda', return: 'qaytganda' }[r] || r || '';
  }

  function shortUA(ua) {
    if (!ua) return '—';
    const os = /Android [\d.]+/.exec(ua)?.[0] || (/iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '');
    const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /YaBrowser/.test(ua) ? 'Yandex' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
    return [os, br].filter(Boolean).join(' · ') || ua.slice(0, 40);
  }

  // ─── PDF ───────────────────────────────────────────────────────────────────
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = h('script', { src, crossorigin: 'anonymous', referrerpolicy: 'no-referrer' });
      s.onload = resolve;
      s.onerror = () => reject(new Error('PDF kutubxonasi yuklanmadi'));
      document.head.append(s);
    });
  }

  async function ensurePdfLib() {
    if (!window.jspdf) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    if (!window.jspdf.jsPDF.API.autoTable) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js');
  }

  const CYR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 's', ч: 'ch', ш: 'sh', щ: 'sh', ъ: "'", ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: "o'", қ: 'q', ғ: "g'", ҳ: 'h' };

  // Standart PDF shrifti faqat lotin harflarini qo'llaydi
  function pdfText(s) {
    return String(s ?? '')
      .replace(/[ʻʼ’‘`]/g, "'")
      .replace(/[Ѐ-ӿ]/g, ch => {
        const low = ch.toLowerCase();
        const t = CYR[low] ?? '';
        return ch === low ? t : t.charAt(0).toUpperCase() + t.slice(1);
      })
      .replace(/[^\x20-\x7E -ÿ]/g, '?');
  }

  async function downloadPdf(top3) {
    const btn = $(top3 ? 'btn-top3' : 'btn-pdf');
    btn.disabled = true;
    try {
      await ensurePdfLib();
      const rows = (top3 ? A.attempts : filteredAttempts()).filter(a => a.status !== 'active');
      if (!rows.length) return toast('PDF uchun natija yo\'q', 'warn');
      const doc = new window.jspdf.jsPDF();
      const classId = $('res-class').value;
      const title = top3 ? 'TOP-3 g\'oliblar' : (classId ? classId + ' natijalari' : 'Umumiy natijalar');
      doc.setFontSize(16);
      doc.text(pdfText(`STEAM PLAZA — ${title}`), 14, 16);
      doc.setFontSize(9);
      doc.text(pdfText(`Sana: ${fmtDate(new Date())}`), 14, 22);

      const groups = new Map();
      for (const a of rows) {
        if (!groups.has(a.class_id)) groups.set(a.class_id, []);
        groups.get(a.class_id).push(a);
      }
      let y = 28;
      const PLACE = ['1 (Oltin)', '2 (Kumush)', '3 (Bronza)'];
      for (const [cls, group] of [...groups.entries()].sort()) {
        let list = ranked(group);
        if (top3) list = list.slice(0, 3);
        if (!list.length) continue;
        if (y > 260) { doc.addPage(); y = 16; }
        doc.setFontSize(12);
        doc.text(pdfText(cls), 14, y);
        doc.autoTable({
          head: [["O'rin", 'Jamoa', 'Ism', 'Ball', 'Holat', 'Qoidabuzarlik', 'Nazorat', 'Sana']],
          body: list.map((a, i) => [top3 ? PLACE[i] : i + 1, a.team_name, a.student_name, `${a.score}/${a.total}`,
            (STATUS[a.status] || {}).label || a.status, a.violations, (RISK[a.risk] || RISK.unknown).label, fmtDate(a.started_at)]
            .map(pdfText)),
          startY: y + 2,
          theme: 'grid',
          styles: { fontSize: 8 },
          headStyles: { fillColor: [16, 185, 129] }
        });
        y = doc.lastAutoTable.finalY + 12;
      }
      doc.save(`${(classId || 'barcha').replace(/[^\w-]+/g, '_')}_${top3 ? 'top3' : 'natijalar'}.pdf`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  // ─── SOZLAMALAR ────────────────────────────────────────────────────────────
  async function loadSettings() {
    try {
      const s = await aapi('/api/admin/settings');
      $('s-time').value = s.question_time_sec;
      $('s-viol').value = s.max_violations;
      $('s-count').value = s.questions_per_attempt;
      $('s-camera').value = s.camera_mode;
      $('s-share').checked = s.share_grade_tests;
      $('s-score').checked = s.show_score_to_student;
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function onSaveSettings(e) {
    e.preventDefault();
    const body = {
      question_time_sec: Number($('s-time').value),
      max_violations: Number($('s-viol').value),
      questions_per_attempt: Number($('s-count').value),
      camera_mode: $('s-camera').value,
      share_grade_tests: $('s-share').checked,
      show_score_to_student: $('s-score').checked
    };
    try {
      await aapi('/api/admin/settings', { method: 'PUT', body });
      await loadSettings();
      toast('Sozlamalar saqlandi', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function passwordScore(pw) {
    let s = 0;
    if (pw.length >= 10) s++;
    if (pw.length >= 14) s++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
    if (/\d/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    return s;
  }

  function onPasswordInput() {
    const s = passwordScore($('p-new').value);
    const bar = $('p-strength');
    bar.dataset.level = String(s);
    bar.firstElementChild.style.width = `${(s / 5) * 100}%`;
  }

  async function onChangePassword(e) {
    e.preventDefault();
    const err = $('p-error');
    const current = $('p-current').value;
    const next = $('p-new').value;
    if (!current || !next) return (err.textContent = 'Barcha maydonlarni to\'ldiring');
    if (next !== $('p-new2').value) return (err.textContent = 'Yangi parollar mos emas');
    if (next.length < 10 || !/\p{L}/u.test(next) || !/\d/.test(next)) {
      return (err.textContent = 'Kamida 10 belgi, harf va raqam bo\'lishi kerak');
    }
    err.textContent = '';
    try {
      const r = await aapi('/api/admin/password', { method: 'POST', body: { current_password: current, new_password: next } });
      A.token = r.token;
      sessionStore.set(TOKEN_KEY, r.token);
      for (const id of ['p-current', 'p-new', 'p-new2']) $(id).value = '';
      onPasswordInput();
      toast('Parol yangilandi. Boshqa qurilmalardagi sessiyalar yopildi.', 'success', 5000);
    } catch (e2) {
      err.textContent = e2.message;
    }
  }

  async function onClearAll() {
    const password = await promptPassword('Barcha ma\'lumotlar o\'chiriladi. Tasdiqlash uchun admin parolini kiriting.',
      { title: 'Bazani tozalash', okText: 'Hammasini o\'chirish', danger: true });
    if (!password) return;
    try {
      await aapi('/api/admin/clear-all', { method: 'POST', body: { password } });
      toast('Baza tozalandi', 'success');
      await loadClasses();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ─── ISHGA TUSHIRISH ───────────────────────────────────────────────────────
  function bindEvents() {
    $('login-form').addEventListener('submit', onLogin);
    $('toggle-pass').addEventListener('click', () => {
      const p = $('login-pass');
      p.type = p.type === 'password' ? 'text' : 'password';
      clear($('toggle-pass')).append(icon(p.type === 'password' ? 'eye-line' : 'eye-off-line'));
    });
    $('btn-logout').addEventListener('click', () => logout());
    for (const b of document.querySelectorAll('.nav-item')) b.addEventListener('click', () => switchTab(b.dataset.tab));

    $('res-class').addEventListener('change', () => loadAttempts());
    $('res-filter').addEventListener('change', renderAttempts);
    $('btn-pdf').addEventListener('click', () => downloadPdf(false));
    $('btn-top3').addEventListener('click', () => downloadPdf(true));
    $('t-pdf').addEventListener('click', downloadTestsPdf);
    $('t-copy').addEventListener('click', copyToParallel);
    $('t-dedup').addEventListener('click', dedupClass);
    $('t-sel-parallel').addEventListener('click', selectParallel);
    $('t-sel-clear').addEventListener('click', () => { for (const cb of $('t-targets').querySelectorAll('input')) cb.checked = false; });
    $('bulk-upload').addEventListener('click', uploadBulk);

    $('t-class').addEventListener('change', () => { resetTestForm(); loadTests(); });
    $('t-form').addEventListener('submit', onSaveTest);
    $('t-cancel').addEventListener('click', resetTestForm);

    $('c-form').addEventListener('submit', onAddClass);

    $('s-form').addEventListener('submit', onSaveSettings);
    $('p-form').addEventListener('submit', onChangePassword);
    $('p-new').addEventListener('input', onPasswordInput);
    $('btn-clear').addEventListener('click', onClearAll);
  }

  async function init() {
    bindEvents();
    A.token = sessionStore.get(TOKEN_KEY);
    if (!A.token) return showLogin();
    try {
      await enterApp();
    } catch (err) {
      if (err.status !== 401) showLogin(err.message);
    }
  }

  init();
})();
