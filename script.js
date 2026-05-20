// ─── API URL ───────────────────────────────────────────────────────────────────
const API = "https://steamplazamusaboqatestbackend-production.up.railway.app";

// ─── STATE ─────────────────────────────────────────────────────────────────────
let curClass = "";
let tList = [];
let qIdx = 0;
let score = 0;
let allGlobalClasses = [];

// ─── HELPER: API CALL ──────────────────────────────────────────────────────────
async function api(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Server xatosi' }));
    throw new Error(err.error || 'Server xatosi');
  }
  return res.json();
}

// ─── GRADE HELPER ──────────────────────────────────────────────────────────────
function getGrade(name) {
  return name.split('-')[0];
}

// ─── UI HELPERS ────────────────────────────────────────────────────────────────
window.toggleSidebar = () => document.getElementById('admin-sidebar').classList.toggle('collapsed');
window.openLogin = () => document.getElementById('m-login').classList.add('active');
window.closeM = (id) => document.getElementById(id).classList.remove('active');
window.goHome = () => {
  document.getElementById('v-home').classList.remove('hidden');
  document.getElementById('v-auth').classList.add('hidden');
};
window.closeRes = () => {
  document.getElementById('res-grid').classList.remove('hidden');
  document.getElementById('res-detail').classList.add('hidden');
};

// ─── ADMIN LOGIN ───────────────────────────────────────────────────────────────
window.verifyAdmin = () => {
  if (document.getElementById('adm-pass').value === "1234") {
    document.getElementById('v-home').classList.add('hidden');
    document.getElementById('m-login').classList.remove('active');
    document.getElementById('admin-sidebar').classList.add('active');
    document.getElementById('t-classes').classList.add('active');
    document.getElementById('admin-login-btn').classList.add('hidden');
    loadData();
  } else {
    alert("Parol noto'g'ri!");
  }
};

// ─── TAB SWITCH ────────────────────────────────────────────────────────────────
window.switchTab = (id, el) => {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.side-item').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  el.classList.add('active');
  if (id === 't-results') loadResGrid();
};

// ─── LOAD DATA (Sinflar ro'yxati) ─────────────────────────────────────────────
async function loadData() {
  const sg = document.getElementById('st-grid');
  const ag = document.getElementById('adm-grid');
  const sel = document.getElementById('adm-sel-c');
  const chkBoxList = document.getElementById('classes-checkbox-list');

  sg.innerHTML = "<p>Yuklanmoqda...</p>";

  try {
    const classes = await api('/api/classes');
    allGlobalClasses = classes;

    sg.innerHTML = "";
    ag.innerHTML = "";
    sel.innerHTML = "<option value=''>Sinf tanlang</option>";
    if (chkBoxList) chkBoxList.innerHTML = "";

    if (classes.length === 0) {
      sg.innerHTML = "<p style='color:#64748b'>Hech qanday sinf yo'q</p>";
    }

    classes.forEach(c => {
      // FIX: data-id ishlatildi, onclick ichida apostrof muammosi hal qilindi
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `<h3>${c.id}</h3>`;
      card.addEventListener('click', () => openAuth(c.id));
      sg.appendChild(card);

      const admCard = document.createElement('div');
      admCard.className = 'card';
      admCard.style.cssText = 'display:flex; justify-content:space-between; align-items:center';
      admCard.innerHTML = `<b>${c.id}</b><i class="ri-delete-bin-line icon-btn" style="cursor:pointer; color:red" title="O'chirish"></i>`;
      admCard.querySelector('i').addEventListener('click', () => delClass(c.id));
      ag.appendChild(admCard);

      sel.innerHTML += `<option value="${c.id}">${c.id}</option>`;

      if (chkBoxList) {
        const label = document.createElement('label');
        label.style.cssText = 'display:flex; align-items:center; gap:5px; font-weight:normal; margin:0; width:calc(25% - 15px); min-width:80px; cursor:pointer;';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.name = 'target_classes';
        cb.value = c.id;
        cb.style.cssText = 'width:auto; margin:0;';
        label.appendChild(cb);
        label.appendChild(document.createTextNode(' ' + c.id));
        chkBoxList.appendChild(label);
      }
    });
  } catch (err) {
    sg.innerHTML = `<p style="color:red">Xatolik: ${err.message}. API URL to'g'riligini tekshiring.</p>`;
  }
}

// ─── PARALLEL SINF TANLASH ─────────────────────────────────────────────────────
window.selectAllParallelClasses = () => {
  const currentSelectedClass = document.getElementById('adm-sel-c').value;
  if (!currentSelectedClass) return alert("Avval yuqoridan asosiy sinfni tanlang!");
  const grade = getGrade(currentSelectedClass);
  const checkboxes = document.querySelectorAll('input[name="target_classes"]');
  checkboxes.forEach(cb => {
    cb.checked = getGrade(cb.value) === grade;
  });
};

window.clearSelectionClasses = () => {
  document.querySelectorAll('input[name="target_classes"]').forEach(cb => cb.checked = false);
};

// ─── SINF QO'SHISH ─────────────────────────────────────────────────────────────
window.addClass = async () => {
  const val = document.getElementById('new-c-input').value.trim();
  if (!val) return;
  try {
    await api('/api/classes', 'POST', { id: val });
    document.getElementById('new-c-input').value = "";
    loadData();
  } catch (err) {
    alert("Xatolik: " + err.message);
  }
};

// ─── SINF O'CHIRISH ────────────────────────────────────────────────────────────
window.delClass = async (id) => {
  if (confirm(id + " sinfi o'chirilsinmi?")) {
    try {
      await api('/api/classes/' + encodeURIComponent(id), 'DELETE');
      loadData();
    } catch (err) {
      alert("Xatolik: " + err.message);
    }
  }
};

// ─── SAVOL SAQLASH ─────────────────────────────────────────────────────────────
window.saveTest = async () => {
  const classId = document.getElementById('adm-sel-c').value;
  const question = document.getElementById('adm-q').value.trim();
  const correct_answer = document.getElementById('adm-a').value.trim();
  const wrong1 = document.getElementById('adm-w1').value.trim();
  const wrong2 = document.getElementById('adm-w2').value.trim();

  if (!classId || !question || !correct_answer) return alert("To'ldiring!");

  const checkboxes = document.querySelectorAll('input[name="target_classes"]:checked');
  const targetClasses = [classId];
  checkboxes.forEach(cb => {
    if (cb.value !== classId) targetClasses.push(cb.value);
  });

  try {
    await api('/api/classes/' + encodeURIComponent(classId) + '/tests', 'POST', {
      question, correct_answer, wrong1, wrong2, targetClasses
    });
    document.getElementById('adm-q').value = "";
    document.getElementById('adm-a').value = "";
    document.getElementById('adm-w1').value = "";
    document.getElementById('adm-w2').value = "";
    loadTTable();
  } catch (err) {
    alert("Xatolik: " + err.message);
  }
};

// ─── SAVOLLAR JADVALINI YUKLASH (Tahrirlash + PDF imkoniyati qo'shildi) ────────
window.loadTTable = async () => {
  const classId = document.getElementById('adm-sel-c').value;
  const box = document.getElementById('adm-t-list');
  if (!classId) return box.innerHTML = "";

  box.innerHTML = "<p>Yuklanmoqda...</p>";
  try {
    const tests = await api('/api/classes/' + encodeURIComponent(classId) + '/tests');
    box.innerHTML = "";

    if (tests.length === 0) {
      box.innerHTML = "<p style='color:#64748b'>Savollar yo'q</p>";
      return;
    }

    // PDF tugmasi - faqat testlar bo'lsa ko'rsatiladi
    const pdfBtn = document.createElement('div');
    pdfBtn.style.cssText = 'margin-bottom:15px; display:flex; gap:10px;';
    pdfBtn.innerHTML = `
      <button class="btn btn-primary" onclick="downloadTestsPDF('${classId.replace(/'/g, "\\'")}')">
        <i class="ri-file-pdf-line"></i> SAVOLLARNI PDF YUKLASH
      </button>
      <span style="align-self:center; color:#64748b; font-size:14px;">${tests.length} ta savol</span>
    `;
    box.appendChild(pdfBtn);

    tests.forEach((t, i) => {
      let opts = [];
      try {
        opts = typeof t.options === 'string' ? JSON.parse(t.options) : t.options;
      } catch (e) {
        opts = [t.correct_answer];
      }

      const wrongOpts = opts.filter(o => o && o.trim() !== '' && o !== t.correct_answer);

      const row = document.createElement('div');
      row.className = 'test-item-row';
      row.dataset.testId = t.id;
      row.style.cssText = 'background:white; padding:15px; margin-bottom:15px; border-radius:12px; border:1px solid #e2e8f0; position:relative;';

      // Ko'rish rejimi
      row.innerHTML = `
        <div class="test-view-mode">
          <b style="display:block; margin-bottom:5px; padding-right:60px;">${i + 1}. ${t.question}</b>
          <span style="color:var(--primary); font-weight:bold;">✓ To'g'ri: ${t.correct_answer}</span>
          ${wrongOpts.length > 0 ? `<span style="color:#ef4444; margin-left:15px;">✗ Xato: ${wrongOpts.join(', ')}</span>` : ''}
          <div style="position:absolute; top:10px; right:10px; display:flex; gap:8px;">
            <button class="btn" onclick="editTestMode(${t.id})" title="Tahrirlash"
              style="padding:5px 10px; background:#f1f5f9; font-size:12px;">
              <i class="ri-edit-line"></i>
            </button>
            <button class="btn btn-danger" onclick="delT(${t.id})" title="O'chirish"
              style="padding:5px 10px; font-size:12px;">
              <i class="ri-close-line"></i>
            </button>
          </div>
        </div>
        <div class="test-edit-mode" style="display:none;">
          <input type="text" id="eq-${t.id}" value="${t.question.replace(/"/g, '&quot;')}" placeholder="Savol matni" style="margin-bottom:8px;">
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:8px;">
            <input type="text" id="ea-${t.id}" value="${t.correct_answer.replace(/"/g, '&quot;')}" placeholder="To'g'ri javob" style="border-color:var(--primary); margin:0;">
            <input type="text" id="ew1-${t.id}" value="${(wrongOpts[0] || '').replace(/"/g, '&quot;')}" placeholder="Xato 1" style="margin:0;">
            <input type="text" id="ew2-${t.id}" value="${(wrongOpts[1] || '').replace(/"/g, '&quot;')}" placeholder="Xato 2" style="margin:0;">
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-primary" onclick="saveEditTest(${t.id})" style="font-size:13px; padding:8px 15px;">
              <i class="ri-save-line"></i> Saqlash
            </button>
            <button class="btn" onclick="cancelEditTest(${t.id})" style="font-size:13px; padding:8px 15px; background:#e2e8f0;">
              Bekor
            </button>
          </div>
        </div>
      `;
      box.appendChild(row);
    });
  } catch (err) {
    box.innerHTML = "<p style='color:red'>Xatolik: " + err.message + "</p>";
  }
};

// ─── TEST TAHRIRLASH MODLARI ───────────────────────────────────────────────────
window.editTestMode = (testId) => {
  const row = document.querySelector(`[data-test-id="${testId}"]`);
  if (!row) return;
  row.querySelector('.test-view-mode').style.display = 'none';
  row.querySelector('.test-edit-mode').style.display = 'block';
};

window.cancelEditTest = (testId) => {
  const row = document.querySelector(`[data-test-id="${testId}"]`);
  if (!row) return;
  row.querySelector('.test-view-mode').style.display = 'block';
  row.querySelector('.test-edit-mode').style.display = 'none';
};

window.saveEditTest = async (testId) => {
  const question = document.getElementById(`eq-${testId}`).value.trim();
  const correct_answer = document.getElementById(`ea-${testId}`).value.trim();
  const wrong1 = document.getElementById(`ew1-${testId}`).value.trim();
  const wrong2 = document.getElementById(`ew2-${testId}`).value.trim();

  if (!question || !correct_answer) return alert("Savol va to'g'ri javob kerak!");

  try {
    await api('/api/tests/' + testId, 'PUT', { question, correct_answer, wrong1, wrong2 });
    loadTTable();
  } catch (err) {
    alert("Xatolik: " + err.message);
  }
};

// ─── SAVOL O'CHIRISH ───────────────────────────────────────────────────────────
window.delT = async (testId) => {
  if (!confirm("Ushbu savolni o'chirasizmi?")) return;
  try {
    await api('/api/tests/' + testId, 'DELETE');
    loadTTable();
  } catch (err) {
    alert("Xatolik: " + err.message);
  }
};

// ─── TESTLARNI PDF YUKLASH (Yangi funksiya) ────────────────────────────────────
window.downloadTestsPDF = async (classId) => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  try {
    const tests = await api('/api/classes/' + encodeURIComponent(classId) + '/tests');
    if (tests.length === 0) return alert("Savollar yo'q!");

    doc.setFontSize(16);
    doc.text(classId + " - Savollar bazasi", 14, 15);
    doc.setFontSize(10);
    doc.text(`Jami: ${tests.length} ta savol`, 14, 22);

    const rows = tests.map((t, i) => {
      let opts = [];
      try {
        opts = typeof t.options === 'string' ? JSON.parse(t.options) : t.options;
      } catch (e) {
        opts = [t.correct_answer];
      }
      const wrongOpts = opts.filter(o => o && o.trim() !== '' && o !== t.correct_answer);
      return [
        i + 1,
        t.question,
        t.correct_answer,
        wrongOpts.join(' / ') || '-'
      ];
    });

    doc.autoTable({
      head: [['#', 'Savol', "To'g'ri javob", 'Xato javoblar']],
      body: rows,
      startY: 28,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129] },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 90 },
        2: { cellWidth: 45 },
        3: { cellWidth: 45 }
      },
      styles: { fontSize: 9, cellPadding: 4 }
    });

    doc.save(`${classId}_savollar.pdf`);
  } catch (err) {
    alert("PDF yaratishda xatolik: " + err.message);
  }
};

// ─── TEST BOSHLASH (AUTH) ──────────────────────────────────────────────────────
// FIX: /api/grade/ o'rniga /api/classes/ ishlatildi - har bir sinf faqat o'zining testlarini oladi
window.openAuth = async (id) => {
  curClass = id;

  try {
    const tests = await api('/api/classes/' + encodeURIComponent(id) + '/tests');

    if (tests.length === 0) {
      return alert(id + " sinfiga test biriktirilmagan!");
    }

    // Savollarni aralashtirib ko'rsatish
    tList = tests.sort(() => Math.random() - 0.5);

    document.getElementById('sel-c-title').innerText = id;
    document.getElementById('v-home').classList.add('hidden');
    document.getElementById('v-auth').classList.remove('hidden');
  } catch (err) {
    alert("Serverdan ma'lumot olishda xatolik: " + err.message);
  }
};

// ─── TEST BOSHLASH ─────────────────────────────────────────────────────────────
window.startQuiz = () => {
  if (!document.getElementById('st-name').value.trim()) {
    return alert("Iltimos, Ism Familiyangizni kiriting!");
  }
  document.getElementById('v-auth').classList.add('hidden');
  document.getElementById('v-quiz').classList.remove('hidden');
  qIdx = 0;
  score = 0;
  renderQ();
};

// ─── SAVOL RENDER ──────────────────────────────────────────────────────────────
function renderQ() {
  if (qIdx >= tList.length) return finish();
  const q = tList[qIdx];
  document.getElementById('q-text').innerText = `${qIdx + 1}. ${q.question}`;

  const box = document.getElementById('opt-box');
  box.innerHTML = "";

  let options = [];
  try {
    options = typeof q.options === 'string' ? JSON.parse(q.options) : q.options;
  } catch (e) {
    options = [q.correct_answer];
  }

  [...options]
    .filter(o => o && o.trim() !== '')
    .sort(() => Math.random() - 0.5)
    .forEach(o => {
      const b = document.createElement('button');
      b.className = "btn";
      b.style.cssText = "background:white; border:2px solid #e2e8f0; width:100%; justify-content:flex-start; padding:15px;";
      b.innerText = o;
      b.onclick = () => {
        if (o === q.correct_answer) score++;
        qIdx++;
        renderQ();
      };
      box.appendChild(b);
    });
}

// ─── TEST YAKUNLASH ────────────────────────────────────────────────────────────
async function finish() {
  let team = document.getElementById('st-team').value.trim();
  const name = document.getElementById('st-name').value.trim();

  if (!team) team = "-";

  document.getElementById('f-team').innerText = team;
  document.getElementById('f-score').innerText = score;
  document.getElementById('f-wrong').innerText = tList.length - score;
  document.getElementById('m-finish').classList.add('active');

  try {
    await api('/api/results', 'POST', {
      class_id: curClass,
      team_name: team,
      student_name: name,
      score,
      total: tList.length,
      time_taken: new Date().toLocaleString('uz-UZ')
    });
  } catch (err) {
    console.error("Natija saqlanmadi:", err.message);
  }
}

// ─── NATIJALAR GRID ────────────────────────────────────────────────────────────
window.loadResGrid = async () => {
  const g = document.getElementById('res-grid');
  g.innerHTML = "<p>Yuklanmoqda...</p>";
  try {
    const classes = await api('/api/classes');
    g.innerHTML = "";
    classes.forEach(c => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `<h3>${c.id}</h3>`;
      card.addEventListener('click', () => openRes(c.id));
      g.appendChild(card);
    });
  } catch (err) {
    g.innerHTML = "<p style='color:red'>Xatolik: " + err.message + "</p>";
  }
};

// ─── SINF NATIJALARINI OCHISH ──────────────────────────────────────────────────
window.openRes = async (id) => {
  document.getElementById('res-grid').classList.add('hidden');
  document.getElementById('res-detail').classList.remove('hidden');
  document.getElementById('res-c-name').innerText = id + " Natijalari";
  document.getElementById('pdf-single-btn').onclick = () => downloadSinglePDF(id);

  const tb = document.getElementById('res-tbody');
  tb.innerHTML = "<tr><td colspan='6' style='text-align:center'>Yuklanmoqda...</td></tr>";

  try {
    const results = await api('/api/classes/' + encodeURIComponent(id) + '/results');
    tb.innerHTML = "";

    if (results.length === 0) {
      tb.innerHTML = "<tr><td colspan='6' style='text-align:center; padding:20px'>Natija yo'q</td></tr>";
      return;
    }

    results.forEach((r, idx) => {
      let badgeStyle = "";
      let placeLabel = idx + 1;

      if (idx === 0) {
        badgeStyle = "background-color:#fef08a; color:#854d0e; font-weight:900; border-radius:6px; padding:4px 8px;";
        placeLabel = "🥇 1";
      } else if (idx === 1) {
        badgeStyle = "background-color:#e2e8f0; color:#334155; font-weight:900; border-radius:6px; padding:4px 8px;";
        placeLabel = "🥈 2";
      } else if (idx === 2) {
        badgeStyle = "background-color:#ffedd5; color:#c2410c; font-weight:900; border-radius:6px; padding:4px 8px;";
        placeLabel = "🥉 3";
      }

      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid #eee';
      tr.innerHTML = `
        <td style="padding:15px"><span style="${badgeStyle}">${placeLabel}</span></td>
        <td style="padding:15px"><b>${r.team_name}</b></td>
        <td style="padding:15px">${r.student_name}</td>
        <td style="padding:15px"><b style="color:var(--primary)">${r.score} / ${r.total}</b></td>
        <td style="padding:15px"><small>${r.time_taken || new Date(r.created_at).toLocaleString('uz-UZ')}</small></td>
        <td style="padding:15px; text-align:right">
          <button class="res-del-btn" title="O'chirish"><i class="ri-delete-bin-line"></i></button>
        </td>
      `;
      tr.querySelector('.res-del-btn').addEventListener('click', () => delResult(r.id, id));
      tb.appendChild(tr);
    });
  } catch (err) {
    tb.innerHTML = "<tr><td colspan='6' style='color:red; padding:15px'>Xatolik: " + err.message + "</td></tr>";
  }
};

// ─── NATIJA O'CHIRISH ──────────────────────────────────────────────────────────
window.delResult = async (id, classId) => {
  if (confirm("Ushbu natijani o'chirasizmi?")) {
    try {
      await api('/api/results/' + id, 'DELETE');
      openRes(classId);
    } catch (err) {
      alert("Xatolik: " + err.message);
    }
  }
};

// ─── PDF: ALOHIDA SINF NATIJALARI ─────────────────────────────────────────────
window.downloadSinglePDF = async (className) => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  try {
    const results = await api('/api/classes/' + encodeURIComponent(className) + '/results');
    const rows = results.map((r, idx) => [idx + 1, r.team_name, r.student_name, `${r.score}/${r.total}`, r.time_taken || '']);
    doc.text(className + " Sinf Natijalari", 14, 15);
    doc.autoTable({ head: [["O'rin", 'Jamoa', 'Ism', 'Ball', 'Vaqt']], body: rows, startY: 20, theme: 'grid' });
    doc.save(`${className}_natijalari.pdf`);
  } catch (err) {
    alert("PDF yaratishda xatolik: " + err.message);
  }
};

// ─── PDF: BARCHA NATIJALAR ────────────────────────────────────────────────────
window.downloadAllResultsPDF = async () => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 20;

  try {
    const classes = allGlobalClasses.length > 0 ? allGlobalClasses : await api('/api/classes');
    doc.setFontSize(18);
    doc.text("STEAM PLAZA - UMUMIY NATIJALAR", 14, y);
    y += 10;

    for (const c of classes) {
      const results = await api('/api/classes/' + encodeURIComponent(c.id) + '/results');
      if (results.length > 0) {
        if (y > 240) { doc.addPage(); y = 20; }
        doc.setFontSize(14);
        doc.text(c.id + " Sinf Natijalari", 14, y);
        const rows = results.map((r, idx) => [idx + 1, r.team_name, r.student_name, `${r.score}/${r.total}`, r.time_taken || '']);
        doc.autoTable({ head: [["O'rin", 'Jamoa', 'Ism', 'Ball', 'Vaqt']], body: rows, startY: y + 2, theme: 'grid' });
        y = doc.lastAutoTable.finalY + 15;
      }
    }
    doc.save("barcha_natijalar.pdf");
  } catch (err) {
    alert("PDF yaratishda xatolik: " + err.message);
  }
};

// ─── PDF: FAQAT TOP-3 GO'LIBLAR ───────────────────────────────────────────────
window.downloadTop3PDF = async () => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 20;

  try {
    const classes = allGlobalClasses.length > 0 ? allGlobalClasses : await api('/api/classes');
    doc.setFontSize(16);
    doc.text("STEAM PLAZA - TOP-3 G'OLIBLAR (SINFLAR KESIMIDA)", 14, y);
    y += 12;

    for (const c of classes) {
      const results = await api('/api/classes/' + encodeURIComponent(c.id) + '/results');
      const top3 = results.slice(0, 3);

      if (top3.length > 0) {
        if (y > 240) { doc.addPage(); y = 20; }
        doc.setFontSize(14);
        doc.text(`${c.id} Sinf G'oliblari`, 14, y);

        const rows = top3.map((r, idx) => {
          let medal = idx + 1;
          if (idx === 0) medal = "1 (Oltin)";
          if (idx === 1) medal = "2 (Kumush)";
          if (idx === 2) medal = "3 (Bronza)";
          return [medal, r.team_name, r.student_name, `${r.score}/${r.total}`, r.time_taken || ''];
        });

        doc.autoTable({
          head: [["O'rin", 'Jamoa', 'Ism', 'Ball', 'Vaqt']],
          body: rows,
          startY: y + 3,
          theme: 'striped',
          headStyles: { fillColor: [16, 185, 129] }
        });
        y = doc.lastAutoTable.finalY + 12;
      }
    }
    doc.save("top3_sinflar_goliblari.pdf");
  } catch (err) {
    alert("PDF yaratishda xatolik: " + err.message);
  }
};

// ─── BAZANI TOZALASH ───────────────────────────────────────────────────────────
window.clearDb = async () => {
  if (confirm("Hammasi o'chadi! Davom etasizmi?")) {
    try {
      await api('/api/clear-all', 'DELETE');
      location.reload();
    } catch (err) {
      alert("Xatolik: " + err.message);
    }
  }
};

// ─── ISHGA TUSHIRISH ───────────────────────────────────────────────────────────
loadData();
