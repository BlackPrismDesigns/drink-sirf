// Builds the password-protected index.html from manual.html.
//
//   node build-gate.mjs          (asks for the password, without showing it)
//   SIRF_PASSWORD='…' node build-gate.mjs
//
// The manual's HTML is encrypted with AES-256-GCM, using a key derived from the password
// (PBKDF2, SHA-256). The published index.html holds only the ciphertext and a small password
// screen; the manual is decrypted in the browser once the right password is entered. The
// password itself is never written anywhere.

import { readFileSync, writeFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';

const ITERATIONS = 600000;

// Read a line from the terminal without echoing it.
function askHidden(question) {
  return new Promise(resolve => {
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    stdin.on('data', function onData(ch) {
      if (ch === '\r' || ch === '\n') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(value);
      } else if (ch === '\u0003') {
        process.exit(1);
      } else if (ch === '\u007f') {
        value = value.slice(0, -1);
      } else {
        value += ch;
      }
    });
  });
}

let password = process.env.SIRF_PASSWORD;
if (!password) {
  if (!process.stdin.isTTY) {
    console.error('Set SIRF_PASSWORD, or run this in a terminal to be asked for it.');
    process.exit(1);
  }
  password = await askHidden('Password for the manual: ');
  const again = await askHidden('Type it again: ');
  if (password !== again) { console.error('Those didn’t match. Nothing was changed.'); process.exit(1); }
  if (password.length < 6) { console.error('Use at least 6 characters. Nothing was changed.'); process.exit(1); }
}

const manual = readFileSync(new URL('./manual.html', import.meta.url), 'utf8');
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
  base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(manual)));

const b64 = bytes => Buffer.from(bytes).toString('base64');
const wordmark = manual.match(/<symbol id="sirf"[^>]*>([\s\S]*?)<\/symbol>/)[1].trim();

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Sirf Brand Manual</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  :root { --ink: #111111; --paper: #ffffff; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; background: var(--ink); color: var(--paper); }
  body {
    display: grid;
    place-items: center;
    padding: 24px;
    font-family: "Montserrat", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .gate { width: min(100%, 420px); display: grid; gap: 28px; }
  .gate svg { width: 120px; height: auto; fill: var(--paper); }
  .gate h1 { font-size: 14px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; opacity: .6; }
  .gate p { font-size: 18px; line-height: 1.4; }
  form { display: flex; gap: 8px; }
  input {
    flex: 1;
    min-width: 0;
    padding: 14px 18px;
    border: 0;
    border-radius: 999px;
    font: inherit;
    font-size: 17px;
    color: var(--ink);
    background: var(--paper);
  }
  input:focus { outline: 2px solid var(--paper); outline-offset: 3px; }
  button {
    padding: 0 22px;
    border: 1.5px solid var(--paper);
    border-radius: 999px;
    font: inherit;
    font-weight: 600;
    color: var(--paper);
    background: none;
    cursor: pointer;
  }
  button:hover { background: var(--paper); color: var(--ink); }
  .error { min-height: 1.4em; font-size: 15px !important; opacity: .8; }
</style>
</head>
<body>
<main class="gate">
  <svg viewBox="175.14 177.73 246.95 175.88" role="img" aria-label="सिर्फ">${wordmark}</svg>
  <h1>Brand Manual · 2026</h1>
  <p>This manual is private. Enter the password you were given.</p>
  <form id="gate">
    <input id="pw" type="password" autocomplete="current-password" aria-label="Password" placeholder="Password" required autofocus>
    <button type="submit">Open</button>
  </form>
  <p class="error" id="error" role="alert"></p>
</main>
<script>
  const PAYLOAD = { salt: "${b64(salt)}", iv: "${b64(iv)}", data: "${b64(data)}", iterations: ${ITERATIONS} };
  const bytes = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const KEEP = 'sirf-manual-key';

  async function keyFrom(password) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: bytes(PAYLOAD.salt), iterations: PAYLOAD.iterations, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, true, ['decrypt']);
  }

  async function open(key) {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(PAYLOAD.iv) }, key, bytes(PAYLOAD.data));
    document.open();
    document.write(new TextDecoder().decode(plain));
    document.close();
  }

  // Once opened, the key is kept for this browser tab only, so a reload doesn't ask again.
  (async () => {
    try {
      const saved = sessionStorage.getItem(KEEP);
      if (saved) await open(await crypto.subtle.importKey('raw', bytes(saved), 'AES-GCM', false, ['decrypt']));
    } catch (e) { try { sessionStorage.removeItem(KEEP); } catch (_) {} }
  })();

  document.getElementById('gate').addEventListener('submit', async e => {
    e.preventDefault();
    const error = document.getElementById('error');
    error.textContent = 'Opening…';
    try {
      const key = await keyFrom(document.getElementById('pw').value);
      const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
      await open(key);
      try { sessionStorage.setItem(KEEP, btoa(String.fromCharCode(...raw))); } catch (_) {}
    } catch (err) {
      error.textContent = 'That’s not it. Try again.';
    }
  });
</script>
</body>
</html>
`;

writeFileSync(new URL('./index.html', import.meta.url), page);
console.log(`index.html written: ${(page.length / 1024).toFixed(0)} KB, manual encrypted.`);
