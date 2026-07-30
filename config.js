/**
 * Supabase-gegevens van dit exemplaar van de app.
 *
 * Vul je project-URL en de *publiceerbare* (anon) sleutel hier in, dan hoef je
 * op een nieuw apparaat alleen nog in te loggen. Die sleutel is bedoeld om
 * publiek te zijn: je gegevens worden beschermd door row level security (zie
 * supabase/schema.sql), niet doordat deze sleutel geheim blijft.
 *
 * Nooit de geheime sleutel (sb_secret_… of service_role) hier neerzetten: dit
 * bestand wordt aan iedere bezoeker geserveerd, en die sleutel omzeilt RLS.
 * De app en de uitrol-workflow weigeren hem ook.
 *
 * Wil je deze gegevens niet in de repo? Laat het leeg en gebruik de
 * GitHub Actions-workflow (.github/workflows/deploy.yml), of vul het in de app
 * in onder Instellingen → Synchroniseren.
 */
window.KAARTJES_SUPABASE = {
  url: '',
  anonKey: '',
};

// Wordt bij het uitrollen overschreven met commit en bouwtijd.
window.KAARTJES_BUILD = { commit: null, builtAt: null };
