import { create } from 'zustand';

export interface ChatNotificationItem {
  id: string;
  kind: 'general' | 'private';
  title: string;
  body: string;
  playerId?: string;
  createdAt: number;
}

interface ChatNotificationStore {
  items: ChatNotificationItem[];
  push: (item: Omit<ChatNotificationItem, 'id' | 'createdAt'>) => void;
  dismiss: (id: string) => void;
}

const AUTO_DISMISS_MS = 6000;

export const useChatNotificationStore = create<ChatNotificationStore>((set, get) => ({
  items: [],

  push: (item) => {
    const id = crypto.randomUUID();
    set((state) => ({
      items: [...state.items, { ...item, id, createdAt: Date.now() }].slice(-4),
    }));

    window.setTimeout(() => {
      get().dismiss(id);
    }, AUTO_DISMISS_MS);
  },

  dismiss: (id) =>
    set((state) => ({
      items: state.items.filter((entry) => entry.id !== id),
    })),
}));
