(function() {
  let loadedLanguage = null;
  let messagesDict = null; // { key: { message: string } }

  function formatWithSubs(template, substitutions) {
    if (!template) return '';
    if (!substitutions) return template;
    const subs = Array.isArray(substitutions) ? substitutions : [substitutions];
    return subs.reduce((acc, val, idx) => acc.replace(new RegExp('\\$' + (idx + 1), 'g'), String(val)), template);
  }

  async function loadMessagesForLanguage(languageCode) {
    try {
      const url = chrome.runtime.getURL(`_locales/${languageCode}/messages.json`);
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load messages for ' + languageCode);
      messagesDict = await res.json();
      loadedLanguage = languageCode;
    } catch (e) {
      messagesDict = null;
      loadedLanguage = null;
    }
  }

  async function ensureLanguageLoaded() {
    try {
      const { language = 'ro' } = await chrome.storage.sync.get('language');
      if (language !== loadedLanguage) {
        await loadMessagesForLanguage(language);
      }
    } catch {
      // ignore
    }
  }

  function i18nGet(key, substitutions) {
    if (messagesDict && key && Object.prototype.hasOwnProperty.call(messagesDict, key)) {
      return formatWithSubs(messagesDict[key]?.message || '', substitutions);
    }
    try {
      const v = chrome.i18n.getMessage(key, substitutions);
      if (v) return v;
    } catch {}
    return '';
  }

  function setIfPresent(el, attr, key) {
    if (!key) return;
    const msg = i18nGet(key);
    if (!msg) return;
    if (attr === 'text') {
      el.textContent = msg;
    } else if (attr === 'html') {
      el.innerHTML = msg;
    } else if (attr === 'placeholder') {
      el.setAttribute('placeholder', msg);
    } else if (attr === 'title') {
      el.setAttribute('title', msg);
    } else if (attr === 'aria-label') {
      el.setAttribute('aria-label', msg);
    } else if (attr === 'aria-labelledby') {
      el.setAttribute('aria-labelledby', msg);
    }
  }

  async function applyI18n(root) {
    await ensureLanguageLoaded();
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach(el => {
      setIfPresent(el, 'text', el.getAttribute('data-i18n'));
    });
    const attrNames = ['placeholder', 'title', 'aria-label', 'aria-labelledby', 'html'];
    attrNames.forEach(attr => {
      scope.querySelectorAll(`[data-i18n-${attr}]`).forEach(el => {
        setIfPresent(el, attr, el.getAttribute(`data-i18n-${attr}`));
      });
    });
    const titleEl = scope.querySelector('title[data-i18n]');
    if (titleEl) {
      const t = i18nGet(titleEl.getAttribute('data-i18n'));
      if (t) document.title = t;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => applyI18n());
  } else {
    applyI18n();
  }

  // React to language changes at runtime
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.language) {
      loadedLanguage = null; // force reload
      applyI18n();
    }
  });

  window.applyI18n = applyI18n;
  window.i18nGet = i18nGet;
})();
