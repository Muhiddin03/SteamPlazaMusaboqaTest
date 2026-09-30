'use strict';
// ─── PDF HISOBOTLAR ────────────────────────────────────────────────────────────
// 1) O'quvchi varaqasi — o'quvchiga yuborish uchun: ball, baho, har bir javob, nazorat qaydlari
// 2) To'liq hisobot — admin uchun: qo'shimcha xavf darajasi, qurilma, kamera suratlari
// 3) Natijalar jadvali — sinf/umumiy reyting (TOP-3 ham)
const Report = (() => {
  const GREEN = [16, 185, 129];
  const GREEN_DARK = [4, 120, 87];
  const DARK = [15, 23, 42];
  const MUTED = [100, 116, 139];
  const RED = [185, 28, 28];
  const AMBER = [146, 64, 14];
  const LIGHT = [241, 245, 249];
  const PAGE_W = 210;
  const M = 14;

  // Ogohlantirish sifatida sanaladigan hodisalar (qoidabuzarliklar attempt.violations da)
  const WARNING_TYPES = ['head_turned', 'looking_down', 'motion', 'copy', 'paste', 'key_blocked', 'screenshot',
    'window_blur', 'devtools', 'offline', 'reload', 'fast_answer', 'connection_gap', 'camera_denied', 'focus_lost_short'];

  function warningCount(a) {
    const c = a.event_counts || {};
    return WARNING_TYPES.reduce((s, t) => s + Number(c[t] || 0), 0);
  }

  // ─── Kutubxona ───
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.crossOrigin = 'anonymous';
      s.referrerPolicy = 'no-referrer';
      s.onload = resolve;
      s.onerror = () => reject(new Error('PDF kutubxonasi yuklanmadi'));
      document.head.append(s);
    });
  }

  async function ensureLib() {
    if (!window.jspdf) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    if (!window.jspdf.jsPDF.API.autoTable) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js');
    }
  }

  // ─── Matn: standart PDF shrifti faqat lotin harflarini qo'llaydi ───
  const CYR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 's', ч: 'ch', ш: 'sh', щ: 'sh', ъ: "'", ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: "o'", қ: 'q', ғ: "g'", ҳ: 'h' };

  function pdfText(s) {
    return String(s ?? '')
      .replace(/[ʻʼ’‘`]/g, "'")
      .replace(/[“”«»]/g, '"')
      .replace(/[–—]/g, '-')
      .replace(/[Ѐ-ӿ]/g, ch => {
        const low = ch.toLowerCase();
        const t = CYR[low] ?? '';
        return ch === low ? t : t.charAt(0).toUpperCase() + t.slice(1);
      })
      .replace(/[^\x20-\x7E -ÿ\n]/g, '?');
  }

  const pad = n => String(n).padStart(2, '0');
  function date(v) {
    if (!v) return '-';
    const d = new Date(v);
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function time(v) {
    const d = new Date(v);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  function secs(ms) {
    if (ms == null) return '-';
    const s = Math.max(0, Math.round(ms / 1000));
    return s < 60 ? `${s} s` : `${Math.floor(s / 60)} daq ${s % 60} s`;
  }

  // O'zbekiston maktab baholash tizimi (foizga ko'ra)
  function grade(pct) {
    if (pct >= 86) return { mark: 5, label: "a'lo" };
    if (pct >= 71) return { mark: 4, label: 'yaxshi' };
    if (pct >= 56) return { mark: 3, label: 'qoniqarli' };
    return { mark: 2, label: 'qoniqarsiz' };
  }

  const percent = a => (a.total ? Math.round((a.score / a.total) * 100) : 0);

  function ranked(list) {
    const dur = a => (a.finished_at ? new Date(a.finished_at) - new Date(a.started_at) : 1e12);
    return [...list].sort((x, z) => z.score - x.score || percent(z) - percent(x) || dur(x) - dur(z));
  }

  // ─── Sahifa bezaklari ───
  function header(doc, title, subtitle) {
    doc.setFillColor(...GREEN);
    doc.rect(0, 0, PAGE_W, 24, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('STEAM PLAZA', M, 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(pdfText(title), M, 18);
    if (subtitle) doc.text(pdfText(subtitle), PAGE_W - M, 18, { align: 'right' });
    doc.setTextColor(...DARK);
  }

  function footers(doc) {
    const n = doc.getNumberOfPages();
    const stamp = `Tayyorlandi: ${date(new Date())}`;
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setDrawColor(226, 232, 240);
      doc.line(M, 285, PAGE_W - M, 285);
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text(pdfText(`Steam Plaza test tizimi · ${stamp}`), M, 290);
      doc.text(`${i} / ${n}`, PAGE_W - M, 290, { align: 'right' });
    }
    doc.setTextColor(...DARK);
  }

  function statBox(doc, x, y, w, label, value, color) {
    doc.setFillColor(...LIGHT);
    doc.roundedRect(x, y, w, 21, 2.5, 2.5, 'F');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(pdfText(label), x + 4, y + 6.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...(color || DARK));
    doc.text(pdfText(value), x + 4, y + 15.5, { maxWidth: w - 6 });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...DARK);
  }

  function sectionTitle(doc, y, text) {
    if (y > 262) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...GREEN_DARK);
    doc.text(pdfText(text), M, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...DARK);
    return y + 3;
  }

  const tableBase = {
    theme: 'grid',
    margin: { left: M, right: M, bottom: 18 },
    styles: { fontSize: 8.5, cellPadding: 2, overflow: 'linebreak', lineColor: [226, 232, 240], textColor: DARK },
    headStyles: { fillColor: GREEN, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] }
  };

  // ─── Bitta o'quvchi sahifasi ───
  function studentPage(doc, a, ui, opts) {
    const { full, images } = opts;
    header(doc, full ? "To'liq nazorat hisoboti" : 'Test natijasi', date(a.started_at));

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(pdfText(a.student_name), M, 36);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...MUTED);
    const duration = a.finished_at ? secs(new Date(a.finished_at) - new Date(a.started_at)) : '-';
    const team = a.team_name && a.team_name !== '-' ? ` · Jamoa: ${a.team_name}` : '';
    doc.text(pdfText(`Sinf: ${a.class_id}${team} · Boshlandi: ${date(a.started_at)} · Davomiyligi: ${duration}`), M, 42);
    doc.setTextColor(...DARK);

    const pct = percent(a);
    const g = grade(pct);
    const warns = warningCount(a);
    const bw = (PAGE_W - 2 * M - 9) / 4;
    statBox(doc, M, 47, bw, "To'g'ri javoblar", `${a.score} / ${a.total}`, GREEN_DARK);
    statBox(doc, M + (bw + 3), 47, bw, 'Foiz', `${pct}%`);
    statBox(doc, M + 2 * (bw + 3), 47, bw, 'Baho', `${g.mark} (${g.label})`, g.mark >= 4 ? GREEN_DARK : g.mark === 3 ? AMBER : RED);
    statBox(doc, M + 3 * (bw + 3), 47, bw, 'Qoidabuzarlik / ogohlantirish',
      `${a.violations} / ${warns}`, a.violations ? RED : warns ? AMBER : GREEN_DARK);

    let y = 76;
    const status = (ui.STATUS[a.status] || {}).label || a.status;
    if (a.status !== 'finished') {
      doc.setFillColor(254, 226, 226);
      doc.roundedRect(M, y - 5, PAGE_W - 2 * M, 9, 2, 2, 'F');
      doc.setFontSize(9.5);
      doc.setTextColor(...RED);
      const why = a.status === 'terminated' ? "Test qoidabuzarlik sababli yoki o'qituvchi tomonidan to'xtatilgan."
        : a.status === 'abandoned' ? "Test tashlab ketilgan (uzoq vaqt aloqa bo'lmagan)." : '';
      doc.text(pdfText(`Holat: ${status}. ${why}`), M + 3, y + 0.8);
      doc.setTextColor(...DARK);
      y += 10;
    }
    if (full) {
      const risk = (ui.RISK[a.risk] || ui.RISK.unknown).label;
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      doc.text(pdfText(`Xavf darajasi: ${risk} · Kamera: ${a.camera ? 'yoqilgan' : "yo'q"} · Qurilma: ${ui.shortUA(a.user_agent)} · IP: ${a.ip || '-'}`), M, y);
      doc.setTextColor(...DARK);
      y += 6;
    }

    // Javoblar
    y = sectionTitle(doc, y + 2, `Javoblar (${a.answers.length})`);
    if (a.answers.length) {
      doc.autoTable({
        ...tableBase,
        startY: y + 1,
        head: [['#', 'Savol', 'Javobingiz', "To'g'ri javob", 'Natija', 'Vaqt']],
        body: a.answers.map((x, i) => [
          i + 1,
          x.question || "(savol o'chirilgan)",
          x.timed_out && x.answer == null ? '-' : (x.answer ?? '-'),
          x.correct_answer || '-',
          x.is_correct ? "To'g'ri" : x.timed_out && x.answer == null ? 'Vaqt tugadi' : 'Xato',
          secs(x.time_ms)
        ].map(pdfText)),
        columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 66 }, 2: { cellWidth: 36 }, 3: { cellWidth: 36 }, 4: { cellWidth: 19 }, 5: { cellWidth: 17 } },
        didParseCell: d => {
          if (d.section === 'body' && d.column.index === 4) {
            const ok = d.cell.raw === "To'g'ri";
            d.cell.styles.textColor = ok ? GREEN_DARK : RED;
            d.cell.styles.fontStyle = 'bold';
          }
        }
      });
      y = doc.lastAutoTable.finalY + 8;
    } else {
      doc.setFontSize(9);
      doc.text(pdfText("Javoblar yo'q"), M, y + 4);
      y += 10;
    }

    // Nazorat qaydlari — o'quvchi ham, admin ham ko'radi (shaffoflik)
    const evs = full ? a.events : a.events.filter(e => e.is_violation || WARNING_TYPES.includes(e.type) ||
      ['auto_terminated', 'admin_terminated', 'face_missing', 'multiple_faces', 'tab_hidden', 'fullscreen_exit', 'split_screen', 'multi_tab', 'camera_off'].includes(e.type));
    y = sectionTitle(doc, y, `Nazorat qaydlari (${evs.length})`);
    if (evs.length) {
      doc.autoTable({
        ...tableBase,
        startY: y + 1,
        head: [['Vaqt', 'Hodisa', 'Tafsilot', 'Savol', 'Turi']],
        body: evs.map(e => [time(e.created_at), ui.EVENTS[e.type] || e.type, e.detail || '', e.question_index ? `${e.question_index}-savol` : '',
          e.is_violation ? 'Qoidabuzarlik' : 'Ogohlantirish'].map(pdfText)),
        columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 58 }, 2: { cellWidth: 52 }, 3: { cellWidth: 20 }, 4: { cellWidth: 34 } },
        didParseCell: d => {
          if (d.section === 'body' && d.column.index === 4 && d.cell.raw === 'Qoidabuzarlik') {
            d.cell.styles.textColor = RED;
            d.cell.styles.fontStyle = 'bold';
          }
        }
      });
      y = doc.lastAutoTable.finalY + 8;
    } else {
      doc.setFontSize(9);
      doc.setTextColor(...GREEN_DARK);
      doc.text(pdfText("Qoidabuzarlik va ogohlantirish qayd etilmadi. Barakalla!"), M, y + 4);
      doc.setTextColor(...DARK);
      y += 10;
    }

    // Kamera suratlari (faqat to'liq hisobotda)
    if (full && images && images.length) {
      y = sectionTitle(doc, y, `Kamera suratlari (${images.length} / ${a.snapshots.length})`);
      const w = (PAGE_W - 2 * M - 8) / 3;
      const hh = w * 0.75;
      images.forEach((im, i) => {
        const col = i % 3;
        if (col === 0 && i > 0) y += hh + 8;
        if (y + hh > 280) { doc.addPage(); y = 20; }
        const x = M + col * (w + 4);
        try { doc.addImage(im.data, 'JPEG', x, y + 1, w, hh); } catch { /* buzilgan rasm */ }
        doc.setFontSize(7.5);
        doc.setTextColor(...MUTED);
        doc.text(pdfText(`${time(im.created_at)} · ${ui.snapReason(im.reason)}`), x, y + hh + 4.5);
        doc.setTextColor(...DARK);
      });
    }

    if (!full) {
      const lastY = Math.min((doc.lastAutoTable && doc.lastAutoTable.finalY) || y, 270);
      if (lastY < 262 && doc.getCurrentPageInfo().pageNumber === doc.getNumberOfPages()) {
        doc.setFontSize(8.5);
        doc.setTextColor(...MUTED);
        doc.text(pdfText("Ushbu varaqa test natijalaringizni shaffof ko'rsatadi: har bir javobingiz, to'g'ri javob va test davomidagi nazorat qaydlari."), M, 276, { maxWidth: PAGE_W - 2 * M });
        doc.setTextColor(...DARK);
      }
    }
  }

  // ─── Umumiy reyting sahifasi ───
  function summaryPage(doc, list, ui, title) {
    header(doc, title, date(new Date()));
    const done = list.filter(a => a.total > 0);
    const avg = done.length ? Math.round(done.reduce((s, a) => s + percent(a), 0) / done.length) : 0;
    const best = done.length ? Math.max(...done.map(percent)) : 0;
    const flagged = list.filter(a => a.risk === 'medium' || a.risk === 'high').length;
    const bw = (PAGE_W - 2 * M - 9) / 4;
    statBox(doc, M, 30, bw, "O'quvchilar", String(list.length));
    statBox(doc, M + (bw + 3), 30, bw, "O'rtacha natija", `${avg}%`);
    statBox(doc, M + 2 * (bw + 3), 30, bw, 'Eng yuqori', `${best}%`, GREEN_DARK);
    statBox(doc, M + 3 * (bw + 3), 30, bw, 'Shubhali', String(flagged), flagged ? AMBER : GREEN_DARK);

    doc.autoTable({
      ...tableBase,
      startY: 58,
      head: [["O'rin", 'Ism familiya', 'Sinf', 'Ball', '%', 'Baho', 'Qoidabuz.', 'Ogohl.', 'Nazorat', 'Holat']],
      body: ranked(list).map((a, i) => {
        const pct = percent(a);
        return [i + 1, a.student_name, a.class_id, `${a.score}/${a.total}`, `${pct}%`, grade(pct).mark,
          a.violations, warningCount(a), (ui.RISK[a.risk] || ui.RISK.unknown).label,
          (ui.STATUS[a.status] || {}).label || a.status].map(pdfText);
      }),
      styles: { ...tableBase.styles, fontSize: 8 },
      didParseCell: d => {
        if (d.section !== 'body') return;
        if (d.column.index === 0 && d.row.index < 3) {
          d.cell.styles.fontStyle = 'bold';
          d.cell.styles.fillColor = [[254, 240, 138], [226, 232, 240], [254, 215, 170]][d.row.index];
        }
        if (d.column.index === 6 && Number(d.cell.raw) > 0) d.cell.styles.textColor = RED;
        if (d.column.index === 8 && /Yuqori/.test(d.cell.raw)) d.cell.styles.textColor = RED;
      }
    });
  }

  function fileName(base) {
    return `${String(base).replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'hisobot'}.pdf`;
  }

  /**
   * O'quvchi varaqalari yoki to'liq hisobot.
   * list — /api/admin/attempts/report javobi; opts: { full, ui, fetchImage, title, name, onProgress }
   */
  async function students(list, opts) {
    await ensureLib();
    const { full, ui, fetchImage, onProgress } = opts;
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    const order = ranked(list);
    const withSummary = order.length > 1;
    if (withSummary) summaryPage(doc, order, ui, opts.title);

    const perStudent = order.length === 1 ? 12 : 3;
    for (let i = 0; i < order.length; i++) {
      const a = order[i];
      if (withSummary || i > 0) doc.addPage();
      let images = [];
      if (full && fetchImage && a.snapshots.length) {
        // Qoidabuzarlik paytidagi suratlar birinchi
        const pick = [...a.snapshots].sort((x, z) => (z.reason === 'violation') - (x.reason === 'violation')).slice(0, perStudent)
          .sort((x, z) => x.id - z.id);
        images = (await Promise.all(pick.map(s => fetchImage(s.id).then(data => ({ ...s, data })).catch(() => null)))).filter(Boolean);
      }
      studentPage(doc, a, ui, { full, images });
      if (onProgress) onProgress(i + 1, order.length);
    }
    footers(doc);
    doc.save(fileName(opts.name));
  }

  /** Natijalar jadvali (reyting) yoki TOP-3. list — /api/admin/attempts qatorlari */
  async function table(list, opts) {
    await ensureLib();
    const { ui, top3, title } = opts;
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    header(doc, title, date(new Date()));
    const groups = new Map();
    for (const a of list) {
      if (!groups.has(a.class_id)) groups.set(a.class_id, []);
      groups.get(a.class_id).push(a);
    }
    const PLACE = ['1 (Oltin)', '2 (Kumush)', '3 (Bronza)'];
    let y = 32;
    for (const [cls, group] of [...groups.entries()].sort()) {
      let rows = ranked(group);
      if (top3) rows = rows.slice(0, 3);
      if (!rows.length) continue;
      if (y > 250) { doc.addPage(); y = 20; }
      y = sectionTitle(doc, y, `${cls} — ${rows.length} ta o'quvchi`);
      doc.autoTable({
        ...tableBase,
        startY: y + 1,
        head: [["O'rin", 'Ism familiya', 'Ball', '%', 'Baho', 'Qoidabuz.', 'Ogohl.', 'Nazorat', 'Sana']],
        body: rows.map((a, i) => {
          const pct = percent(a);
          return [top3 ? PLACE[i] : i + 1, a.student_name, `${a.score}/${a.total}`, `${pct}%`, grade(pct).mark,
            a.violations, warningCount(a), (ui.RISK[a.risk] || ui.RISK.unknown).label, date(a.started_at)].map(pdfText);
        }),
        didParseCell: d => {
          if (d.section === 'body' && d.column.index === 0 && d.row.index < 3) {
            d.cell.styles.fontStyle = 'bold';
            d.cell.styles.fillColor = [[254, 240, 138], [226, 232, 240], [254, 215, 170]][d.row.index];
          }
          if (d.section === 'body' && d.column.index === 5 && Number(d.cell.raw) > 0) d.cell.styles.textColor = RED;
        }
      });
      y = doc.lastAutoTable.finalY + 10;
    }
    footers(doc);
    doc.save(fileName(opts.name));
  }

  return { ensureLib, pdfText, students, table, warningCount, grade, percent };
})();
