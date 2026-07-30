/**
 * Herkent Supabase-sleutels die nooit in de browser terecht mogen komen.
 *
 * De publiceerbare sleutel (`sb_publishable_…`, of een oudere JWT met
 * `role: anon`) is bedoeld om publiek te zijn: row level security bepaalt wat
 * ermee kan. De geheime sleutel (`sb_secret_…`, of een JWT met
 * `role: service_role`) omzeilt RLS juist volledig — die hoort alleen op een
 * server, nooit in een pagina die je uitserveert.
 */

function decodeBase64(text) {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  if (typeof atob === 'function') return atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Buffer.from(padded, 'base64').toString('binary');
}

export function looksSecret(value) {
  const key = String(value || '').trim();
  if (/^sb_secret_/i.test(key)) return true;
  if (/service_role/i.test(key)) return true;

  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(decodeBase64(parts[1]));
      if (payload.role && payload.role !== 'anon') return true;
    } catch {
      // Geen leesbare JWT — dan doen we er geen uitspraak over.
    }
  }
  return false;
}

export const SECRET_KEY_WARNING =
  'Dit lijkt een geheime sleutel (sb_secret_… of service_role). Die omzeilt row level security en zou ' +
  'hier voor iedereen leesbaar worden. Gebruik de publiceerbare (anon) sleutel uit Project Settings → API.';
