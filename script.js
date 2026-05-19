// ─── API URL - Railway deploy qilgandan keyin shu yerga o'z URL'ingizni yozing ───
// Masalan: const API = "https://steam-plaza-backend.up.railway.app";
const API = "https://YOUR-RAILWAY-URL.up.railway.app";  // <-- BU YERGA O'Z URL'INGIZNI YOZING

// ─── STATE ─────────────────────────────────────────────────────────────────────
let curClass = "";
let tList = [];
let qIdx = 0;
let score = 0;

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

  sg.innerHTML = "<p>Yuklanmoqda...</p>";

  try {
    const classes = await api('/api/classes');

    sg.innerHTML = "";
    ag.innerHTML = "";
    sel.innerHTML = "<option value=''>Sinf tanlang</option>";

    if (classes.length === 0) {
      sg.innerHTML = "<p style='color:#64748b'>Hech qanday sinf yo'q</p>";
    }

    classes.forEach(c => {
      sg.innerHTML += `<div class="card" onclick="openAuth('${c.id}')"><h3>${c.id}</h3></div>`;
      ag.innerHTML += `
        <div class="card" style="display:flex; justify-content:space-between; align-items:center">
          <b>${c.id}</b>
          <i class="ri-delete-bin-line icon-btn" onclick="delClass('${c.id}')" style="cursor:pointer; color:red"></i>
        </div>`;
      sel.innerHTML += `<option value="${c.id}">${c.id}</option>`;
    });
  } catch (err) {
    sg.innerHTML = `<p style="color:red">Xatolik: ${err.message}. API URL to'g'riligini tekshiring.</p>`;
  }
}

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

// ─── SAVOL SAQLASH ─────────────────────────────────────────────────────────────
window.saveTest = async () => {
  const classId = document.getElementById('adm-sel-c').value;
  const question = document.getElementById('adm-q').value.trim();
  const correct_answer = document.getElementById('adm-a').value.trim();
  const wrong1 = document.getElementById('adm-w1').value.trim();
  const wrong2 = document.getElementById('adm-w2').value.trim();

  if (!classId || !question || !correct_answer) return alert("To'ldiring!");

  try {
    await api('/api/classes/' + classId + '/tests', 'POST', {
      question, correct_answer, wrong1, wrong2
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

// ─── SAVOLLAR JADVALINI YUKLASH ───────────────────────────────────────────────
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
      box.innerHTML += `
        <div class="test-item-row" style="background:white; padding:15px; margin-bottom:15px; border-radius:12px; border:1px solid #e2e8f0; position:relative;">
          <div class="test-content">
            <b style="display:block; margin-bottom:5px; padding-right:20px;">${i + 1}. ${t.question}</b>
            <span style="color:var(--primary); font-weight:bold;">Javob: ${t.correct_answer}</span>
          </div>
          <div class="delete-q-btn" onclick="delT(${t.id})" title="Savolni o'chirish" style="position:absolute; top:10px; right:10px; cursor:pointer;">
            <i class="ri-close-line"></i>
          </div>
        </div>`;
    });
  } catch (err) {
    box.innerHTML = "<p style='color:red'>Xatolik: " + err.message + "</p>";
  }
};

// ─── SAVOL O'CHIRISH ───────────────────────────────────────────────────────────
window.delT = async (testId) => {
  try {
    await api('/api/tests/' + testId, 'DELETE');
    loadTTable();
  } catch (err) {
    alert("Xatolik: " + err.message);
  }
};

// ─── TEST BOSHLASH (AUTH) ──────────────────────────────────────────────────────
window.openAuth = async (id) => {
  curClass = id;
  const grade = getGrade(id);

  try {
    // Grade bo'yicha barcha testlarni olish (random tartibda)
    const tests = await api('/api/grade/' + grade + '/tests');

    if (tests.length === 0) {
      return alert(grade + "-sinflar uchun test yuklanmagan!");
    }

    // Savollarni random aralashtirish
    tList = tests.sort(() => Math.random() - 0.5);

    document.getElementById('sel-c-title').innerText = id;
    document.getElementById('v-home').classList.add('hidden');
    document.getElementById('v-auth').classList.remove('hidden');
  } catch (err) {
    alert("Xatolik: " + err.message);
  }
};

// ─── TEST BOSHLASH ─────────────────────────────────────────────────────────────
window.startQuiz = () => {
  if (!document.getElementById('st-name').value || !document.getElementById('st-team').value) {
    return alert("To'ldiring!");
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

  // Options - JSON parse qilamiz
  let options = [];
  try {
    options = typeof q.options === 'string' ? JSON.parse(q.options) : q.options;
  } catch (e) {
    options = [q.correct_answer];
  }

  // Xoli variantlarni olib tashlash va random aralashtirish
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
  const team = document.getElementById('st-team').value;
  const name = document.getElementById('st-name').value;

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
      g.innerHTML += `<div class="card" onclick="openRes('${c.id}')"><h3>${c.id}</h3></div>`;
    });
  } catch (err) {
    g.innerHTML = "<p style='color:red'>Xatolik: " + err.message + "</p>";
  }
};

// ─── SINF NATIJALARINI OCHISH ─────────────────────────────────────────────────
window.openRes = async (id) => {
  document.getElementById('res-grid').classList.add('hidden');
  document.getElementById('res-detail').classList.remove('hidden');
  document.getElementById('res-c-name').innerText = id + " Natijalari";
  document.getElementById('pdf-single-btn').onclick = () => downloadSinglePDF(id);

  const tb = document.getElementById('res-tbody');
  tb.innerHTML = "<tr><td colspan='5' style='text-align:center'>Yuklanmoqda...</td></tr>";

  try {
    const results = await api('/api/classes/' + id + '/results');
    tb.innerHTML = "";

    if (results.length === 0) {
      tb.innerHTML = "<tr><td colspan='5' style='text-align:center; padding:20px'>Natija yo'q</td></tr>";
      return;
    }

    results.forEach(r => {
      tb.innerHTML += `
        <tr style="border-bottom:1px solid #eee">
          <td style="padding:15px"><b>${r.team_name}</b></td>
          <td style="padding:15px">${r.student_name}</td>
          <td style="padding:15px"><b style="color:var(--primary)">${r.score} / ${r.total}</b></td>
          <td style="padding:15px"><small>${r.time_taken || new Date(r.created_at).toLocaleString('uz-UZ')}</small></td>
          <td style="padding:15px; text-align:right">
            <button class="res-del-btn" onclick="delResult(${r.id}, '${id}')">
              <i class="ri-delete-bin-line"></i>
            </button>
          </td>
        </tr>`;
    });
  } catch (err) {
    tb.innerHTML = "<tr><td colspan='5' style='color:red; padding:15px'>Xatolik: " + err.message + "</td></tr>";
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

// ─── PDF: ALOHIDA SINF ────────────────────────────────────────────────────────
window.downloadSinglePDF = async (className) => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  try {
    const results = await api('/api/classes/' + className + '/results');
    const rows = results.map(r => [r.team_name, r.student_name, `${r.score}/${r.total}`, r.time_taken || '']);
    doc.text(className + " Sinf Natijalari", 14, 15);
    doc.autoTable({ head: [['Jamoa', 'Ism', 'Ball', 'Vaqt']], body: rows, startY: 20, theme: 'grid' });
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
    const classes = await api('/api/classes');
    doc.setFontSize(18);
    doc.text("STEAM PLAZA - UMUMIY NATIJALAR", 14, y);
    y += 10;

    for (const c of classes) {
      const results = await api('/api/classes/' + c.id + '/results');
      if (results.length > 0) {
        if (y > 250) { doc.addPage(); y = 20; }
        doc.setFontSize(14);
        doc.text(c.id + " Natijalari", 14, y);
        const rows = results.map(r => [r.team_name, r.student_name, `${r.score}/${r.total}`, r.time_taken || '']);
        doc.autoTable({ head: [['Jamoa', 'Ism', 'Ball', 'Vaqt']], body: rows, startY: y + 2, theme: 'grid' });
        y = doc.lastAutoTable.finalY + 15;
      }
    }
    doc.save("barcha_natijalar.pdf");
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
