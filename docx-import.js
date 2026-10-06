'use strict';
// ─── WORD (.docx) FAYLDAN SAVOLLARNI O'QISH ─────────────────────────────────────
// Test fayli: savol — ro'yxatning 1-darajasi (yoki "1." bilan), variantlar — 2-darajasi (yoki "A)" bilan).
//   Variantsiz savol — yozma javobli. Savoldan oldingi/ichidagi rasm o'sha savolga biriktiriladi.
// Kalit fayli: "7-SINF" sarlavhasi va jadval: Savol № | Variant | To'g'ri javob.
const DocxImport = (() => {
  const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const NS_M = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
  const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const NS_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

  const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻', '+': '⁺', n: 'ⁿ' };
  const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '-': '₋', '+': '₊' };
  const LETTERS = { A: 0, B: 1, C: 2, D: 3, E: 4, А: 0, Б: 1, В: 2, Г: 3, Д: 4 };
  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.crossOrigin = 'anonymous';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Word o\'qish kutubxonasi yuklanmadi'));
      document.head.append(s);
    });
  }

  async function ensureLib() {
    if (!window.JSZip) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
  }

  const clean = s => s.replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
  const norm = s => clean(String(s || '')).toLowerCase().replace(/[‘’ʻʼ`´]/g, "'").replace(/\s+/g, '').replace(/,/g, '.');

  // ─── Fayl → paragraflar va jadvallar ketma-ketligi ───
  async function readDocx(file) {
    const zip = await window.JSZip.loadAsync(file);
    const docXml = zip.file('word/document.xml');
    if (!docXml) throw new Error(`${file.name}: Word (.docx) fayli emas`);
    const dom = new DOMParser().parseFromString(await docXml.async('text'), 'application/xml');

    // Rasm bog'lanishlari (rId -> word/media/...)
    const rels = {};
    const relsFile = zip.file('word/_rels/document.xml.rels');
    if (relsFile) {
      const rd = new DOMParser().parseFromString(await relsFile.async('text'), 'application/xml');
      for (const r of rd.getElementsByTagNameNS(NS_REL, 'Relationship')) rels[r.getAttribute('Id')] = r.getAttribute('Target');
    }
    const imageCache = {};
    async function image(rId) {
      const target = rels[rId];
      if (!target) return null;
      if (imageCache[rId]) return imageCache[rId];
      const path = target.startsWith('/') ? target.slice(1) : 'word/' + target.replace(/^\.\//, '');
      const f = zip.file(path);
      const ext = path.split('.').pop().toLowerCase();
      if (!f || !MIME[ext]) return null;
      imageCache[rId] = `data:${MIME[ext]};base64,` + await f.async('base64');
      return imageCache[rId];
    }

    // Paragraf matni (ustki/pastki indekslar saqlanadi) va undagi rasmlar
    async function paragraph(p) {
      let text = '';
      const images = [];
      const walk = async node => {
        for (const ch of node.childNodes) {
          if (ch.nodeType !== 1) continue;
          const ln = ch.localName;
          if (ch.namespaceURI === NS_W && ln === 't') {
            const rPr = ch.parentNode.getElementsByTagNameNS(NS_W, 'vertAlign')[0];
            const va = rPr && rPr.getAttributeNS(NS_W, 'val');
            const map = va === 'superscript' ? SUP : va === 'subscript' ? SUB : null;
            text += map ? [...ch.textContent].map(c => map[c] || c).join('') : ch.textContent;
          } else if (ch.namespaceURI === NS_W && ln === 'tab') text += ' ';
          else if (ch.namespaceURI === NS_W && (ln === 'br' || ln === 'cr')) text += '\n';
          else if (ch.namespaceURI === NS_M && ln === 't') text += ch.textContent;
          else if (ln === 'blip') {
            const img = await image(ch.getAttributeNS(NS_R, 'embed'));
            if (img) images.push(img);
          } else if (ln === 'imagedata') {
            const img = await image(ch.getAttributeNS(NS_R, 'id'));
            if (img) images.push(img);
          } else if (!(ch.namespaceURI === NS_W && (ln === 'pPr' || ln === 'rPr' || ln === 'instrText' || ln === 'delText'))) {
            await walk(ch);
          }
        }
      };
      await walk(p);
      const numPr = p.getElementsByTagNameNS(NS_W, 'numPr')[0];
      let level = null;
      if (numPr) {
        const il = numPr.getElementsByTagNameNS(NS_W, 'ilvl')[0];
        level = il ? Number(il.getAttributeNS(NS_W, 'val')) || 0 : 0;
      }
      return { kind: 'p', text: clean(text), level, images };
    }

    const body = dom.getElementsByTagNameNS(NS_W, 'body')[0];
    const blocks = [];
    for (const el of body.childNodes) {
      if (el.nodeType !== 1 || el.namespaceURI !== NS_W) continue;
      if (el.localName === 'p') blocks.push(await paragraph(el));
      else if (el.localName === 'tbl') {
        const rows = [];
        for (const tr of el.getElementsByTagNameNS(NS_W, 'tr')) {
          const cells = [];
          for (const tc of tr.getElementsByTagNameNS(NS_W, 'tc')) {
            const parts = [];
            for (const p of tc.getElementsByTagNameNS(NS_W, 'p')) parts.push((await paragraph(p)).text);
            cells.push(clean(parts.join(' ')));
          }
          rows.push(cells);
        }
        blocks.push({ kind: 'table', rows });
      }
    }
    return blocks;
  }

  function gradeOf(text) {
    const m = /(\d{1,2})\s*[-–—]?\s*sinf/i.exec(text || '');
    return m ? Number(m[1]) : null;
  }

  function subjectFromName(name) {
    const base = name.replace(/\.docx$/i, '').replace(/(\d{1,2})\s*[-–—]?\s*sinf(lar)?/ig, '').replace(/[_\-–—]+/g, ' ').trim();
    const word = base.split(/\s+/).filter(Boolean).join(' ');
    return word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : '';
  }

  // ─── Test fayli ───
  function parseTest(blocks, fileName) {
    const warnings = [];
    const questions = [];
    let grade = gradeOf(fileName);
    let pendingImages = [];
    let cur = null;
    const usesNumbering = blocks.some(b => b.kind === 'p' && b.level !== null);

    for (const b of blocks) {
      if (b.kind !== 'p') continue;
      let { text, level } = b;
      // Qo'lda raqamlangan fayllar: "1. Savol", "A) variant"
      if (!usesNumbering && text) {
        const q = /^(\d{1,3})\s*[.)]\s+(.+)$/s.exec(text);
        const o = /^([A-EА-Д])\s*[).]\s+(.+)$/s.exec(text);
        if (q) { level = 0; text = q[2]; } else if (o && cur) { level = 1; text = o[2]; }
      }
      if (level === 0) {
        cur = { text, options: [], images: [...pendingImages, ...b.images] };
        pendingImages = [];
        questions.push(cur);
      } else if (level !== null && level >= 1) {
        if (!cur) { warnings.push(`Savolsiz variant tashlab ketildi: "${text}"`); continue; }
        if (text) cur.options.push(text);
        if (b.images.length) cur.images.push(...b.images);
      } else {
        // Raqamlanmagan paragraf: sarlavha, rasm yoki savolning davomi
        if (!grade && gradeOf(text)) grade = gradeOf(text);
        // Alohida turgan rasm keyingi savolga tegishli (odatda "Rasmda ..." deb boshlanadi)
        if (b.images.length) pendingImages.push(...b.images);
        if (text && cur && !cur.options.length && !gradeOf(text) && questions.length) {
          cur.text += '\n' + text;
        }
      }
    }
    if (pendingImages.length) warnings.push('Fayl oxiridagi rasm hech qaysi savolga biriktirilmadi');
    return {
      grade,
      subject: subjectFromName(fileName),
      questions: questions.map((q, i) => ({
        n: i + 1,
        text: q.text,
        options: q.options,
        type: q.options.length >= 2 ? 'choice' : 'open',
        image: q.images[0] || null,
        extraImages: q.images.length - 1
      })),
      warnings
    };
  }

  // ─── Kalit fayli: { grade: { n: { letter, text } } } ───
  function parseKey(blocks) {
    const key = {};
    let grade = null;
    for (const b of blocks) {
      if (b.kind === 'p') {
        if (gradeOf(b.text)) grade = gradeOf(b.text);
        continue;
      }
      if (!grade) continue;
      const map = key[grade] || (key[grade] = {});
      for (const row of b.rows) {
        const n = parseInt(row[0], 10);
        if (!n) continue; // sarlavha qatori
        const letter = (row.length >= 3 ? row[1] : '').trim().toUpperCase();
        const text = row.length >= 3 ? row[2] : row[1];
        map[n] = { letter: /^[A-EА-Д]$/.test(letter) ? letter : '', text: text || '' };
      }
    }
    return key;
  }

  function isKeyFile(blocks, name) {
    return /kalit|javob|key/i.test(name) || blocks.some(b => b.kind === 'table' && /savol/i.test((b.rows[0] || []).join(' ')));
  }

  // ─── Test + kalit → import uchun to'plam ───
  function combine(test, key, fileName) {
    const errors = [];
    const warnings = [...test.warnings];
    if (!test.grade) errors.push('Sinf aniqlanmadi (fayl nomida yoki sarlavhada "7-sinf" bo\'lishi kerak)');
    if (!test.questions.length) errors.push('Faylda savol topilmadi');
    const k = key && test.grade ? key[test.grade] : null;
    if (!k) errors.push(`Kalitda ${test.grade || '?'}-sinf jadvali topilmadi`);
    const keyCount = k ? Object.keys(k).length : 0;
    if (k && keyCount !== test.questions.length) {
      warnings.push(`Savollar soni (${test.questions.length}) va kalitdagi javoblar soni (${keyCount}) teng emas`);
    }

    const questions = test.questions.map(q => {
      const out = { n: q.n, text: q.text, type: q.type, options: q.options, image: q.image, correct: '' };
      if (q.extraImages > 0) warnings.push(`${q.n}-savolda ${q.extraImages + 1} ta rasm — faqat birinchisi olinadi`);
      const ans = k && k[q.n];
      if (!ans) { errors.push(`${q.n}-savol uchun kalitda javob yo'q`); return out; }
      if (q.type === 'choice') {
        let idx = ans.letter ? LETTERS[ans.letter] : -1;
        if (idx == null || idx < 0 || idx >= q.options.length) {
          idx = q.options.findIndex(o => norm(o) === norm(ans.text));
          if (idx < 0) { errors.push(`${q.n}-savol: kalitdagi "${ans.letter || ans.text}" variant topilmadi`); return out; }
        }
        const byText = q.options.findIndex(o => norm(o) === norm(ans.text));
        if (byText >= 0 && byText !== idx) {
          warnings.push(`${q.n}-savol: kalitdagi harf (${ans.letter}) va matn ("${ans.text}") boshqa variantlarni ko'rsatadi — matn bo'yicha olindi`);
          idx = byText;
        } else if (byText < 0 && ans.text && !norm(ans.text).startsWith(norm(q.options[idx]))) {
          warnings.push(`${q.n}-savol: kalit matni ("${ans.text}") ${ans.letter}-variantdan ("${q.options[idx]}") farq qiladi — harf bo'yicha olindi`);
        }
        out.correct = q.options[idx];
      } else {
        if (!ans.text || ans.text === '—') { errors.push(`${q.n}-savol (yozma): kalitda javob yo'q`); return out; }
        out.correct = ans.text;
      }
      return out;
    });

    return {
      file: fileName,
      class_id: test.grade ? `${test.grade}-sinf` : '',
      subject: test.subject,
      questions,
      errors,
      warnings,
      choiceCount: questions.filter(q => q.type === 'choice').length,
      openCount: questions.filter(q => q.type === 'open').length,
      imageCount: questions.filter(q => q.image).length
    };
  }

  /** Bir nechta .docx (testlar + kalit) → to'plamlar ro'yxati */
  async function parseFiles(files) {
    await ensureLib();
    const tests = [];
    let key = null;
    const keyFiles = [];
    for (const f of files) {
      const blocks = await readDocx(f);
      if (isKeyFile(blocks, f.name)) {
        const k = parseKey(blocks);
        key = { ...(key || {}), ...k };
        keyFiles.push(f.name);
      } else {
        tests.push({ name: f.name, parsed: parseTest(blocks, f.name) });
      }
    }
    const sets = tests.map(t => combine(t.parsed, key, t.name))
      .sort((a, b) => (parseInt(a.class_id, 10) || 0) - (parseInt(b.class_id, 10) || 0));
    return { sets, keyFiles, hasKey: !!key };
  }

  return { parseFiles };
})();
