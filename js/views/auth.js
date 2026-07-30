/**
 * Inlogscherm. Verschijnt vóór de app zolang je niet ingelogd bent en nog niet
 * hebt gekozen om zonder account door te gaan.
 *
 * Drie standen: inloggen, account maken en wachtwoord vergeten. Plus het
 * scherm waarop je na een herstelmail een nieuw wachtwoord kiest.
 */

import * as sync from '../sync.js';
import { el, clear, appendAll, toast } from '../ui.js';
import { versionLine } from '../version.js';
import { navigate, refresh } from '../app.js';

function shell(children) {
  return el('div', { class: 'auth' }, [
    el('div', { class: 'auth-card' }, children),
    el('p', { class: 'small muted', style: 'text-align:center;margin-top:var(--space-4)', text: `Kaartjes ${versionLine()}` }),
  ]);
}

export function mount(root, params = {}) {
  root.classList.add('view-auth');
  const box = el('div');
  root.append(box);

  let mode = params.mode === 'herstel' ? 'herstel' : 'in'; // in | aanmelden | vergeten | herstel
  const status = el('div');

  function note(message, kind = 'ok') {
    clear(status).append(el('div', { class: `notice ${kind}`, style: 'margin:var(--space-3) 0 0', text: message }));
  }

  function busy(button, label) {
    button.disabled = true;
    button.dataset.label = button.textContent;
    button.textContent = label;
    return () => {
      button.disabled = false;
      button.textContent = button.dataset.label;
    };
  }

  function tabs() {
    const tab = (id, label) =>
      el('button', {
        class: `auth-tab ${mode === id ? 'is-active' : ''}`,
        onclick: () => { mode = id; clear(status); render(); },
        text: label,
      });
    return el('div', { class: 'auth-tabs' }, [tab('in', 'Inloggen'), tab('aanmelden', 'Account maken')]);
  }

  function credentials() {
    const email = el('input', {
      class: 'input', type: 'email', placeholder: 'je@email.nl',
      autocapitalize: 'off', autocorrect: 'off', autocomplete: 'username',
    });
    const password = el('input', {
      class: 'input', type: 'password', placeholder: 'wachtwoord',
      autocomplete: mode === 'aanmelden' ? 'new-password' : 'current-password',
    });
    return { email, password };
  }

  function renderSignIn() {
    const { email, password } = credentials();
    const submit = async (event) => {
      event?.preventDefault?.();
      if (!email.value.trim() || !password.value) return note('Vul je e-mailadres en wachtwoord in.', 'warn');
      const done = busy(button, 'Bezig…');
      try {
        if (mode === 'in') {
          await sync.signIn(email.value, password.value);
        } else {
          const { confirmationNeeded } = await sync.signUp(email.value, password.value);
          if (confirmationNeeded) {
            done();
            return note('Account aangemaakt. Bevestig je e-mailadres via de mail die je krijgt en log daarna in.', 'warn');
          }
        }
        note('Even synchroniseren…');
        await sync.syncQuietly();
        toast('Welkom terug');
        navigate('#/');
        refresh();
      } catch (err) {
        done();
        note(err.message, 'error');
      }
    };

    const button = el('button', {
      type: 'submit',
      class: 'btn btn-primary btn-block',
      text: mode === 'in' ? 'Inloggen' : 'Account maken',
    });

    return shell([
      el('h1', { class: 'auth-title', text: 'Kaartjes' }),
      el('p', { class: 'muted', style: 'text-align:center', text: 'Leer je stof met flashcards en spaced repetition.' }),
      tabs(),
      el('form', { onsubmit: submit }, [
        el('label', { class: 'field' }, [el('span', { class: 'label', text: 'E-mail' }), email]),
        el('label', { class: 'field' }, [el('span', { class: 'label', text: 'Wachtwoord' }), password]),
        button,
      ]),
      mode === 'in'
        ? el('button', {
            class: 'btn btn-ghost btn-block',
            text: 'Wachtwoord vergeten?',
            onclick: () => { mode = 'vergeten'; clear(status); render(); },
          })
        : null,
      status,
      el('hr', { class: 'auth-divider' }),
      el('button', {
        class: 'btn btn-secondary btn-block',
        text: 'Doorgaan zonder inloggen',
        onclick: () => {
          sync.skipAuth(true);
          toast('Je werkt nu alleen op dit apparaat');
          navigate('#/');
          refresh();
        },
      }),
      el('p', { class: 'small muted', style: 'text-align:center;margin:var(--space-2) 0 0', text: 'Zonder account blijven je kaarten en voortgang alleen op dit apparaat staan. Er wordt niets gesynchroniseerd tussen je telefoon en je pc.' }),
    ]);
  }

  function renderForgot() {
    const email = el('input', {
      class: 'input', type: 'email', placeholder: 'je@email.nl',
      autocapitalize: 'off', autocorrect: 'off', autocomplete: 'username',
    });
    const button = el('button', { type: 'submit', class: 'btn btn-primary btn-block', text: 'Stuur herstelmail' });

    const submit = async (event) => {
      event?.preventDefault?.();
      if (!email.value.trim()) return note('Vul je e-mailadres in.', 'warn');
      const done = busy(button, 'Bezig…');
      try {
        await sync.requestPasswordReset(email.value);
        done();
        note('Er is een mail onderweg. Klik op de link daarin om een nieuw wachtwoord te kiezen.');
      } catch (err) {
        done();
        note(err.message, 'error');
      }
    };

    return shell([
      el('h1', { class: 'auth-title', text: 'Wachtwoord vergeten' }),
      el('p', { class: 'muted', style: 'text-align:center', text: 'Vul je e-mailadres in, dan sturen we je een link om een nieuw wachtwoord te kiezen.' }),
      el('form', { onsubmit: submit }, [
        el('label', { class: 'field' }, [el('span', { class: 'label', text: 'E-mail' }), email]),
        button,
      ]),
      status,
      el('button', {
        class: 'btn btn-ghost btn-block',
        text: '‹ Terug naar inloggen',
        onclick: () => { mode = 'in'; clear(status); render(); },
      }),
    ]);
  }

  function renderReset() {
    const password = el('input', { class: 'input', type: 'password', placeholder: 'nieuw wachtwoord', autocomplete: 'new-password' });
    const again = el('input', { class: 'input', type: 'password', placeholder: 'nog een keer', autocomplete: 'new-password' });
    const button = el('button', { type: 'submit', class: 'btn btn-primary btn-block', text: 'Wachtwoord opslaan' });

    const submit = async (event) => {
      event?.preventDefault?.();
      if (password.value !== again.value) return note('De twee wachtwoorden zijn niet gelijk.', 'warn');
      const done = busy(button, 'Bezig…');
      try {
        await sync.updatePassword(password.value);
        toast('Wachtwoord opgeslagen');
        await sync.syncQuietly();
        navigate('#/');
        refresh();
      } catch (err) {
        done();
        note(err.message, 'error');
      }
    };

    return shell([
      el('h1', { class: 'auth-title', text: 'Nieuw wachtwoord' }),
      el('p', { class: 'muted', style: 'text-align:center', text: `Kies een nieuw wachtwoord voor ${sync.getSession()?.email || 'je account'}.` }),
      el('form', { onsubmit: submit }, [
        el('label', { class: 'field' }, [el('span', { class: 'label', text: 'Nieuw wachtwoord' }), password]),
        el('label', { class: 'field' }, [el('span', { class: 'label', text: 'Herhaal' }), again]),
        button,
      ]),
      status,
    ]);
  }

  function render() {
    clear(box);
    if (mode === 'herstel') return appendAll(box, renderReset());
    if (mode === 'vergeten') return appendAll(box, renderForgot());
    return appendAll(box, renderSignIn());
  }

  render();
  return () => root.classList.remove('view-auth');
}
