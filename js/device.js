/**
 * Een id per apparaat (eigenlijk: per browserprofiel). Blijft bewust buiten de
 * gesynchroniseerde gegevens — anders zouden twee apparaten hetzelfde id delen
 * en telt hun dagstatistiek weer op één hoop.
 */

const KEY = 'kaartjes.device.v1';

let cached = null;

export function deviceId() {
  if (cached) return cached;
  try {
    cached = localStorage.getItem(KEY);
    if (!cached) {
      const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      cached = `dev_${random.replace(/-/g, '').slice(0, 12)}`;
      localStorage.setItem(KEY, cached);
    }
  } catch {
    cached = 'dev_tijdelijk'; // privémodus zonder opslag
  }
  return cached;
}
