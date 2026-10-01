'use strict';
// ─── ADMIN PANEL ───────────────────────────────────────────────────────────────
(() => {
  const TOKEN_KEY = 'sp_admin';
  const REFRESH_MS = 10000;
  const LIVE_REFRESH_MS = 4000;

  const A = {
    token: null,
    username: '',
    tab: 'live',
    liveTiles: new Map(),
    selected: new Set(),
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
    face_away: 'Yuzi kameradan chiqdi',
    face_missing: 'Uzoq vaqt kameradan chiqib ketdi',
    multiple_faces: 'Kamerada boshqa odam bor',
    head_turned: 'Boshini yon tomonga burdi',
    head_turned_long: 'Uzoq vaqt boshqa tomonga qaradi',
    looking_down: 'Pastga qaradi (kitob/telefon?)',
    looking_down_long: 'Uzoq vaqt pastga qaradi',
    motion: 'Ortiqcha harakat',
    ai_unavailable: 'Yuzni aniqlash ishlamadi',
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
    if (tab === 'live') {
      syncCameraSwitch();
      loadLive();
      A.refreshTimer = setInterval(() => { if (!document.hidden && !A.detailOpen) loadLive(); }, LIVE_REFRESH_MS);
    }
    if (tab === 'results') {
      loadAttempts();
      A.refreshTimer = setInterval(() => { if (!document.hidden && !A.detailOpen) loadAttempts(true); }, REFRESH_MS);
    }
    if (tab === 'tests') loadTests();
    if (tab === 'classes') renderClasses();
    if (tab === 'settings') loadSettings();
    window.scrollTo(0, 0);
  }

  // ─── JONLI KUZATUV ─────────────────────────────────────────────────────────
  async function loadLive() {
    const grid = $('live-grid');
    let rows;
    try {
      rows = await aapi('/api/admin/live');
      $('live-dot2').classList.remove('off');
    } catch (err) {
      $('live-dot2').classList.add('off');
      if (!A.liveTiles.size) clear(grid).append(h('p', { class: 'empty error', text: err.message }));
      return;
    }
    processAlerts(rows);

    const seen = new Set(rows.map(r => r.id));
    for (const [id, tile] of A.liveTiles) {
      if (!seen.has(id)) {
        if (tile.url) URL.revokeObjectURL(tile.url);
        tile.el.remove();
        A.liveTiles.delete(id);
      }
    }
    const empty = grid.querySelector('.empty');
    if (empty) empty.remove();
    if (!rows.length) {
      grid.append(h('p', { class: 'empty', text: 'Hozir hech kim test yechmayapti' }));
      return;
    }

    for (const r of rows) {
      let tile = A.liveTiles.get(r.id);
      if (!tile) {
        const img = h('img', { alt: '' });
        const cam = h('div', { class: 'live-cam' }, img, h('span', { class: 'live-nocam' }, icon('camera-off-line'), ' Kadr yo\'q'));
        const info = h('div', { class: 'live-info' });
        const el = h('button', { class: 'live-tile', type: 'button', onclick: () => openFocus(r.id) }, cam, info);
        tile = { el, img, cam, info, frameAt: null, url: null, lastAlertId: null };
        A.liveTiles.set(r.id, tile);
        grid.append(el);
      }
      tile.row = r;
      const alert = r.last_alert;
      const recentAlert = alert && Date.now() - new Date(alert.at) < 30000;
      tile.el.classList.toggle('alert', !!recentAlert);
      tile.el.classList.toggle('warned', r.violations > 0 || r.alert_count > 0);
      // h() orqali: null bolalar tashlab yuboriladi (append'ning o'zi "null" deb yozib qo'yadi)
      const info = h('div', { class: 'live-info' },
        h('b', { text: r.student_name }),
        h('div', { class: 'live-meta' },
          h('span', { class: 'chip', text: r.class_id }),
          h('span', { text: `${Math.min(r.current_index + 1, r.question_count || 0)}/${r.question_count || 0}` }),
          r.violations > 0 ? h('span', { class: 'badge risk-high' }, icon('alarm-warning-line'), ` ${r.violations}`) : null),
        recentAlert
          ? h('small', { class: 'live-warn' }, icon('alarm-warning-fill'), ' ', EVENTS[alert.type] || alert.type)
          : null);
      tile.info.replaceWith(info);
      tile.info = info;

      const frameAt = r.frame_at || null;
      tile.cam.classList.toggle('has-frame', !!frameAt);
      if (frameAt && frameAt !== tile.frameAt) {
        tile.frameAt = frameAt;
        aapi(`/api/admin/live/${r.id}/frame`, { raw: true })
          .then(res => res.blob())
          .then(b => {
            const old = tile.url;
            tile.url = URL.createObjectURL(b);
            tile.img.src = tile.url;
            if (old) URL.revokeObjectURL(old);
          })
          .catch(() => {});
      }
    }
  }

  // ─── Xavf signallari (har qaysi bo'limda ishlaydi) ───
  // attempt_id -> oxirgi ko'rilgan signal id
  const seenAlerts = new Map();

  function processAlerts(rows) {
    for (const r of rows) {
      const alert = r.last_alert;
      const prev = seenAlerts.get(r.id);
      if (alert && alert.id !== prev) {
        // Sahifa ochilganda eski signallar uchun ovoz chiqmasin — faqat yangilari
        const fresh = Date.now() - new Date(alert.at) < 15000;
        if (prev !== undefined || fresh) notifyAlert(r, alert);
        seenAlerts.set(r.id, alert.id);
      } else if (!alert && prev === undefined) {
        seenAlerts.set(r.id, 0);
      }
    }
  }

  // Kuzatuv bo'limi ochiq bo'lmasa ham signallar kelsin
  async function pollAlerts() {
    if (!A.token || A.tab === 'live') return;
    try { processAlerts(await aapi('/api/admin/live')); } catch { /* keyingi safar */ }
  }

  // Brauzerlar ovozni sahifada birinchi bosishgacha bloklaydi — birinchi bosishda ochamiz
  let audioCtx = null;
  function unlockAudio() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch { /* ovoz qo'llanmaydi */ }
  }

  function beep() {
    try {
      unlockAudio();
      if (!audioCtx) return;
      const t = audioCtx.currentTime + 0.02;
      for (const [start, freq] of [[0, 880], [0.2, 660], [0.4, 880]]) {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'square';
        o.frequency.value = freq;
        o.connect(g);
        g.connect(audioCtx.destination);
        g.gain.setValueAtTime(0.0001, t + start);
        g.gain.exponentialRampToValueAtTime(0.25, t + start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + start + 0.18);
        o.start(t + start);
        o.stop(t + start + 0.19);
      }
    } catch { /* ovoz qo'llanmasa — faqat bildirishnoma */ }
  }

  let titleTimer = null;
  function notifyAlert(r, alert) {
    const text = `${r.student_name}: ${EVENTS[alert.type] || alert.type}`;
    if ($('live-sound').checked) beep();
    toast(text, 'error', 7000);
    // Admin boshqa varaqda bo'lsa — sarlavha miltillaydi
    if (document.hidden) {
      clearInterval(titleTimer);
      const base = 'Steam Plaza | Admin';
      let on = false;
      titleTimer = setInterval(() => { document.title = (on = !on) ? `⚠ ${text}` : base; }, 1000);
      const stop = () => { clearInterval(titleTimer); document.title = base; document.removeEventListener('visibilitychange', stop); };
      document.addEventListener('visibilitychange', stop);
    }
  }

  // ─── Kamera nazoratini yoqish/o'chirish ───
  async function syncCameraSwitch() {
    try {
      const s = await aapi('/api/admin/settings');
      $('live-camera').checked = s.camera_mode === 'required';
      $('live-paper').checked = s.allow_paper;
    } catch { /* ignore */ }
  }

  async function onPaperSwitch() {
    const sw = $('live-paper');
    const on = sw.checked;
    sw.disabled = true;
    try {
      await aapi('/api/admin/settings', { method: 'PUT', body: { allow_paper: on } });
      toast(on ? 'Qog\'ozda ishlashga ruxsat berildi — pastga qarash xavf hisoblanmaydi (yangi testlarga)'
        : 'Qog\'ozda ishlash o\'chirildi', 'success', 5000);
    } catch (err) {
      sw.checked = !on;
      toast(err.message, 'error');
    } finally {
      sw.disabled = false;
    }
  }

  async function onCameraSwitch() {
    const sw = $('live-camera');
    const on = sw.checked;
    sw.disabled = true;
    try {
      await aapi('/api/admin/settings', { method: 'PUT', body: { camera_mode: on ? 'required' : 'off' } });
      toast(on ? 'Kamera nazorati yoqildi — yangi boshlanadigan testlarda kamera majburiy'
        : 'Kamera nazorati o\'chirildi', 'success', 5000);
    } catch (err) {
      sw.checked = !on;
      toast(err.message, 'error');
    } finally {
      sw.disabled = false;
    }
  }

  // ─── O'quvchini katta oynada kuzatish (kadr har soniyada) ───
  function openFocus(id) {
    const r = A.liveTiles.get(id)?.row;
    if (!r) return openAttempt(id);
    let stopped = false;
    let url = null;
    const sleep = ms => new Promise(res => setTimeout(res, ms));
    // Hodisa suratlari har 3 soniyada qayta yuklanmasligi uchun kesh
    const photoUrls = new Map();
    const focusPhoto = (img, snapshotId, caption) => {
      const show = u => { img.src = u; img.addEventListener('click', () => openPhoto(u, caption)); };
      if (photoUrls.has(snapshotId)) return show(photoUrls.get(snapshotId));
      aapi('/api/admin/snapshots/' + snapshotId, { raw: true })
        .then(res => res.blob())
        .then(b => { const u = URL.createObjectURL(b); photoUrls.set(snapshotId, u); show(u); })
        .catch(() => {});
    };

    const img = h('img', { class: 'focus-img', alt: `${r.student_name} kamerasi` });
    const cam = h('div', { class: 'focus-cam' }, img,
      h('span', { class: 'focus-live' }, h('span'), ' JONLI'),
      h('span', { class: 'live-nocam' }, icon('camera-off-line'), ' Kadr kelmayapti'));
    const status = h('div', { class: 'focus-status' });
    const events = h('div', {});

    const close = openModal({
      title: r.student_name,
      wide: true,
      body: h('div', { class: 'focus' }, cam, status, h('h4', {}, icon('shield-user-line'), ' Oxirgi hodisalar'), events),
      actions: [
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { close(); openAttempt(id); } },
          icon('file-list-3-line'), ' Batafsil'),
        h('button', { class: 'btn btn-danger', type: 'button', onclick: async () => {
          if (!await confirmDialog(`${r.student_name} testi hozir to'xtatilsinmi?`, { okText: 'To\'xtatish', danger: true })) return;
          try {
            await aapi(`/api/admin/attempts/${id}/terminate`, { method: 'POST' });
            toast('Test to\'xtatildi', 'success');
            close();
            loadLive();
          } catch (err) { toast(err.message, 'error'); }
        } }, icon('stop-circle-line'), ' To\'xtatish')
      ],
      onClose: () => {
        stopped = true;
        if (url) URL.revokeObjectURL(url);
        photoUrls.forEach(u => URL.revokeObjectURL(u));
      }
    });

    (async () => {
      while (!stopped) {
        try {
          const res = await aapi(`/api/admin/live/${id}/frame?focus=1`, { raw: true });
          const u = URL.createObjectURL(await res.blob());
          if (stopped) { URL.revokeObjectURL(u); break; }
          img.src = u;
          if (url) URL.revokeObjectURL(url);
          url = u;
          cam.classList.add('has-frame');
        } catch {
          cam.classList.remove('has-frame');
        }
        await sleep(1000);
      }
    })();

    (async () => {
      while (!stopped) {
        try {
          const d = await aapi('/api/admin/attempts/' + id);
          const st = STATUS[d.status] || { label: d.status, cls: '' };
          clear(status).append(
            h('span', { class: 'chip', text: d.class_id }),
            h('span', { class: 'badge ' + st.cls, text: st.label }),
            h('span', { text: `${Math.min(d.current_index + 1, d.question_count || 0)}/${d.question_count || 0}-savol` }),
            h('span', { class: 'badge ' + (d.violations ? 'risk-high' : 'risk-low') }, icon('alarm-warning-line'), ` ${d.violations} qoidabuzarlik`));
          const recent = d.events.slice(-8).reverse();
          clear(events).append(
            eventSummary(d.events),
            recent.length
              ? h('ol', { class: 'timeline' }, recent.map(e => {
                const label = EVENTS[e.type] || e.type;
                let thumb = null;
                if (e.snapshot_id) {
                  thumb = h('img', { class: 'ev-photo', alt: label, title: 'Kattalashtirish uchun bosing' });
                  focusPhoto(thumb, e.snapshot_id, `${fmtTime(e.created_at)} · ${label}`);
                }
                return h('li', { class: e.is_violation ? 'viol' : ALERT_UI.has(e.type) ? 'warnev' : '' },
                  h('time', { text: fmtTime(e.created_at) }),
                  h('div', { class: 'ev-body' },
                    h('div', {}, h('b', { text: label }), e.detail ? h('div', { class: 'muted small', text: e.detail }) : null),
                    thumb));
              }))
              : h('p', { class: 'muted', text: 'Hozircha hodisa yo\'q — o\'quvchi qoidaga amal qilmoqda.' }));
        } catch { /* keyingi urinishda */ }
        await sleep(3000);
      }
    })();
  }

  const ALERT_UI = new Set(['face_away', 'face_missing', 'multiple_faces', 'head_turned', 'head_turned_long', 'looking_down', 'looking_down_long', 'motion']);

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
      await Report.ensureLib();
      const pdfText = Report.pdfText;
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
    // Ro'yxatdan chiqib ketgan (o'chirilgan) natijalar belgidan olinadi
    const ids = new Set(A.attempts.map(a => a.id));
    for (const id of A.selected) if (!ids.has(id)) A.selected.delete(id);
    updateSelection();
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
    const warns = Report.warningCount(a);
    const cb = h('input', { type: 'checkbox', 'aria-label': `${a.student_name} ni belgilash`, checked: A.selected.has(a.id) });
    cb.addEventListener('change', () => {
      if (cb.checked) A.selected.add(a.id); else A.selected.delete(a.id);
      card.classList.toggle('selected', cb.checked);
      updateSelection();
    });
    const card = h('div', { class: 'card attempt ' + risk.cls + (A.selected.has(a.id) ? ' selected' : '') },
      h('label', { class: 'attempt-check' }, cb),
      h('button', { class: 'attempt-main', type: 'button', onclick: () => openAttempt(a.id) },
        h('div', { class: 'attempt-top' },
          place ? h('span', { class: 'place' + (place <= 3 ? ' place-' + place : ''), text: place <= 3 ? MEDALS[place - 1] : place }) : null,
          h('div', { class: 'attempt-name' }, h('b', { text: a.student_name }),
            a.team_name && a.team_name !== '-' ? h('small', { text: a.team_name }) : null),
          h('span', { class: 'badge ' + st.cls, text: st.label })),
        h('div', { class: 'attempt-meta' },
          h('span', { class: 'chip', text: a.class_id }),
          progress,
          h('span', { class: 'badge ' + risk.cls }, icon(risk.icon), ' ', risk.label),
          a.violations > 0 ? h('span', { class: 'badge risk-high', title: 'Qoidabuzarliklar' }, icon('alarm-warning-line'), ` ${a.violations}`) : null,
          warns > 0 ? h('span', { class: 'badge risk-medium', title: 'Ogohlantirishlar' }, icon('error-warning-line'), ` ${warns} ogohl.`) : null,
          a.snapshots > 0 ? h('span', { class: 'muted' }, icon('camera-line'), ` ${a.snapshots}`) : null),
        h('div', { class: 'attempt-date muted small', text: fmtDate(a.started_at) })));
    return card;
  }

  // ─── Belgilash va ommaviy amallar ───
  // Belgilangan bo'lsa — faqat ular, aks holda ro'yxatdagi (filtrdagi) barcha natijalar
  function targetAttempts() {
    const rows = filteredAttempts();
    return A.selected.size ? rows.filter(a => A.selected.has(a.id)) : rows;
  }

  function updateSelection() {
    const rows = filteredAttempts();
    const n = rows.filter(a => A.selected.has(a.id)).length;
    const all = $('sel-all');
    all.checked = n > 0 && n === rows.length;
    all.indeterminate = n > 0 && n < rows.length;
    $('sel-label').textContent = n ? `${n} ta belgilandi` : 'Hammasini belgilash';
    $('sel-hint').textContent = n
      ? 'Amallar faqat belgilangan natijalarga qo\'llanadi.'
      : `Hech narsa belgilanmasa — ro'yxatdagi barcha ${rows.length} ta natijaga qo'llanadi.`;
    $('bulkbar').hidden = !rows.length;
  }

  function onSelectAll() {
    const rows = filteredAttempts();
    const on = $('sel-all').checked;
    for (const a of rows) { if (on) A.selected.add(a.id); else A.selected.delete(a.id); }
    renderAttempts();
  }

  async function onBulkDelete() {
    const rows = targetAttempts();
    if (!rows.length) return toast('O\'chirish uchun natija yo\'q', 'warn');
    const active = rows.filter(a => a.status === 'active').length;
    const password = await promptPassword(
      `${rows.length} ta natija butunlay o'chiriladi (javoblar, nazorat jurnali, kamera suratlari bilan)` +
      (active ? `, shundan ${active} tasi hozir test yechmoqda` : '') +
      '. O\'quvchilar testni qayta topshira oladi. Tasdiqlash uchun admin parolini kiriting.',
      { title: 'Natijalarni o\'chirish', okText: `${rows.length} tasini o'chirish`, danger: true });
    if (!password) return;
    try {
      const r = await aapi('/api/admin/attempts/bulk-delete', { method: 'POST', body: { ids: rows.map(a => a.id), password } });
      A.selected.clear();
      toast(`${r.deleted} ta natija o'chirildi`, 'success');
      loadAttempts();
    } catch (err) {
      toast(err.message, 'error');
    }
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
      d.team_name && d.team_name !== '-' ? kv('Jamoa', d.team_name) : null,
      kv('Holat', h('span', { class: 'badge ' + st.cls, text: st.label })),
      kv('Ball', `${d.score} / ${d.total}`),
      kv('Nazorat', h('span', { class: 'badge ' + risk.cls }, icon(risk.icon), ' ', risk.label)),
      kv('Qoidabuzarlik', String(d.violations)),
      kv('Boshlandi', fmtDate(d.started_at)),
      kv('Davomiyligi', fmtSec(duration)),
      kv('Kamera', d.camera ? 'Yoqilgan' : 'Yo\'q'),
      kv('Qurilma', shortUA(d.user_agent)),
      kv('IP', d.ip || '—'));

    // Surat (blob) yuklab, img ga qo'yadi; bosilsa katta ko'rinishda ochiladi
    const loadPhoto = (img, snapshotId, caption) => {
      aapi('/api/admin/snapshots/' + snapshotId, { raw: true })
        .then(r => r.blob())
        .then(b => {
          const u = URL.createObjectURL(b);
          objectUrls.push(u);
          img.src = u;
          img.addEventListener('click', () => openPhoto(u, caption));
        })
        .catch(() => { img.alt = 'Yuklanmadi'; });
    };

    const summary = eventSummary(d.events);
    const events = d.events.length
      ? h('ol', { class: 'timeline' }, d.events.map(e => {
        const label = EVENTS[e.type] || e.type;
        let thumb = null;
        if (e.snapshot_id) {
          thumb = h('img', { class: 'ev-photo', alt: `${label} — surat`, loading: 'lazy', title: 'Kattalashtirish uchun bosing' });
          loadPhoto(thumb, e.snapshot_id, `${fmtTime(e.created_at)} · ${label}`);
        }
        return h('li', { class: (e.is_violation ? 'viol' : ALERT_UI.has(e.type) ? 'warnev' : '') + (thumb ? ' has-photo' : '') },
          h('time', { text: fmtTime(e.created_at) }),
          h('div', { class: 'ev-body' },
            h('div', {},
              h('b', { text: label }),
              e.is_violation ? h('span', { class: 'badge risk-high ev-kind', text: 'Qoidabuzarlik' })
                : ALERT_UI.has(e.type) ? h('span', { class: 'badge risk-medium ev-kind', text: 'Ogohlantirish' }) : null,
              e.question_index ? h('small', { text: ` · ${e.question_index}-savol` }) : null,
              e.detail ? h('div', { class: 'muted small', text: e.detail }) : null),
            thumb));
      }))
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

    // Hodisaga bog'lanmagan suratlar (masalan, test boshidagi) — alohida
    const linked = new Set(d.events.map(e => e.snapshot_id).filter(Boolean));
    const otherShots = d.snapshots.filter(s => !linked.has(s.id));
    const photos = h('div', { class: 'photos' });
    if (otherShots.length) {
      for (const s of otherShots) {
        const caption = `${fmtTime(s.created_at)} · ${snapReason(s.reason)}`;
        const img = h('img', { alt: `Surat ${caption}`, loading: 'lazy' });
        photos.append(h('figure', {}, img, h('figcaption', { text: caption })));
        loadPhoto(img, s.id, caption);
      }
    } else {
      photos.append(h('p', { class: 'muted', text: 'Boshqa suratlar yo\'q' }));
    }

    const actions = [];
    if (d.status !== 'active') {
      const sheetBtn = h('button', { class: 'btn btn-primary', type: 'button',
        onclick: () => downloadStudentPdf([d.id], false, sheetBtn) }, icon('user-shared-line'), ' O\'quvchiga PDF');
      const fullBtn = h('button', { class: 'btn btn-ghost', type: 'button',
        onclick: () => downloadStudentPdf([d.id], true, fullBtn) }, icon('file-shield-2-line'), ' To\'liq hisobot PDF');
      actions.push(sheetBtn, fullBtn);
    }
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
        h('h4', {}, icon('alarm-warning-line'), ' Ogohlantirish va qoidabuzarliklar — necha marta'), summary,
        h('h4', {}, icon('shield-user-line'), ` Nazorat jurnali (${d.events.length}) — har biri surati bilan`), events,
        h('h4', {}, icon('list-check-2'), ` Javoblar (${d.answers.length})`), answers,
        h('h4', {}, icon('camera-line'), ` Test boshidagi va boshqa suratlar (${otherShots.length})`), photos),
      actions,
      onClose: () => {
        A.detailOpen = false;
        objectUrls.forEach(u => URL.revokeObjectURL(u));
        loadAttempts(true);
      }
    });
  }

  // Har bir hodisa turi necha marta bo'lgani: qoidabuzarliklar va ogohlantirishlar alohida
  function eventSummary(events) {
    const viol = new Map();
    const warn = new Map();
    for (const e of events) {
      const map = e.is_violation ? viol : (ALERT_UI.has(e.type) || Report.WARNING_TYPES.includes(e.type)) ? warn : null;
      if (map) map.set(e.type, (map.get(e.type) || 0) + 1);
    }
    if (!viol.size && !warn.size) return h('p', { class: 'muted', text: 'Ogohlantirish ham, qoidabuzarlik ham bo\'lmadi.' });
    const chips = (map, cls) => [...map.entries()].sort((a, b) => b[1] - a[1])
      .map(([t, n]) => h('span', { class: 'badge ' + cls }, `${EVENTS[t] || t} — ${n} marta`));
    return h('div', { class: 'ev-summary' },
      viol.size ? h('div', {}, h('small', { class: 'muted', text: 'Qoidabuzarliklar:' }), h('div', { class: 'chips' }, chips(viol, 'risk-high'))) : null,
      warn.size ? h('div', {}, h('small', { class: 'muted', text: 'Ogohlantirishlar:' }), h('div', { class: 'chips' }, chips(warn, 'risk-medium'))) : null);
  }

  // Suratni katta ko'rinishda ochish
  function openPhoto(url, caption) {
    openModal({ title: caption, wide: true, body: h('img', { class: 'photo-big', src: url, alt: caption }) });
  }

  function kv(k, v) {
    return h('div', { class: 'kv-row' }, h('span', { text: k }), v instanceof Node ? v : h('b', { text: v ?? '—' }));
  }

  // Surat qaysi holatda olingani: test boshida yoki aniq qoidabuzarlik paytida
  function snapReason(r) {
    const base = { start: 'test boshida', interval: 'davriy', violation: 'qoidabuzarlikdan qaytganda', return: 'qaytganda' }[r];
    return base || EVENTS[r] || r || '';
  }

  function shortUA(ua) {
    if (!ua) return '—';
    const os = /Android [\d.]+/.exec(ua)?.[0] || (/iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '');
    const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /YaBrowser/.test(ua) ? 'Yandex' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
    return [os, br].filter(Boolean).join(' · ') || ua.slice(0, 40);
  }

  // ─── PDF (report-pdf.js orqali) ────────────────────────────────────────────
  const REPORT_UI = { STATUS, RISK, EVENTS, shortUA, snapReason };

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  async function fetchSnapshot(id) {
    const res = await aapi('/api/admin/snapshots/' + id, { raw: true });
    return blobToDataUrl(await res.blob());
  }

  // Natijalar jadvali (reyting) yoki TOP-3
  async function downloadPdf(top3) {
    const btn = $(top3 ? 'btn-top3' : 'btn-pdf');
    btn.disabled = true;
    try {
      const rows = (top3 ? A.attempts : filteredAttempts()).filter(a => a.status !== 'active');
      if (!rows.length) return toast('PDF uchun natija yo\'q', 'warn');
      const classId = $('res-class').value;
      const title = top3 ? 'TOP-3 g\'oliblar' : (classId ? classId + ' natijalari' : 'Umumiy natijalar');
      await Report.table(rows, { ui: REPORT_UI, top3, title, name: `${classId || 'barcha'}_${top3 ? 'top3' : 'natijalar'}` });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  /**
   * O'quvchi varaqalari (full=false) yoki to'liq hisobot (full=true).
   * ids — bitta yoki bir nechta natija; bir nechta bo'lsa hammasi bitta PDF'da, boshida reyting.
   */
  async function downloadStudentPdf(ids, full, btn) {
    if (!ids.length) return toast('PDF uchun natija tanlanmagan', 'warn');
    const label = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Tayyorlanmoqda...'; }
    try {
      const list = await aapi('/api/admin/attempts/report', { method: 'POST', body: { ids } });
      const done = list.filter(a => a.status !== 'active');
      if (!done.length) return toast('Hali yakunlanmagan testlar uchun PDF tayyorlanmaydi', 'warn');
      const classId = $('res-class').value;
      const one = done.length === 1 ? done[0] : null;
      const name = one
        ? `${one.student_name}_${one.class_id}_${full ? 'hisobot' : 'natija'}`
        : `${classId || 'barcha'}_${full ? 'toliq_hisobot' : 'oquvchi_varaqalari'}`;
      await Report.students(done, {
        full,
        ui: REPORT_UI,
        fetchImage: fetchSnapshot,
        title: full ? 'To\'liq nazorat hisoboti' : 'Test natijalari',
        name,
        onProgress: (i, n) => { if (btn && n > 1) btn.textContent = `${i}/${n}...`; }
      });
      toast('PDF tayyor', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = label; }
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
      $('s-paper').checked = s.allow_paper;
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
      show_score_to_student: $('s-score').checked,
      allow_paper: $('s-paper').checked
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
    $('live-camera').addEventListener('change', onCameraSwitch);
    $('live-sound').checked = store.get('sp_sound') !== 'off';
    $('live-sound').addEventListener('change', () => {
      store.set('sp_sound', $('live-sound').checked ? 'on' : 'off');
      if ($('live-sound').checked) beep();
    });
    $('btn-sound-test').addEventListener('click', e => { e.preventDefault(); beep(); toast('Signal shunday eshitiladi', 'info', 2500); });
    document.addEventListener('pointerdown', unlockAudio);
    setInterval(pollAlerts, 5000);
    $('sel-all').addEventListener('change', onSelectAll);
    $('btn-bulk-del').addEventListener('click', onBulkDelete);
    $('btn-sheets').addEventListener('click', () => downloadStudentPdf(targetAttempts().map(a => a.id), false, $('btn-sheets')));
    $('btn-report').addEventListener('click', () => downloadStudentPdf(targetAttempts().map(a => a.id), true, $('btn-report')));
    $('live-paper').addEventListener('change', onPaperSwitch);
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
