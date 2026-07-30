#!/usr/bin/env node
/**
 * Schrijft config.js bij het uitrollen, uit omgevingsvariabelen.
 *
 * Bedoeld voor de GitHub Actions-workflow, zodat je project-URL en sleutel niet
 * in de repo hoeven te staan. Let op: config.js wordt daarna gewoon aan de
 * browser geserveerd — wat hier in gaat is publiek leesbaar. Dat is precies de
 * reden dat hier alleen de *publiceerbare* sleutel in mag.
 *
 * Gebruik: SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... node tools/write-config.mjs [doelmap]
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const { looksSecret, SECRET_KEY_WARNING } = await import(
  new URL('../js/keycheck.js', import.meta.url).href
);

const url = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const key = (process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();
const target = join(process.argv[2] || '.', 'config.js');

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (!url && !key) {
  // Toch schrijven: anders levert het script-tagje in index.html een 404 op.
  writeFileSync(target, 'window.KAARTJES_SUPABASE = { url: "", anonKey: "" };\n', 'utf8');
  console.log('· SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY niet gezet — config.js blijft leeg (synchroniseren stel je dan in de app in).');
  process.exit(0);
}
if (!url || !key) fail('Zet allebei SUPABASE_URL en SUPABASE_PUBLISHABLE_KEY, of geen van beide.');
if (!/^https:\/\/[\w.-]+/.test(url)) fail(`SUPABASE_URL ziet er niet uit als een https-URL: ${url}`);
if (looksSecret(key)) fail(SECRET_KEY_WARNING);

writeFileSync(
  target,
  `/* Automatisch gegenereerd bij het uitrollen — niet met de hand aanpassen. */\n` +
  `window.KAARTJES_SUPABASE = ${JSON.stringify({ url, anonKey: key }, null, 2)};\n`,
  'utf8'
);
console.log(`✓ ${target} geschreven voor ${url}`);
