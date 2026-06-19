const STORAGE_KEY = 'angel.gui.locale';

// Legacy region-coded locales migrate to BCP 47 script subtags so the saved
// values stay neutral (no CN/TW region codes). Old localStorage values are
// remapped transparently on read.
const LEGACY_LOCALE_ALIASES = {
  'zh-CN': 'zh-Hans',
  'zh-TW': 'zh-Hant',
};

function normalizeLocale(locale) {
  const value = String(locale || '').trim();
  return LEGACY_LOCALE_ALIASES[value] || value || 'en';
}

const localeCache = new Map();
let currentLocale = 'en';
let currentMessages = {};
let fallbackMessages = {};

async function fetchLocaleJson(locale) {
  const cached = localeCache.get(locale);
  if (cached) return cached;
  const response = await fetch(`./locales/${locale}.json`, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Failed to load locale: ${locale}`);
  }
  const json = await response.json();
  localeCache.set(locale, json || {});
  return json || {};
}

export function getSavedLocale(storage = window.localStorage) {
  try {
    const value = storage?.getItem?.(STORAGE_KEY);
    return normalizeLocale(value);
  } catch (_) {
    return 'en';
  }
}

export function saveLocale(locale, storage = window.localStorage) {
  try {
    storage?.setItem?.(STORAGE_KEY, normalizeLocale(locale));
  } catch (_) {}
}

export function getLocale() {
  return currentLocale;
}

export async function initI18n(locale) {
  fallbackMessages = await fetchLocaleJson('en');
  const targetLocale = normalizeLocale(locale);
  if (targetLocale === 'en') {
    currentMessages = fallbackMessages;
  } else {
    try {
      currentMessages = await fetchLocaleJson(targetLocale);
    } catch (_) {
      // Unknown or unavailable locale: fall back to English instead of failing.
      currentMessages = fallbackMessages;
    }
  }
  currentLocale = targetLocale;
  return currentLocale;
}

export function t(key, params = {}) {
  const raw = currentMessages[key] ?? fallbackMessages[key] ?? key;
  return Object.entries(params).reduce((text, [name, value]) => (
    String(text).replaceAll(`{${name}}`, String(value))
  ), String(raw));
}

export function applyTranslations(root = document) {
  if (!root?.querySelectorAll) return;

  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (!key) return;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      el.value = t(key);
    } else {
      el.textContent = t(key);
    }
  });

  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    if (!key) return;
    el.setAttribute('placeholder', t(key));
  });

  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.dataset.i18nTitle;
    if (!key) return;
    el.setAttribute('title', t(key));
  });

  root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    const key = el.dataset.i18nAriaLabel;
    if (!key) return;
    el.setAttribute('aria-label', t(key));
  });
}
