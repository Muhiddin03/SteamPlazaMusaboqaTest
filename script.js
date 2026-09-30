'use strict';
// ─── O'QUVCHI SAHIFASI: test topshirish va nazorat ───────────────────────────
(() => {
  const TOKEN_KEY = 'sp_attempt';
  const INFO_KEY = 'sp_attempt_info';
  const HEARTBEAT_MS = 10000;
  const LIVE_FRAME_MS = 4000;
  const FOCUS_LOST_MS = 3000;

  const S = {
    settings: { question_time_sec: 45, max_violations: 3, camera_mode: 'required' },
    classId: null,
    token: null,
    info: null,
    state: null,
    questionId: null,
    selected: null,
    deadline: 0,
    limitMs: 1,
    submitting: false,
    active: false,
    fullscreen: false,
    stream: null,
    baseArea: 0,
    hiddenAt: 0,
    hiddenReported: false,
    blurAt: 0,
    blurTimer: null,
    focusLostReported: false,
    offlineAt: 0,
    timers: {}
  };

  // ─── EKRANLAR ──────────────────────────────────────────────────────────────
  function show(id) {
    for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
    window.scrollTo(0, 0);
  }

  // ─── SINFLAR ───────────────────────────────────────────────────────────────
  async function loadClasses() {
    show('scr-classes');
    const grid = clear($('class-grid'));
    grid.append(h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' }));
    try {
      const classes = await api('/api/classes');
      clear(grid);
      if (!classes.length) {
        grid.append(h('p', { class: 'empty', text: 'Hozircha sinflar qo\'shilmagan.' }));
        return;
      }
      for (const c of classes) {
        grid.append(h('button', { class: 'class-btn', type: 'button', onclick: () => openRegister(c.id) },
          icon('team-line'), h('span', { text: c.id })));
      }
    } catch (err) {
      clear(grid).append(h('div', { class: 'empty error' },
        h('p', { text: err.message }),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: loadClasses }, icon('refresh-line'), ' Qayta urinish')));
    }
  }

  async function loadSettings() {
    try { S.settings = await api('/api/settings'); } catch { /* standart qiymatlar qoladi */ }
  }

  // ─── RO'YXATDAN O'TISH ─────────────────────────────────────────────────────
  // 1-qadam: faqat ism familiya
  function openRegister(classId) {
    S.classId = classId;
    $('reg-class').textContent = classId;
    $('reg-error').textContent = '';
    show('scr-register');
    $('reg-name').focus();
  }

  function onContinue(e) {
    e.preventDefault();
    const name = $('reg-name').value.trim().replace(/\s+/g, ' ');
    if (name.length < 3 || !/\p{L}{2,}/u.test(name)) {
      $('reg-error').textContent = 'Ism familiyangizni to\'liq kiriting';
      $('reg-name').focus();
      return;
    }
    $('reg-error').textContent = '';
    S.pendingName = name;
    $('reg-name').blur(); // klaviatura yopilsin
    openRules();
  }

  // 2-qadam: taqiqlar haqida ogohlantirish oynasi
  function openRules() {
    const s = S.settings;
    const forbidden = [
      'Ilovadan, brauzerdan yoki test oynasidan chiqish',
      'Boshqa ilova, sayt yoki sun\'iy intellekt (ChatGPT, Google va h.k.) ochish',
      'Kitob, daftar, boshqa telefon yoki birovning yordamidan foydalanish',
      'Nusxalash, skrinshot olish, ekranni bo\'lish, boshqa varaq ochish'
    ];
    const info = [
      `Har bir savolga ${s.question_time_sec} soniya beriladi — vaqt tugasa savol javobsiz qoladi`,
      s.max_violations > 0 ? `${s.max_violations} marta qoidabuzarlik qilinsa, test avtomatik to'xtatiladi` : null,
      'Testni faqat bir marta topshirish mumkin. Barcha harakatlaringiz o\'qituvchiga ko\'rinadi'
    ].filter(Boolean);
    clear($('rules-list')).append(...forbidden.map(r => h('li', { text: r })));
    clear($('rules-info')).append(...info.map(r => h('li', { text: r })));
    const needCamera = s.camera_mode === 'required';
    clear($('btn-rules-ok')).append(needCamera ? 'Tushundim, roziman' : 'Roziman — testni boshlash');
    $('modal-rules').hidden = false;
  }

  function onRulesOk() {
    if (S.settings.camera_mode === 'required') {
      $('modal-rules').hidden = true;
      $('camera-error').textContent = '';
      $('modal-camera').hidden = false;
    } else {
      startAttempt($('btn-rules-ok'), $('reg-error'));
    }
  }

  // 3-qadam: kamera roziligi → test boshlanadi
  async function startAttempt(btn, errEl) {
    const needCamera = S.settings.camera_mode === 'required';
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Tayyorlanmoqda...';
    enterFullscreen(); // foydalanuvchi bosishi ichida chaqirilishi shart

    try {
      if (needCamera) await startCamera();
      const res = await api('/api/attempt/start', {
        method: 'POST',
        body: { class_id: S.classId, student_name: S.pendingName, camera: !!S.stream }
      });
      S.token = res.token;
      S.info = { name: S.pendingName, classId: S.classId };
      store.set(TOKEN_KEY, res.token);
      store.set(INFO_KEY, JSON.stringify(S.info));
      $('modal-rules').hidden = true;
      $('modal-camera').hidden = true;
      beginQuiz(res);
    } catch (e2) {
      errEl.textContent = e2.message || 'Xatolik yuz berdi';
      if (errEl === $('reg-error')) $('modal-rules').hidden = true;
      stopCamera();
      exitFullscreen();
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  // ─── TEST ──────────────────────────────────────────────────────────────────
  function beginQuiz(state) {
    S.active = true;
    S.baseArea = innerWidth * innerHeight;
    buildWatermark();
    show('scr-quiz');
    document.body.classList.add('quiz-active');
    clearInterval(S.timers.hb);
    clearInterval(S.timers.snap);
    S.timers.hb = setInterval(heartbeat, HEARTBEAT_MS);
    if (S.stream) {
      // Jonli kuzatuv kadri; server har 30 soniyada bittasini saqlaydi
      S.timers.snap = setInterval(() => snapshot('live'), LIVE_FRAME_MS);
      setTimeout(() => snapshot('start'), 1500);
    }
    render(state);
  }

  function render(state) {
    S.state = state;
    updateViolations(state);
    if (state.status !== 'active') return endQuiz(state);

    const q = state.question;
    $('q-num').textContent = q.number;
    $('q-total').textContent = state.total;
    S.limitMs = q.limit_ms;
    S.deadline = performance.now() + q.remaining_ms;

    if (q.id !== S.questionId) {
      S.questionId = q.id;
      S.selected = null;
      $('q-text').textContent = q.text;
      const box = clear($('q-options'));
      q.options.forEach((opt, i) => {
        const b = h('button', { class: 'option', type: 'button', role: 'radio', 'aria-checked': 'false',
          'aria-label': `${String.fromCharCode(65 + i)}) ${opt}`, onclick: () => choose(b, opt) },
        h('span', { class: 'option-letter', text: String.fromCharCode(65 + i) }),
        h('span', { class: 'option-text', text: opt }));
        box.append(b);
      });
      $('quiz-body').scrollTop = 0;
      $('quiz-body').classList.remove('leaving');
    }
    setBusy(false);
    clearInterval(S.timers.tick);
    S.timers.tick = setInterval(tick, 250);
    tick();
  }

  // Bitta bosishda javob yuboriladi
  function choose(btn, opt) {
    if (S.submitting) return;
    for (const b of $('q-options').children) {
      b.classList.toggle('selected', b === btn);
      b.setAttribute('aria-checked', String(b === btn));
    }
    S.selected = opt;
    btn.classList.add('sending');
    $('quiz-body').classList.add('leaving');
    submit(opt);
  }

  function tick() {
    const left = Math.max(0, S.deadline - performance.now());
    const sec = Math.ceil(left / 1000);
    $('q-time').textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    $('q-timebar').style.width = `${Math.min(100, (left / S.limitMs) * 100)}%`;
    $('q-timer').classList.toggle('low', sec <= 10);
    $('q-timebar').classList.toggle('low', sec <= 10);
    if (left <= 0 && !S.submitting) submit(S.selected);
  }

  function setBusy(busy) {
    S.submitting = busy;
    for (const b of $('q-options').children) b.disabled = busy;
    if (!busy) {
      $('quiz-body').classList.remove('leaving');
      for (const b of $('q-options').children) b.classList.remove('sending');
    }
  }

  async function submit(answer) {
    if (S.submitting || !S.active) return;
    setBusy(true);
    clearInterval(S.timers.tick);
    const body = { question_id: S.questionId, answer };
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const state = await api('/api/attempt/answer', { method: 'POST', attempt: S.token, body });
        render(state);
        return;
      } catch (err) {
        if (err.status === 0) {
          toast('Aloqa yo\'q. Qayta yuborilmoqda...', 'warn', 1500);
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }
        if (err.status === 404 || err.status === 401) return sessionLost();
        toast(err.message, 'error');
        break;
      }
    }
    await resync();
  }

  async function resync() {
    try {
      render(await api('/api/attempt/state', { attempt: S.token }));
    } catch (err) {
      if (err.status === 404 || err.status === 401) return sessionLost();
      setBusy(false);
      S.timers.tick = setInterval(tick, 250);
    }
  }

  async function heartbeat() {
    if (!S.active) return;
    try {
      const r = await api('/api/attempt/heartbeat', { method: 'POST', attempt: S.token });
      applyEventResult(r);
    } catch (err) {
      if (err.status === 404 || err.status === 401) sessionLost();
    }
  }

  function updateViolations(r) {
    if (typeof r.violations !== 'number') return;
    $('q-viol-n').textContent = r.max_violations > 0 ? `${r.violations}/${r.max_violations}` : r.violations;
    $('q-viol').classList.toggle('bad', r.violations > 0);
  }

  function applyEventResult(r) {
    if (!r) return;
    updateViolations(r);
    if (r.status && r.status !== 'active' && S.active) resync();
  }

  function endQuiz(state) {
    S.active = false;
    for (const t of Object.values(S.timers)) { clearInterval(t); clearTimeout(t); }
    document.body.classList.remove('quiz-active');
    $('watermark').hidden = true;
    $('overlay-warning').hidden = true;
    stopCamera();
    exitFullscreen();
    store.del(TOKEN_KEY);
    store.del(INFO_KEY);
    showResult(state);
  }

  function sessionLost() {
    S.active = false;
    store.del(TOKEN_KEY);
    store.del(INFO_KEY);
    toast('Test sessiyasi topilmadi', 'error');
    endQuiz({ status: 'lost' });
  }

  function showResult(st) {
    const card = clear($('result-card'));
    const total = st.total || 0;
    if (st.status === 'finished') {
      card.append(h('div', { class: 'result-icon ok' }, icon('checkbox-circle-fill')), h('h2', { text: 'Test yakunlandi!' }));
      if (typeof st.score === 'number') {
        const pct = total ? Math.round((st.score / total) * 100) : 0;
        card.append(
          h('div', { class: 'score-big' }, h('b', { text: st.score }), h('span', { text: ` / ${total}` })),
          h('div', { class: 'progress' }, h('div', { style: `width:${pct}%` })),
          h('div', { class: 'result-stats' },
            h('div', {}, h('span', { text: 'To\'g\'ri' }), h('b', { class: 'good', text: st.score })),
            h('div', {}, h('span', { text: 'Xato' }), h('b', { class: 'bad', text: total - st.score })),
            h('div', {}, h('span', { text: 'Foiz' }), h('b', { text: pct + '%' }))));
      } else {
        card.append(h('p', { text: 'Natijangiz o\'qituvchiga yuborildi.' }));
      }
    } else if (st.status === 'terminated') {
      card.append(h('div', { class: 'result-icon bad' }, icon('close-circle-fill')),
        h('h2', { text: 'Test to\'xtatildi' }),
        h('p', { text: 'Qoidabuzarliklar soni limitdan oshdi yoki o\'qituvchi testni to\'xtatdi. Natijangiz o\'qituvchiga yuborildi.' }));
      if (typeof st.score === 'number') card.append(h('p', { class: 'muted', text: `To'g'ri javoblar: ${st.score} / ${total}` }));
    } else if (st.status === 'abandoned') {
      card.append(h('div', { class: 'result-icon warn' }, icon('time-line')),
        h('h2', { text: 'Test yakunlangan' }),
        h('p', { text: 'Uzoq vaqt aloqa bo\'lmagani uchun test yopildi. O\'qituvchingizga murojaat qiling.' }));
    } else {
      card.append(h('div', { class: 'result-icon warn' }, icon('question-line')),
        h('h2', { text: 'Test sessiyasi topilmadi' }),
        h('p', { text: 'O\'qituvchingizga murojaat qiling.' }));
    }
    if (st.violations > 0) {
      card.append(h('p', { class: 'chip chip-warn', text: `Qoidabuzarliklar: ${st.violations}` }));
    }
    card.append(h('button', { class: 'btn btn-primary btn-block btn-lg', type: 'button',
      onclick: () => { location.href = './'; } }, icon('home-4-line'), ' Bosh sahifa'));
    show('scr-result');
  }

  function buildWatermark() {
    const wm = clear($('watermark'));
    const label = `${S.info?.name || ''} • ${S.info?.classId || ''}`;
    for (let i = 0; i < 40; i++) wm.append(h('span', { text: label }));
    wm.hidden = false;
  }

  // ─── NAZORAT (PROCTORING) ──────────────────────────────────────────────────
  async function report(type, detail = '', keepalive = false) {
    if (!S.token || !S.active) return false;
    try {
      const r = await api('/api/attempt/event', { method: 'POST', attempt: S.token, body: { type, detail }, keepalive });
      applyEventResult(r);
      return true;
    } catch {
      return false;
    }
  }

  function showWarning(text) {
    if (!S.active) return;
    const st = S.state || {};
    $('warn-text').textContent = text + ' Bu harakat o\'qituvchiga yuborildi.';
    const v = Number($('q-viol-n').textContent.split('/')[0]) || st.violations || 0;
    $('warn-count').textContent = st.max_violations > 0
      ? `Qoidabuzarliklar: ${v} / ${st.max_violations}. Limitga yetganda test to'xtatiladi.`
      : `Qoidabuzarliklar: ${v}`;
    $('overlay-warning').hidden = false;
    snapshot('violation');
  }

  function onVisibility() {
    if (!S.active) return;
    if (document.hidden) {
      S.hiddenAt = Date.now();
      S.hiddenReported = false;
      report('tab_hidden', 'Boshqa ilova/oynaga o\'tdi', true).then(ok => { if (ok) S.hiddenReported = true; });
    } else {
      const secs = S.hiddenAt ? Math.round((Date.now() - S.hiddenAt) / 1000) : 0;
      if (!S.hiddenReported) report('tab_hidden', `${secs} soniya test tashqarisida bo'ldi`);
      else report('tab_return', `${secs} soniyadan keyin qaytdi`);
      S.hiddenAt = 0;
      showWarning(`Siz test oynasidan chiqdingiz (${secs} soniya).`);
      heartbeat();
    }
  }

  function onBlur() {
    if (!S.active) return;
    S.blurAt = Date.now();
    S.focusLostReported = false;
    clearTimeout(S.blurTimer);
    S.blurTimer = setTimeout(() => {
      if (S.active && !document.hidden && !document.hasFocus()) {
        S.focusLostReported = true;
        report('focus_lost', 'Ekran ustida boshqa oyna/ilova ochildi');
      }
    }, FOCUS_LOST_MS);
  }

  function onFocus() {
    clearTimeout(S.blurTimer);
    if (!S.active || !S.blurAt) return;
    const ms = Date.now() - S.blurAt;
    S.blurAt = 0;
    if (document.hidden) return;
    if (S.focusLostReported) showWarning(`Test oynasi ${Math.round(ms / 1000)} soniya fokusdan chiqdi.`);
    else if (ms > 300) report('window_blur', `${(ms / 1000).toFixed(1)} soniya`);
  }

  function onFullscreenChange() {
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (fsEl) { S.fullscreen = true; return; }
    if (!S.active || !S.fullscreen || document.hidden) return;
    S.fullscreen = false;
    report('fullscreen_exit', 'To\'liq ekran rejimidan chiqdi');
    showWarning('To\'liq ekran rejimidan chiqdingiz.');
  }

  function onResize() {
    if (!S.active) return;
    clearTimeout(S.timers.resize);
    S.timers.resize = setTimeout(() => {
      const area = innerWidth * innerHeight;
      if (area > S.baseArea) { S.baseArea = area; return; }
      if (!document.hidden && area < S.baseArea * 0.6) {
        S.baseArea = area;
        report('split_screen', `Oyna o'lchami: ${innerWidth}×${innerHeight}`);
        showWarning('Ekran bo\'lindi yoki oyna kichraytirildi.');
      }
    }, 700);
  }

  function blockEvent(type, detail, message) {
    return e => {
      if (!S.active) return;
      e.preventDefault();
      if (type) report(type, detail);
      if (message) toast(message, 'warn', 2000);
    };
  }

  function onKeyDown(e) {
    if (!S.active) return;
    const k = (e.key || '').toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'F12' || (mod && e.shiftKey && ['i', 'j', 'c'].includes(k))) {
      e.preventDefault();
      report('devtools', 'Dasturchi vositalarini ochishga urinish');
      return;
    }
    if (mod && ['c', 'x', 'v', 'a', 'p', 's', 'u', 'f', 'g'].includes(k)) {
      e.preventDefault();
      report('key_blocked', `Ctrl+${k.toUpperCase()}`);
      toast('Bu amal taqiqlangan', 'warn', 1500);
    }
  }

  function onKeyUp(e) {
    if (S.active && e.key === 'PrintScreen') {
      report('screenshot', 'PrintScreen tugmasi');
      toast('Skrinshot olish taqiqlangan', 'warn', 2000);
    }
  }

  function onBeforeUnload(e) {
    if (!S.active) return;
    e.preventDefault();
    e.returnValue = '';
  }

  function onOffline() {
    if (S.active) S.offlineAt = Date.now();
  }

  function onOnline() {
    if (!S.active || !S.offlineAt) return;
    const secs = Math.round((Date.now() - S.offlineAt) / 1000);
    S.offlineAt = 0;
    report('offline', `${secs} soniya internet o'chiq bo'ldi`);
    heartbeat();
  }

  function onChannelMessage(e) {
    if (e.data === 'ping' && S.active) {
      spChannel.postMessage('busy');
      report('multi_tab', 'Saytning boshqa varag\'i ochildi');
      showWarning('Saytning boshqa varag\'i ochildi.');
    }
  }

  // Boshqa varaqda test ketayotganini tekshirish
  function otherTabBusy(waitMs = 400) {
    if (!spChannel) return Promise.resolve(false);
    return new Promise(resolve => {
      const onMsg = e => { if (e.data === 'busy') { spChannel.removeEventListener('message', onMsg); resolve(true); } };
      spChannel.addEventListener('message', onMsg);
      spChannel.postMessage('ping');
      setTimeout(() => { spChannel.removeEventListener('message', onMsg); resolve(false); }, waitMs);
    });
  }

  // ─── TO'LIQ EKRAN ──────────────────────────────────────────────────────────
  function enterFullscreen() {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return;
    try {
      const p = req.call(el, { navigationUI: 'hide' });
      if (p && p.catch) p.catch(() => {});
    } catch { /* iPhone Safari to'liq ekranni qo'llamaydi */ }
  }

  function exitFullscreen() {
    S.fullscreen = false;
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (!fsEl) return;
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    try {
      const p = exit.call(document);
      if (p && p.catch) p.catch(() => {});
    } catch { /* ignore */ }
  }

  // ─── KAMERA ────────────────────────────────────────────────────────────────
  async function startCamera() {
    if (S.stream) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Brauzeringiz kamerani qo\'llab-quvvatlamaydi. Chrome yoki Safari\'dan foydalaning.');
    }
    try {
      S.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
        audio: false
      });
    } catch {
      throw new Error('Kameraga ruxsat berilmadi. Brauzer sozlamalaridan kameraga ruxsat bering.');
    }
    const v = $('cam-preview');
    v.srcObject = S.stream;
    v.hidden = false;
    await v.play().catch(() => {});
    const track = S.stream.getVideoTracks()[0];
    if (track) {
      track.addEventListener('ended', () => {
        if (!S.active) return;
        report('camera_off', 'Kamera o\'chirildi');
        showWarning('Kamera o\'chirildi.');
      });
    }
  }

  function stopCamera() {
    if (S.stream) S.stream.getTracks().forEach(t => t.stop());
    S.stream = null;
    const v = $('cam-preview');
    v.srcObject = null;
    v.hidden = true;
  }

  function snapshot(reason) {
    if (!S.stream || !S.active) return;
    const v = $('cam-preview');
    if (!v.videoWidth) return;
    const w = 320;
    const hgt = Math.round((v.videoHeight * w) / v.videoWidth);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = hgt;
    c.getContext('2d').drawImage(v, 0, 0, w, hgt);
    const image = c.toDataURL('image/jpeg', 0.6);
    api('/api/attempt/snapshot', { method: 'POST', attempt: S.token, body: { image, reason } }).catch(() => {});
  }

  // ─── DAVOM ETTIRISH (sahifa qayta ochilganda) ─────────────────────────────
  async function onResume() {
    const btn = $('btn-resume');
    btn.disabled = true;
    enterFullscreen();
    try {
      if (S.settings.camera_mode === 'required') {
        try {
          await startCamera();
        } catch (err) {
          await api('/api/attempt/event', { method: 'POST', attempt: S.token, body: { type: 'camera_denied', detail: err.message } })
            .catch(() => {});
          toast(err.message, 'error', 5000);
        }
      }
      const state = await api('/api/attempt/state', { attempt: S.token });
      $('overlay-resume').hidden = true;
      if (state.status === 'active') beginQuiz(state);
      else endQuiz(state);
    } catch (err) {
      if (err.status === 404 || err.status === 401) {
        $('overlay-resume').hidden = true;
        return sessionLost();
      }
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  // ─── ISHGA TUSHIRISH ───────────────────────────────────────────────────────
  function bindEvents() {
    $('reg-form').addEventListener('submit', onContinue);
    $('btn-back').addEventListener('click', () => show('scr-classes'));
    $('btn-rules-ok').addEventListener('click', onRulesOk);
    $('btn-rules-back').addEventListener('click', () => { $('modal-rules').hidden = true; });
    $('btn-camera-ok').addEventListener('click', () => startAttempt($('btn-camera-ok'), $('camera-error')));
    $('btn-camera-back').addEventListener('click', () => { $('modal-camera').hidden = true; });
    $('btn-warn-ok').addEventListener('click', () => {
      $('overlay-warning').hidden = true;
      if (S.active) enterFullscreen();
    });
    $('btn-resume').addEventListener('click', onResume);

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    window.addEventListener('resize', onResize);
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('copy', blockEvent('copy', 'Nusxalashga urinish', 'Nusxalash taqiqlangan'));
    document.addEventListener('cut', blockEvent('copy', 'Kesib olishga urinish', 'Nusxalash taqiqlangan'));
    document.addEventListener('paste', blockEvent('paste', 'Joylashtirishga urinish', 'Joylashtirish taqiqlangan'));
    document.addEventListener('contextmenu', blockEvent());
    document.addEventListener('selectstart', blockEvent());
    document.addEventListener('dragstart', blockEvent());
    if (spChannel) spChannel.addEventListener('message', onChannelMessage);
  }

  async function init() {
    bindEvents();
    const settingsReady = loadSettings();
    const token = store.get(TOKEN_KEY);
    if (!token) {
      await settingsReady;
      return loadClasses();
    }

    if (await otherTabBusy()) {
      $('overlay-busy').hidden = false;
      return;
    }
    S.token = token;
    try { S.info = JSON.parse(store.get(INFO_KEY) || 'null'); } catch { S.info = null; }
    try {
      await settingsReady;
      const state = await api('/api/attempt/state?resume=1', { attempt: token });
      if (state.status === 'active') {
        S.state = state;
        $('overlay-resume').hidden = false;
      } else {
        store.del(TOKEN_KEY);
        store.del(INFO_KEY);
        showResult(state);
      }
    } catch (err) {
      if (err.status === 404 || err.status === 401) {
        store.del(TOKEN_KEY);
        store.del(INFO_KEY);
        return loadClasses();
      }
      toast(err.message, 'error', 6000);
      $('overlay-resume').hidden = false;
    }
  }

  init();
})();
