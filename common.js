'use strict';
// ─── UMUMIY YORDAMCHILAR (o'quvchi va admin sahifalari uchun) ─────────────────

const API_BASE = String((window.STEAM_CONFIG && window.STEAM_CONFIG.API_URL) || '').replace(/\/+$/, '');

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function api(path, opts = {}) {
  const { method = 'GET', body, token, attempt, keepalive = false, raw = false } = opts;
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  if (attempt) headers['X-Attempt-Token'] = attempt;

  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      keepalive
    });
  } catch {
    throw new ApiError('Serverga ulanib bo\'lmadi. Internetni tekshiring.', 0);
  }
  if (raw && res.ok) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Server xatosi (${res.status})`, res.status, data);
  return data;
}

// Xavfsiz DOM yaratish: matn har doim textContent orqali qo'yiladi (XSS bo'lmaydi)
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

const icon = name => h('i', { class: 'ri-' + name, 'aria-hidden': 'true' });
const $ = id => document.getElementById(id);

function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

function makeStore(getStorage) {
  return {
    get(k) { try { return getStorage().getItem(k); } catch { return null; } },
    set(k, v) { try { getStorage().setItem(k, v); } catch { /* private mode */ } },
    del(k) { try { getStorage().removeItem(k); } catch { /* private mode */ } }
  };
}
// Test sessiyasi brauzer yopilsa ham saqlanadi (telefon varaqni o'chirib yuborsa davom etish uchun)
const store = makeStore(() => localStorage);
// Admin tokeni varaq yopilishi bilan o'chadi
const sessionStore = makeStore(() => sessionStorage);

function toast(message, type = 'info', ms = 3500) {
  let box = $('toasts');
  if (!box) {
    box = h('div', { id: 'toasts', class: 'toasts', 'aria-live': 'polite' });
    document.body.append(box);
  }
  const icons = { info: 'information-line', success: 'checkbox-circle-line', error: 'error-warning-line', warn: 'alert-line' };
  const t = h('div', { class: 'toast toast-' + type, role: type === 'error' ? 'alert' : 'status' },
    icon(icons[type] || icons.info), h('span', { text: message }));
  box.append(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 300);
  }, ms);
}

const pad = n => String(n).padStart(2, '0');

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d)) return '—';
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtSec(ms) {
  if (ms == null) return '—';
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} daq ${s % 60} s`;
}

// ─── MODAL OYNALAR ───────────────────────────────────────────────────────────
function openModal({ title, body, actions = [], wide = false, onClose }) {
  const close = () => {
    document.removeEventListener('keydown', onKey);
    wrap.remove();
    if (onClose) onClose();
  };
  const onKey = e => { if (e.key === 'Escape') close(); };
  const box = h('div', { class: 'modal-box' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'modal-head' },
      h('h3', { text: title }),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Yopish', onclick: close }, icon('close-line'))),
    h('div', { class: 'modal-body' }, body),
    actions.length ? h('div', { class: 'modal-actions' }, actions) : null);
  const wrap = h('div', { class: 'modal', onclick: e => { if (e.target === wrap) close(); } }, box);
  document.body.append(wrap);
  document.addEventListener('keydown', onKey);
  const focusable = box.querySelector('input, select, textarea');
  if (focusable) setTimeout(() => focusable.focus(), 50);
  return close;
}

function confirmDialog(message, { title = 'Tasdiqlang', okText = 'Ha', danger = false } = {}) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    const close = openModal({
      title,
      body: h('p', { text: message }),
      onClose: () => finish(false),
      actions: [
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => close() }, 'Bekor qilish'),
        h('button', { class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'), type: 'button',
          onclick: () => { finish(true); close(); } }, okText)
      ]
    });
  });
}

function promptPassword(message, { title = 'Parolni tasdiqlang', okText = 'Tasdiqlash', danger = false } = {}) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    const input = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Admin paroli' });
    const submit = () => { if (input.value) { finish(input.value); close(); } };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    const close = openModal({
      title,
      body: h('div', {}, h('p', { text: message }), input),
      onClose: () => finish(null),
      actions: [
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => close() }, 'Bekor qilish'),
        h('button', { class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'), type: 'button', onclick: submit }, okText)
      ]
    });
  });
}

// ─── VARAQLAR ARO ALOQA (bir vaqtda bir nechta varaq ochilganini aniqlash) ────
const spChannel = 'BroadcastChannel' in window ? new BroadcastChannel('steam-plaza') : null;
