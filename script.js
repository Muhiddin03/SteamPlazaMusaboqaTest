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
    face: null,
    faceSince: {},
    faceReported: {},
    faceLast: {},
    timers: {}
  };

  // Kamera orqali aniqlanadigan holatlar. O'quvchi ekranida ogohlantirish chiqqan zahoti
  // o'qituvchiga ham shu paytdagi surat bilan yuboriladi (har safar — necha marta bo'lgani ko'rinadi).
  //   warn   — ogohlantirish turi va vaqti (ms)
  //   viol   — shuncha davom etsa qoidabuzarlik (sanaladi)
  // Vaqtlar: 1–2 s chetga qarash tabiiy (o'ylash) — hisoblanmaydi; 4 s — ataylab, ogohlantirish;
  // 10–12 s — kitob/telefondan javob o'qishga yetadi, qoidabuzarlik.
  const FACE_RULES = [
    { key: 'face_missing', warn: 'face_away', warnAt: 4000, viol: 'face_missing', violAt: 12000,
      text: 'Yuzingiz kamerada ko\'rinmayapti! Kameraga qarang.' },
    { key: 'multiple_faces', warn: 'multiple_faces_short', warnAt: 2000, viol: 'multiple_faces', violAt: 5000,
      text: 'Kamerada boshqa odam bor! Yolg\'iz ishlang.' },
    { key: 'head_turned', warn: 'head_turned', warnAt: 4000, viol: 'head_turned_long', violAt: 10000,
      text: 'Boshingizni burmang — ekranga qarang!' },
    { key: 'looking_down', warn: 'looking_down', warnAt: 4000, viol: 'looking_down_long', violAt: 10000,
      text: 'Pastga qaramang — ekranga qarang!' },
    { key: 'motion', warn: 'motion', warnAt: 4000,
      text: 'Ortiqcha harakat qilmang!' }
  ];
  // Aniqlash shovqini: holat shuncha uzilmasa — o'sha bitta holat hisoblanadi (qayta sanalmaydi)
  const FACE_GAP_MS = 1000;

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
        const subjects = c.subjects || [];
        grid.append(h('button', { class: 'class-btn', type: 'button', onclick: () => openClass(c) },
          icon('team-line'), h('span', { text: c.id }),
          subjects.some(s => s.subject) ? h('small', { class: 'class-subjects', text: subjects.map(s => s.subject || 'Umumiy').join(', ') }) : null));
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

  // ─── FAN TANLASH ───────────────────────────────────────────────────────────
  // Sinfda bitta fan bo'lsa — to'g'ridan-to'g'ri ism kiritishga, bir nechta bo'lsa — fanni tanlash
  function openClass(c) {
    const subjects = c.subjects || [];
    if (subjects.length <= 1) return openRegister(c.id, subjects[0] ? subjects[0].subject : '');
    $('subj-class').textContent = c.id;
    const grid = clear($('subject-grid'));
    for (const s of subjects) {
      grid.append(h('button', { class: 'class-btn subject-btn', type: 'button', onclick: () => openRegister(c.id, s.subject) },
        icon(subjectIcon(s.subject)), h('span', { text: s.subject || 'Umumiy test' }),
        h('small', { class: 'class-subjects', text: `${s.count} ta savol` })));
    }
    show('scr-subjects');
  }

  function subjectIcon(name) {
    const n = (name || '').toLowerCase();
    if (/fizik/.test(n)) return 'flask-line';
    if (/matem|algebra|geometr/.test(n)) return 'calculator-line';
    if (/kimyo/.test(n)) return 'test-tube-line';
    if (/biolog/.test(n)) return 'leaf-line';
    if (/informat|dastur|scratch|html/.test(n)) return 'code-s-slash-line';
    if (/ingliz|english|til|adabiyot/.test(n)) return 'translate-2';
    if (/tarix|geograf/.test(n)) return 'earth-line';
    return 'book-2-line';
  }

  // ─── RO'YXATDAN O'TISH ─────────────────────────────────────────────────────
  // 1-qadam: faqat ism familiya
  function openRegister(classId, subject = '') {
    S.classId = classId;
    S.subject = subject;
    $('reg-class').textContent = subject ? `${classId} · ${subject}` : classId;
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

  // 2-qadam: qisqa qoidalar + kamera roziligi bitta oynada
  async function openRules() {
    await loadSettings(); // admin hozirgina o'zgartirgan vaqt/kamera sozlamasi ko'rinsin
    const s = S.settings;
    $('rules-time').textContent = `⏱ Har bir savolga ${s.question_time_sec} soniya`;
    const forbidden = [
      'Testdan yoki ilovadan chiqish',
      'Boshqa sayt, ChatGPT, telefon, kitob',
      'Yoningizda boshqa odam bo\'lishi',
      'Nusxalash va skrinshot'
    ];
    $('paper-note').hidden = !s.allow_paper;
    const info = [
      'Misol ishlash uchun ekranda ✏️ qoralama bor',
      s.max_violations > 0 ? `${s.max_violations} ta qoidabuzarlikda test avtomatik to'xtaydi` : null,
      'Test faqat bir marta topshiriladi'
    ].filter(Boolean);
    clear($('rules-list')).append(...forbidden.map(r => h('li', { text: r })));
    clear($('rules-info')).append(...info.map(r => h('li', { text: r })));
    const needCamera = s.camera_mode === 'required';
    $('camera-note').hidden = !needCamera;
    $('rules-error').textContent = '';
    clear($('btn-rules-ok')).append(icon(needCamera ? 'camera-line' : 'play-fill'), ' Roziman — testni boshlash');
    showCameraHelp(null);
    $('modal-rules').hidden = false;
    if (needCamera) {
      preloadFace();
      checkCameraPermission();
    }
  }

  // Kamera ruxsati yo'q bo'lsa — qanday ruxsat berish ko'rsatmasi (brauzer so'rov oynasini
  // bir marta rad etilgandan keyin qayta chiqarmaydi, ruxsatni faqat foydalanuvchi o'zi qaytaradi)
  function showCameraHelp(code) {
    const box = $('camera-help');
    box.hidden = !code;
    if (code) clear($('btn-rules-ok')).append(icon('refresh-line'), ' Qayta urinish');
    if (!code) return;
    const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    const steps = {
      denied: mobile
        ? ['Brauzer menyusini oching (⋮) → Sozlamalar → Sayt sozlamalari → Kamera',
          'Ushbu sayt uchun "Ruxsat berish" ni tanlang',
          'Pastdagi "Qayta urinish" tugmasini bosing']
        : ['Manzil satrining chap tomonidagi 🔒 (yoki o\'ng tomondagi 📷 ✕) belgisini bosing',
          '"Kamera" yonidagi tugmani "Ruxsat berish" (Allow) holatiga o\'tkazing',
          'Pastdagi "Qayta urinish" tugmasini bosing (kerak bo\'lsa sahifani yangilang)'],
      busy: ['Kamerani ishlatayotgan dasturlarni (Zoom, Telegram, Skype, Kamera) yoping', '"Qayta urinish" tugmasini bosing'],
      nocamera: ['Kompyuterga kamera (veb-kamera) ulang yoki testni telefondan topshiring', '"Qayta urinish" tugmasini bosing'],
      other: ['Sahifani yangilang yoki boshqa brauzerda (Chrome) oching', '"Qayta urinish" tugmasini bosing']
    }[code] || [];
    clear($('camera-help-steps')).append(...steps.map(s => h('li', { text: s })));
  }

  // Oyna ochilganda ruxsat oldindan rad etilganini bilsak — ko'rsatmani darhol chiqaramiz
  async function checkCameraPermission() {
    try {
      const st = await navigator.permissions.query({ name: 'camera' });
      if (st.state === 'denied') {
        $('rules-error').textContent = 'Bu saytga kameradan foydalanish taqiqlangan. Avval ruxsat bering.';
        showCameraHelp('denied');
      }
      st.onchange = () => { if (st.state !== 'denied') { showCameraHelp(null); $('rules-error').textContent = ''; } };
    } catch { /* Safari/Firefox bu so'rovni qo'llamasligi mumkin */ }
  }

  function preloadFace() {
    import('./face-monitor.js').then(m => m.preloadFaceModel()).catch(() => { /* testda qayta urinadi */ });
  }

  function onRulesOk() {
    startAttempt($('btn-rules-ok'), $('rules-error'));
  }

  // 3-qadam: rozilik → kamera yoqiladi → test boshlanadi
  async function startAttempt(btn, errEl) {
    const needCamera = S.settings.camera_mode === 'required';
    const label = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = needCamera ? 'Kamera yoqilmoqda...' : 'Tayyorlanmoqda...';
    enterFullscreen(); // foydalanuvchi bosishi ichida chaqirilishi shart

    try {
      if (needCamera) await startCamera();
      const res = await api('/api/attempt/start', {
        method: 'POST',
        body: { class_id: S.classId, subject: S.subject || '', student_name: S.pendingName, camera: !!S.stream }
      });
      S.token = res.token;
      S.info = { name: S.pendingName, classId: S.subject ? `${S.classId} · ${S.subject}` : S.classId };
      store.set(TOKEN_KEY, res.token);
      store.set(INFO_KEY, JSON.stringify(S.info));
      $('modal-rules').hidden = true;
      beginQuiz(res);
    } catch (e2) {
      errEl.textContent = e2.message || 'Xatolik yuz berdi';
      showCameraHelp(e2.code);
      stopCamera();
      exitFullscreen();
    } finally {
      btn.disabled = false;
      if ($('camera-help').hidden) btn.innerHTML = label;
      else clear(btn).append(icon('refresh-line'), ' Qayta urinish');
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
      // Jonli kuzatuv kadri; admin kuzatayotgan bo'lsa server tezroq so'raydi
      setTimeout(() => snapshot('start'), 1500);
      scheduleFrame(2500);
      startFaceMonitor();
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
      S.questionType = q.type || 'choice';
      $('q-text').textContent = q.text;
      showQuestionImage(q.image_id);
      const open = S.questionType === 'open';
      $('q-open').hidden = !open;
      $('q-options').hidden = open;
      $('q-open-input').value = '';
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
      clearDraft(); // har savol uchun toza qoralama
    }
    setBusy(false);
    clearInterval(S.timers.tick);
    S.timers.tick = setInterval(tick, 250);
    tick();
  }

  // Savol rasmi — blob orqali (CSP img-src faqat o'z sayti); bir xil rasm qayta yuklanmaydi
  const imageCache = new Map();
  function showQuestionImage(imageId) {
    const wrap = $('q-image');
    const img = $('q-image-img');
    if (!imageId) { wrap.hidden = true; img.removeAttribute('src'); return; }
    wrap.hidden = false;
    wrap.classList.add('loading');
    const done = url => { img.src = url; wrap.classList.remove('loading'); };
    if (imageCache.has(imageId)) return done(imageCache.get(imageId));
    api('/api/test-images/' + imageId, { raw: true })
      .then(r => r.blob())
      .then(b => { const u = URL.createObjectURL(b); imageCache.set(imageId, u); if (S.state?.question?.image_id === imageId) done(u); })
      .catch(() => { wrap.classList.remove('loading'); img.alt = 'Rasm yuklanmadi — sahifani yangilang'; });
  }

  // Yozma javob
  function onOpenSubmit(e) {
    e.preventDefault();
    if (S.submitting) return;
    const value = $('q-open-input').value.trim();
    if (!value) {
      $('q-open-input').focus();
      return toast('Javobni yozing', 'warn', 1500);
    }
    S.selected = value;
    $('q-open-input').blur();
    $('quiz-body').classList.add('leaving');
    submit(value);
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
    if (left <= 0 && !S.submitting) {
      // Vaqt tugadi: yozma savolda yozib ulgurgan narsasi yuboriladi
      const typed = S.questionType === 'open' ? $('q-open-input').value.trim() : '';
      submit(typed || S.selected);
    }
  }

  function setBusy(busy) {
    S.submitting = busy;
    for (const b of $('q-options').children) b.disabled = busy;
    $('q-open-input').disabled = busy;
    $('q-open-send').disabled = busy;
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
  // Hodisa o'qituvchiga yuboriladi. Kamera yoqilgan bo'lsa — aynan shu paytdagi kadr ham (dalil sifatida).
  async function report(type, detail = '', keepalive = false) {
    if (!S.token || !S.active) return false;
    const body = { type, detail };
    // Ilovadan chiqish paytida kadr eskirgan/qora bo'ladi — yubormaymiz; keepalive so'rovi ham kichik bo'lishi kerak
    if (!keepalive && type !== 'tab_hidden' && type !== 'ai_unavailable') {
      const image = captureFrame(false);
      if (image) body.image = image;
    }
    try {
      const r = await api('/api/attempt/event', { method: 'POST', attempt: S.token, body, keepalive });
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
    // Yozma javob paytida telefon klaviaturasi ochilib ekran kichrayadi — bu ekranni bo'lish emas
    if (!S.active || S.typing) return;
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
    const fail = (code, message) => Object.assign(new Error(message), { code });
    try {
      try {
        S.stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
          audio: false
        });
      } catch (err) {
        // Ba'zi kompyuter kameralari o'lcham talablarini qo'llamaydi — oddiy so'rov bilan qayta urinamiz
        if (err.name !== 'OverconstrainedError') throw err;
        S.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
        throw fail('denied', 'Brauzer kameraga ruxsat bermadi. Pastdagi ko\'rsatma bo\'yicha ruxsat bering.');
      }
      if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') {
        throw fail('nocamera', 'Kamera topilmadi. Kompyuterga kamera ulang yoki testni telefondan topshiring.');
      }
      if (err.name === 'NotReadableError' || err.name === 'AbortError') {
        throw fail('busy', 'Kamera boshqa dasturda band (Zoom, Telegram, Kamera ilovasi...). Ularni yopib, qayta urining.');
      }
      throw fail('other', 'Kamerani yoqib bo\'lmadi: ' + (err.message || err.name));
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
    if (S.face) { S.face.stop(); S.face = null; }
    $('face-banner').hidden = true;
    if (S.stream) S.stream.getTracks().forEach(t => t.stop());
    S.stream = null;
    const v = $('cam-preview');
    v.srcObject = null;
    v.hidden = true;
  }

  // Kameradan hozirgi kadrni oladi (JPEG data URL)
  function captureFrame(live) {
    const v = $('cam-preview');
    if (!S.stream || !v.videoWidth) return null;
    const w = live ? 240 : 320;
    const hgt = Math.round((v.videoHeight * w) / v.videoWidth);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = hgt;
    c.getContext('2d').drawImage(v, 0, 0, w, hgt);
    return c.toDataURL('image/jpeg', live ? 0.5 : 0.65);
  }

  async function sendFrame(image, reason) {
    if (!image || !S.active) return null;
    try {
      return await api('/api/attempt/snapshot', { method: 'POST', attempt: S.token, body: { image, reason } });
    } catch {
      return null;
    }
  }

  // reason: 'live' — jonli kuzatuv (bazaga yozilmaydi), boshqasi — dalil sifatida saqlanadi.
  // Server keyingi jonli kadr qachon kerakligini aytadi (admin kuzatsa — har soniyada)
  function snapshot(reason) {
    return sendFrame(captureFrame(reason === 'live'), reason);
  }

  function scheduleFrame(ms) {
    clearTimeout(S.timers.frame);
    S.timers.frame = setTimeout(async () => {
      if (!S.active || !S.stream) return;
      const r = await snapshot('live');
      if (S.active) scheduleFrame(r && r.next_ms ? r.next_ms : LIVE_FRAME_MS);
    }, ms);
  }

  // ─── YUZ KUZATUVI ──────────────────────────────────────────────────────────
  async function startFaceMonitor() {
    if (S.face || !S.stream) return;
    try {
      const { startFaceMonitor: start } = await import('./face-monitor.js');
      if (!S.active || !S.stream) return;
      S.face = await start($('cam-preview'), onFaceSample);
    } catch (err) {
      console.warn('Yuz kuzatuvi yuklanmadi:', err);
      report('ai_unavailable', 'Yuzni aniqlash moduli yuklanmadi');
    }
  }

  // ─── QORALAMA (ekranda barmoq bilan misol ishlash) ─────────────────────────
  const draft = { ctx: null, drawing: false, last: null };

  function openDraft() {
    const panel = $('draft');
    panel.hidden = false;
    const c = $('draft-canvas');
    const rect = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * dpr);
    const hgt = Math.round(rect.height * dpr);
    if (c.width !== w || c.height !== hgt) {
      // O'lcham o'zgarsa chizilgan narsa saqlanib qoladi
      const old = c.width && c.height ? c.toDataURL() : null;
      c.width = w;
      c.height = hgt;
      draft.ctx = c.getContext('2d');
      draft.ctx.scale(dpr, dpr);
      draft.ctx.lineCap = 'round';
      draft.ctx.lineJoin = 'round';
      draft.ctx.lineWidth = 2.5;
      draft.ctx.strokeStyle = '#0f172a';
      if (old) {
        const img = new Image();
        img.onload = () => draft.ctx.drawImage(img, 0, 0, rect.width, rect.height);
        img.src = old;
      }
    }
  }

  function clearDraft() {
    const c = $('draft-canvas');
    if (draft.ctx) draft.ctx.clearRect(0, 0, c.width, c.height);
  }

  function draftPoint(e) {
    const r = $('draft-canvas').getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function bindDraft() {
    const c = $('draft-canvas');
    c.addEventListener('pointerdown', e => {
      if (!draft.ctx) return;
      e.preventDefault();
      c.setPointerCapture(e.pointerId);
      draft.drawing = true;
      draft.last = draftPoint(e);
      draft.ctx.beginPath();
      draft.ctx.arc(draft.last.x, draft.last.y, 1.2, 0, Math.PI * 2);
      draft.ctx.fillStyle = '#0f172a';
      draft.ctx.fill();
    });
    c.addEventListener('pointermove', e => {
      if (!draft.drawing) return;
      e.preventDefault();
      const p = draftPoint(e);
      draft.ctx.beginPath();
      draft.ctx.moveTo(draft.last.x, draft.last.y);
      draft.ctx.lineTo(p.x, p.y);
      draft.ctx.stroke();
      draft.last = p;
    });
    const end = () => { draft.drawing = false; };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    $('btn-draft').addEventListener('click', () => ($('draft').hidden ? openDraft() : ($('draft').hidden = true)));
    $('draft-close').addEventListener('click', () => { $('draft').hidden = true; });
    $('draft-clear').addEventListener('click', clearDraft);
  }

  // Qoralama ochiq bo'lsa — o'quvchi ekranning pastiga yozmoqda: bosh holati tekshirilmaydi.
  // Qog'ozda ishlashga ruxsat bo'lsa — pastga qarash va harakat kechiriladi, faqat kuchli burilish hisoblanadi.
  function faceRules() {
    const posture = ['head_turned', 'looking_down', 'motion'];
    // Qoralama ochiq yoki javob yozayotgan bo'lsa — ekranning pastiga qaraydi, bosh holati tekshirilmaydi
    if (!$('draft').hidden || S.typing) return FACE_RULES.filter(r => !posture.includes(r.key));
    if (!S.settings.allow_paper) return FACE_RULES;
    return FACE_RULES
      .filter(r => r.key !== 'looking_down' && r.key !== 'motion')
      .map(r => {
        // Qog'ozga egilganda yuz ko'rinmay qolishi tabiiy — kechroq hisoblanadi
        if (r.key === 'face_missing') return { ...r, warnAt: 6000, violAt: 20000 };
        if (r.key === 'head_turned') return { ...r, violAt: 15000, strong: true };
        return r;
      });
  }

  function onFaceSample(s) {
    if (!S.active) return;
    const now = Date.now();
    const rules = faceRules();
    const strong = rules.some(r => r.strong);
    const active = {
      face_missing: s.faces === 0,
      multiple_faces: s.faces >= 2,
      head_turned: s.faces === 1 && (strong ? s.strongTurn : s.turned),
      looking_down: s.faces === 1 && s.down,
      motion: s.motion
    };
    const enabled = new Set(rules.map(r => r.key));
    let banner = null;

    for (const key of Object.keys(active)) {
      if (active[key] && enabled.has(key)) {
        S.faceLast[key] = now;
        continue;
      }
      // Holat tugadi (qisqa uzilishlar hisobga olinmaydi) — keyingi safar yangi holat sifatida sanaladi
      if (!enabled.has(key) || now - (S.faceLast[key] || 0) > FACE_GAP_MS) {
        delete S.faceSince[key];
        delete S.faceReported[key];
      }
    }

    for (const r of rules) {
      const since = S.faceSince[r.key];
      if (!active[r.key] && !since) continue;
      const start = since || (S.faceSince[r.key] = now);
      if (!active[r.key]) continue; // qisqa uzilish — vaqt davom etadi, lekin hozir signal yo'q
      const dur = now - start;
      const secs = `${(dur / 1000).toFixed(1)} soniya`;
      const firstAt = r.warn ? r.warnAt : r.violAt;
      if (dur >= firstAt && !banner) banner = r.text;

      const done = S.faceReported[r.key] || (S.faceReported[r.key] = {});
      // Ogohlantirish: o'quvchi ekranida chiqqan paytda o'qituvchiga ham — shu paytdagi surat bilan
      if (r.warn && dur >= r.warnAt && !done.warn) {
        done.warn = true;
        report(r.warn, secs);
        if (navigator.vibrate) navigator.vibrate(200);
      }
      // Qoidabuzarlik: holat davom etsa
      if (r.viol && dur >= r.violAt && !done.viol) {
        done.viol = true;
        report(r.viol, secs);
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      }
    }
    const el = $('face-banner');
    el.hidden = !banner;
    if (banner) el.textContent = banner;
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
    bindDraft();
    $('btn-back').addEventListener('click', () => show('scr-classes'));
    $('btn-back-classes').addEventListener('click', () => show('scr-classes'));
    $('q-open').addEventListener('submit', onOpenSubmit);
    $('q-open-input').addEventListener('focus', () => { S.typing = true; });
    $('q-open-input').addEventListener('blur', () => { setTimeout(() => { S.typing = false; }, 600); });
    $('q-image').addEventListener('click', () => {
      const src = $('q-image-img');
      const big = $('overlay-image-img');
      big.src = src.src;
      // Keng rasm telefonda mayda ko'rinadi — kattaroq ko'rsatib, barmoq bilan surish mumkin
      const wide = src.naturalWidth > src.naturalHeight * 1.6 && innerWidth < innerHeight;
      $('overlay-image').classList.toggle('wide', wide);
      $('overlay-image').hidden = false;
      $('overlay-image-scroll').scrollLeft = 0;
    });
    $('overlay-image-close').addEventListener('click', () => { $('overlay-image').hidden = true; });
    $('overlay-image').addEventListener('click', e => { if (e.target === $('overlay-image')) $('overlay-image').hidden = true; });
    $('btn-rules-ok').addEventListener('click', onRulesOk);
    $('btn-rules-back').addEventListener('click', () => { $('modal-rules').hidden = true; });
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
