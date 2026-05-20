// ─── API URL - Yangi Railway URL manzilingiz ───
const API = "https://steamplazamusaboqatestbackend-production.up.railway.app";

// ─── STATE ─────────────────────────────────────────────────────────────────────
let curClass = "";
let tList = [];
let qIdx = 0;
let score = 0;
let allGlobalClasses = []; 
let editingTestId = null; // Tahrirlanayotgan savol ID si uchun shtat

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
    if(chkBoxList) chkBoxList.innerHTML = "";

    if (classes.length === 0) {
      sg.innerHTML = "<p style='color:#64748b'>Hech qanday sinf yo'q</p>";
    }

    classes.forEach(c => {
      // SyntaxError oldini olish uchun elementlarni xavfsiz yaratamiz va event bog'laymiz
      const studentCard = document.createElement('div');
      studentCard.className = "card";
      studentCard.innerHTML = `<h3>${c.id}</h3>`;
      studentCard.addEventListener('click', () => openAuth(c.id));
      sg.appendChild(studentCard);

      const adminCard = document.createElement('div');
      adminCard.className = "card";
      adminCard.style.cssText = "display:flex; justify-content:space-between; align-items:center";
      adminCard.innerHTML = `<b>${c.id}</b>`;
      
      const delBtn = document.createElement('i');
      delBtn.className = "ri-delete-bin-line icon-btn";
      delBtn.style.cssText = "cursor:pointer; color:red";
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        delClass(c.id);
      });
      adminCard.appendChild(delBtn);
      ag.appendChild(adminCard);

      sel.innerHTML += `<option value="${c.id}">${c.id}</option>`;
      
      if(chkBoxList) {
        chkBoxList.innerHTML += `
          <label style="display: flex; align-items: center; gap: 5px; font-weight: normal; margin: 0; width: calc(25% - 15px); min-width: 80px; cursor:pointer;">
            <input type="checkbox" name="target_classes" value="${c.id}" style="width: auto; margin: 0;"> ${c.id}
          </label>
        `;
      }
    });
  } catch (err) {
    sg.innerHTML = `<p style="color:red">Xatolik: ${err.message}. API URL to'g'riligini tekshiring.</p>`;
  }
}

// ─── PARALLEL CLASSED SELECTION HELPERS ───────────────────────────────────────
window.selectAllParallelClasses = () => {
  const currentSelectedClass = document.getElementById('adm-sel-c').value;
  if(!currentSelectedClass) return alert("Avval yuqoridan asosiy sinfni tanlang!");
  
  const grade = getGrade(currentSelectedClass);
  const checkboxes = document.querySelectorAll('input[name="target_classes"]');
  
  checkboxes.forEach(cb => {
    if(getGrade(cb.value) === grade) {
      cb.checked = true;
    } else {
      cb.checked = false;
    }
  });
};

window.clearSelectionClasses = () => {
  const checkboxes = document.querySelectorAll('input[name="target_classes"]');
  checkboxes.forEach(cb => cb.checked = false);
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
      await api('/api/classes/' + id, 'DELETE');
      loadData();
    } catch (err) {
      alert("Xatolik: " + err.message);
    }
  }
};

// ─── SAVOL SAQLASH / TAHRIRLASH ────────────────────────────────────────────────
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
    if(cb.value !== classId) targetClasses.push(cb.value);
  });

  const bodyData = { question, correct_answer, wrong1, wrong2 };
  
  if (editingTestId) {
    bodyData.id = editingTestId; // Agar tahrirlanayotgan bo'lsa ID ni yuboramiz
  } else {
    bodyData.targetClasses = targetClasses;
  }

  try {
    await api('/api/classes/' + classId + '/tests', 'POST', bodyData);
    
    // Formani tozalash
    document.getElementById('adm-q').value = "";
    document.getElementById('adm-a').value = "";
    document.getElementById('adm-w1').value = "";
    document.getElementById('adm-w2').value = "";
    
    // Tahrirlash rejimini yopish
    if(editingTestId) {
      editingTestId = null;
      document.getElementById('save-test-btn').innerHTML = `<i class="ri-save-line"></i> SAQLASH`;
      document.getElementById('bulk-classes-container').style.display = "block";
    }

    loadTTable();
  } catch (err) {
    alert("Xatolik: " + err.message);
  }
};

// ─── SAVOLLAR JADVALINI YUKLASH (Tahrirlash va O'chirish yuklamasi bilan) ──────
window.loadTTable = async () => {
  const classId = document.getElementById('adm-sel-c').value;
  const box = document.getElementById('adm-t-list');
  if (!classId) return box.innerHTML = "";

  box.innerHTML = "<p>Yuklanmoqda...</p>";
  try {
    const tests = await api('/api/classes/' + classId + '/tests');
    box.innerHTML = "";
    if (tests.length === 0) {
      box.innerHTML = "<p style='color:#64748b'>Savollar yo'q</p>";
      return;
    }
    tests.forEach((t, i) => {
      let opts = [];
      try {
        opts = typeof t.options === 'string' ? JSON.parse(t.options) : t.options;
      } catch(e) { opts = [t.correct_answer]; }

      const row = document.createElement('div');
      row.className = "test-item-row";
      row.style.cssText = "background:white; padding:15px; margin-bottom:15px; border-radius:12px; border:1px solid #e2e8f0; position:relative;";
      
      row.innerHTML = `
        <div class="test-content">
          <b style="display:block; margin-bottom:5px; padding-right:60px;">${i + 1}. ${t.question}</b>
          <span style="color:var(--primary); font-weight:bold; display:block; font-size:14px;">To'g'ri javob: ${t.correct_answer}</span>
          <span style="color:#64748b; font-size:13px; display:block; margin-top:2px;">Noto'g'ri javoblar: ${opts[1] || '-'}, ${opts[2] || '-'}</span>
        </div>
        <div class="action-q-btns" style="position:absolute; top:10px; right:10px; display:flex; gap:10px; cursor:pointer;">
        </div>
      `;

      // Tahrirlash tugmasi
      const editBtn = document.createElement('i');
      editBtn.className = "ri-edit-line";
      editBtn.title = "Tahrirlash";
      editBtn.style.color = "blue";
      editBtn.addEventListener('click', () => editT(t, opts));
      row.querySelector('.action-q-btns').appendChild(editBtn);

      // O'chirish tugmasi
      const delBtn = document.createElement('i');
      delBtn.className = "ri-close-line";
      delBtn.title = "Savolni o'chirish";
      delBtn.style.color = "red";
      delBtn.addEventListener('click', () => delT(t.id));
      row.querySelector('.action-q-btns').appendChild(delBtn);

      box.appendChild(row);
    });
  } catch (err) {
    box.innerHTML = "<p style="color:red">Xatolik: " + err.message + "</p>";
  }
};

// ─── SAVOLNI TAHRIRLASH REJIMIGA O'TKAZISH ──────────────────────────────────────
function editT(test, options) {
  editingTestId = test.id;
  document.getElementById('adm-q').value = test.question;
  document.getElementById('adm-a').value = test.correct_answer;
  document.getElementById('adm-w1').value = options[1] || '';
  document.getElementById('adm-w2').value = options[2] || '';
  
  document.getElementById('save-test-btn').innerHTML = `<i class="ri-save-line"></i> YANGILASH (TAHRIR)`;
  document.getElementById('bulk-classes-container').style.display = "none"; // Tahrirlashda ommaviy qo'shish yopiladi
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── SAVOL O'CHIRISH ───────────────────────────────────────────────────────────
window.delT = async (testId) => {
  if (confirm("Ushbu savol o'chirilsinmi?")) {
    try {
      await api('/api/tests/' + testId, 'DELETE');
      loadTTable();
    } catch (err) {
      alert("Xatolik: " + err.message);
    }
  }
};

// ─── SAVOLLAR BAZASINI PDF YUKLAB OLISH ─────────────────────────────────────────
window.downloadQuestionsPDF = async () => {
  const classId = document.getElementById('adm-sel-c').value;
  if (!classId) return alert("Avval sinfni tanlang!");
  
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  try {
    const tests = await api('/api/classes/' + classId + '/tests');
    if (tests.length === 0) return alert("Bu sinfda hech qanday savol yo'q!");

    const rows = tests.map((t, idx) => {
      let opts = [];
      try {
        opts = typeof t.options === 'string' ? JSON.parse(t.options) : t.options;
      } catch(e) { opts = [t.correct_answer]; }
      return [idx + 1, t.question, t.correct_answer, opts[1] || '', opts[2] || ''];
    });

    doc.setFontSize(16);
    doc.text(`${classId} Sinfining Savollar Bazasi`, 14, 15);
    doc.autoTable({
      head: [['T/r', 'Savol Matni', 'To\'g\'ri Javob', 'Xato 1', 'Xato 2']],
      body: rows,
      startY: 22,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] }
    });
    doc.save(`${classId}_savollar_bazasi.pdf`);
  } catch (err) {
    alert("PDF yaratishda xatolik: " + err.message);
  }
};

// ─── TEST BOSHLASH (AUTH) ──────────────────────────────────────────────────────
window.openAuth = async (id) => {
  curClass = id;

  try {
    const tests = await api('/api/grade/' + id + '/tests');

    if (tests.length === 0) {
      return alert(id + " sinfiga tegishli testlar yuklanmagan!");
    }

    tList = tests; 

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
      card.className = "card";
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
    const results = await api('/api/classes/' + id + '/results');
    tb.innerHTML = "";

    if (results.length === 0) {
      tb.innerHTML = "<tr><td colspan='6' style='text-align:center; padding:20px'>Natija yo'q</td></tr>";
      return;
    }

    results.forEach((r, idx) => {
      let badgeStyle = "";
      let placeLabel = idx + 1;

      if (idx === 0) {
        badgeStyle = "background-color: #fef08a; color: #854d0e; font-weight: 900; border-radius: 6px; padding: 4px 8px;"; 
        placeLabel = "🥇 1";
      } else if (idx === 1) {
        badgeStyle = "background-color: #e2e8f0; color: #334155; font-weight: 900; border-radius: 6px; padding: 4px 8px;"; 
        placeLabel = "🥈 2";
      } else if (idx === 2) {
        badgeStyle = "background-color: #ffedd5; color: #c2410c; font-weight: 900; border-radius: 6px; padding: 4px 8px;"; 
        placeLabel = "🥉 3";
      }

      const row = document.createElement('tr');
      row.style.borderBottom = "1px solid #eee";
      row.innerHTML = `
        <td style="padding:15px"><span style="${badgeStyle}">${placeLabel}</span></td>
        <td style="padding:15px"><b>${r.team_name}</b></td>
        <td style="padding:15px">${r.student_name}</td>
        <td style="padding:15px"><b style="color:var(--primary)">${r.score} / ${r.total}</b></td>
        <td style="padding:15px"><small>${r.time_taken || new Date(r.created_at).toLocaleString('uz-UZ')}</small></td>
        <td style="padding:15px; text-align:right">
        </td>
      `;

      const delResBtn = document.createElement('button');
      delResBtn.className = "res-del-btn";
      delResBtn.innerHTML = `<i class="ri-delete-bin-line"></i>`;
      delResBtn.addEventListener('click', () => delResult(r.id, id));
      row.cells[5].appendChild(delResBtn);

      tb.appendChild(row);
    });
  } catch (err) {
    tb.innerHTML = "<tr><td colspan='6' style='color:red; padding:15px'>Xatolik: " + err.message + "</td></tr>";
  }
};

// ─── NATIJA O'CHIRISH ──────────────────────────────────────────────────────────
window.delResult = async (id, classId) => {
  if (confirm("Ushbu natijani o'chirib tashlamoqchimisiz?")) {
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
    const results = await api('/api/classes/' + className + '/results');
    const rows = results.map((r, idx) => [idx + 1, r.team_name, r.student_name, `${r.score}/${r.total}`, r.time_taken || '']);
    
    doc.text(className + " Sinf Natijalari", 14, 15);
    doc.autoTable({ head: [['O\'rin', 'Jamoa', 'Ism', 'Ball', 'Vaqt']], body: rows, startY: 20, theme: 'grid' });
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
      const results = await api('/api/classes/' + c.id + '/results');
      if (results.length > 0) {
        if (y > 240) { doc.addPage(); y = 20; }
        doc.setFontSize(14);
        doc.text(c.id + " Sinf Natijalari", 14, y);
        const rows = results.map((r, idx) => [idx + 1, r.team_name, r.student_name, `${r.score}/${r.total}`, r.time_taken || '']);
        doc.autoTable({ head: [['O\'rin', 'Jamoa', 'Ism', 'Ball', 'Vaqt']], body: rows, startY: y + 2, theme: 'grid' });
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
      const results = await api('/api/classes/' + c.id + '/results');
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
          head: [['O\'rin', 'Jamoa', 'Ism', 'Ball', 'Vaqt']], 
          body: rows, 
          startY: y + 3, 
          theme: 'striped',
          headStyles: { fillColor: [16, 185, 129] }
        });
        y = doc.lastAutoTable.finalY + 12;
      }
    }
    doc.save("top3_sinflar_goliplari.pdf");
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
