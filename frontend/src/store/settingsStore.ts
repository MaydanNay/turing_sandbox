import { create } from 'zustand';

export type AppLanguage = 'en' | 'ru';

const LANGUAGE_KEY = 'turing_language';
const SOUND_ENABLED_KEY = 'turing_sound_enabled';
const SOUND_VOLUME_KEY = 'turing_sound_volume';

function readStoredLanguage(): AppLanguage {
  try {
    const raw = localStorage.getItem(LANGUAGE_KEY);
    if (raw === 'en' || raw === 'ru') return raw;
  } catch {
    /* ignore */
  }
  return 'en';
}

function readStoredSoundEnabled(): boolean {
  try {
    const raw = localStorage.getItem(SOUND_ENABLED_KEY);
    if (raw === '0' || raw === 'false') return false;
    if (raw === '1' || raw === 'true') return true;
  } catch {
    /* ignore */
  }
  return true;
}

function readStoredSoundVolume(): number {
  try {
    const raw = localStorage.getItem(SOUND_VOLUME_KEY);
    if (raw == null) return 1;
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.min(1, Math.max(0, n));
  } catch {
    /* ignore */
  }
  return 1;
}

interface SettingsState {
  language: AppLanguage;
  soundEnabled: boolean;
  /** 0–1 master UI volume */
  soundVolume: number;
  setLanguage: (language: AppLanguage) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setSoundVolume: (volume: number) => void;
  toggleSound: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  language: readStoredLanguage(),
  soundEnabled: readStoredSoundEnabled(),
  soundVolume: readStoredSoundVolume(),

  setLanguage: (language) => {
    try {
      localStorage.setItem(LANGUAGE_KEY, language);
    } catch {
      /* ignore */
    }
    set({ language });
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
    }
  },

  setSoundEnabled: (enabled) => {
    try {
      localStorage.setItem(SOUND_ENABLED_KEY, enabled ? '1' : '0');
    } catch {
      /* ignore */
    }
    set({ soundEnabled: enabled });
  },

  setSoundVolume: (volume) => {
    const clamped = Math.min(1, Math.max(0, volume));
    try {
      localStorage.setItem(SOUND_VOLUME_KEY, String(clamped));
    } catch {
      /* ignore */
    }
    set({ soundVolume: clamped });
    if (clamped > 0 && !get().soundEnabled) {
      get().setSoundEnabled(true);
    }
  },

  toggleSound: () => {
    get().setSoundEnabled(!get().soundEnabled);
  },
}));

if (typeof document !== 'undefined') {
  document.documentElement.lang = useSettingsStore.getState().language;
}
