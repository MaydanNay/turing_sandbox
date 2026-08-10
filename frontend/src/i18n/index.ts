import { useCallback } from 'react';

import { en } from '@/i18n/en';
import { ru } from '@/i18n/ru';
import type { TranslationKey, Translations } from '@/i18n/types';
import { useSettingsStore, type AppLanguage } from '@/store/settingsStore';

const catalogs: Record<AppLanguage, Translations> = { en, ru };

export function translate(
  language: AppLanguage,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  const table = catalogs[language] ?? en;
  let text = table[key] ?? en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

export function useT() {
  const language = useSettingsStore((s) => s.language);
  return useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) =>
      translate(language, key, vars),
    [language],
  );
}

export function useLanguage(): AppLanguage {
  return useSettingsStore((s) => s.language);
}
