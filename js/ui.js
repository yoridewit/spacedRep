/** Kleine UI-hulpjes: elementen bouwen, toasts, dialogen, deel-links. */

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

let toastTimer = null;
export function toast(message, ms = 2400) {
  const node = document.getElementById('toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), ms);
}

/**
 * Opent de modale dialoog. `build(done)` levert de inhoud; roep `done(waarde)`
 * aan om te sluiten. Sluiten met Esc levert `null`.
 */
export function dialog(build) {
  const node = document.getElementById('dialog');
  clear(node);
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      node.close();
      resolve(value);
    };
    node.append(build(done));
    node.addEventListener('close', () => done(null), { once: true });
    node.showModal();
    node.querySelector('input, textarea, button')?.focus();
  });
}

export function confirmDialog({ title, message, confirmLabel = 'Doorgaan', danger = false }) {
  return dialog((done) =>
    el('form', { method: 'dialog', onsubmit: (e) => e.preventDefault() }, [
      el('h3', { text: title }),
      message ? el('p', { text: message }) : null,
      el('div', { class: 'row', style: 'flex-wrap:nowrap' }, [
        el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => done(false), text: 'Annuleren' }),
        el('button', {
          type: 'button',
          class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`,
          onclick: () => done(true),
          text: confirmLabel,
        }),
      ]),
    ]));
}

export function promptDialog({ title, message, value = '', placeholder = '', confirmLabel = 'Opslaan', multiline = false }) {
  return dialog((done) => {
    const input = multiline
      ? el('textarea', { class: 'input', placeholder, style: 'min-height:120px' })
      : el('input', { class: 'input', type: 'text', placeholder });
    input.value = value;
    const submit = () => done(input.value.trim() ? input.value : null);
    if (!multiline) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
      });
    }
    return el('form', { method: 'dialog', onsubmit: (e) => { e.preventDefault(); submit(); } }, [
      el('h3', { text: title }),
      message ? el('p', { text: message }) : null,
      input,
      el('div', { class: 'row' }, [
        el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => done(null), text: 'Annuleren' }),
        el('button', { type: 'submit', class: 'btn btn-primary', text: confirmLabel }),
      ]),
    ]);
  });
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Safari weigert dit soms buiten een directe tik; dan maar een selecteerbaar veld.
    const area = el('textarea', { style: 'position:fixed;top:-1000px' });
    area.value = text;
    document.body.append(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    area.remove();
    return ok;
  }
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = el('a', { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickFile(accept = '.json,.txt,.md,.csv,.tsv,application/json,text/plain') {
  return new Promise((resolve) => {
    const input = el('input', { type: 'file', accept, style: 'display:none' });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return resolve(null);
      resolve({ name: file.name, text: await file.text() });
    });
    document.body.append(input);
    input.click();
  });
}

// ---------- deel-links (deck in een URL) ----------

const b64 = {
  encode(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(text) {
    const padded = text.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  },
};

async function squeeze(bytes, mode) {
  const Stream = mode === 'deflate' ? globalThis.CompressionStream : globalThis.DecompressionStream;
  if (!Stream) return null;
  const stream = new Blob([bytes]).stream().pipeThrough(new Stream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Maakt een link waarmee je een deck op een ander toestel opent. */
export async function encodeShare(payload) {
  const raw = new TextEncoder().encode(JSON.stringify(payload));
  const packed = await squeeze(raw, 'deflate');
  return packed ? `z${b64.encode(packed)}` : `r${b64.encode(raw)}`;
}

export async function decodeShare(token) {
  const marker = token[0];
  const bytes = b64.decode(token.slice(1));
  const raw = marker === 'z' ? await squeeze(bytes, 'inflate') : bytes;
  if (!raw) throw new Error('Deze browser kan de link niet uitpakken.');
  return JSON.parse(new TextDecoder().decode(raw));
}

export function plural(n, singular, pluralForm) {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

export function formatDate(date) {
  return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' }).format(date);
}
