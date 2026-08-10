import { create } from 'zustand';

export type AppLanguage = 'en' | 'ru';

const STORAGE_KEY = 'turing_language';

function readStoredLanguage(): AppLanguage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'en' || raw === 'ru') return raw;
  } catch {
    /* ignore */
  }
  return 'en';
}

interface SettingsState {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  language: readStoredLanguage(),
  setLanguage: (language) => {
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      /* ignore */
    }
    set({ language });
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
    }
  },
}));

// Sync <html lang> on boot
if (typeof document !== 'undefined') {
  document.documentElement.lang = useSettingsStore.getState().language;
}
