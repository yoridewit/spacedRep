/**
 * Versie van de app. Handmatig ophogen bij een wijziging die je op je toestel
 * wilt kunnen herkennen; commit en bouwtijd komen er automatisch bij als de
 * uitrol config.js genereert (zie tools/write-config.mjs).
 */

export const APP_VERSION = '1.3.0';

export function buildInfo() {
  const build = globalThis.KAARTJES_BUILD || {};
  return {
    version: APP_VERSION,
    commit: typeof build.commit === 'string' ? build.commit.slice(0, 7) : null,
    builtAt: Number.isFinite(build.builtAt) ? new Date(build.builtAt) : null,
  };
}

/** Korte regel voor het instellingenscherm. */
export function versionLine() {
  const { version, commit, builtAt } = buildInfo();
  const parts = [`versie ${version}`];
  if (commit) parts.push(commit);
  if (builtAt) {
    parts.push(new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }).format(builtAt));
  }
  return parts.join(' · ');
}

// Handig om even in de console te controleren welke versie je voor je hebt.
globalThis.KAARTJES_VERSION = APP_VERSION;
