import { create } from 'zustand';

import { playUiSound } from '@/audio/uiSounds';
import { useChatNotificationStore } from '@/store/chatNotificationStore';

export interface PrivateChatMessage {
  id: string;
  from: 'me' | 'them';
  text: string;
  timestamp: string;
}

const MOCK_REPLIES = [
  'Понял. Давай обсудим это без свидетелей.',
  'У меня есть информация — но не для общего чата.',
  'Ты уверен, что нам можно доверять?',
  'Я видел странную активность у терминала.',
  'Не говори об этом за столом.',
  'Можем созвониться позже в кулуарах.',
];

function formatChatTime(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function seedThread(partnerName: string): PrivateChatMessage[] {
  const base = Date.now() - 18 * 60_000;
  const stamps = [0, 2, 5].map((min) =>
    formatChatTime(new Date(base + min * 60_000)),
  );

  return [
    {
      id: 'seed-1',
      from: 'them',
      text: `Привет. Это ${partnerName}. Нужно поговорить без лишних ушей.`,
      timestamp: stamps[0]!,
    },
    {
      id: 'seed-2',
      from: 'me',
      text: 'Слушаю. Что ты знаешь о последнем инциденте?',
      timestamp: stamps[1]!,
    },
    {
      id: 'seed-3',
      from: 'them',
      text: 'Вентиляция в секторе C работала на обратной тяге. Это не случайность.',
      timestamp: stamps[2]!,
    },
  ];
}

interface PrivateChatStore {
  threads: Record<string, PrivateChatMessage[]>;
  unread: Record<string, number>;
  activePartnerId: string | null;
  seededPartners: Record<string, boolean>;
  setActivePartner: (playerId: string | null) => void;
  ensureThread: (playerId: string, partnerName: string) => void;
  markRead: (playerId: string) => void;
  sendMessage: (playerId: string, partnerName: string, text: string) => void;
  receiveMessage: (
    playerId: string,
    partnerName: string,
    text: string,
    options?: { silent?: boolean },
  ) => void;
  reset: () => void;
}

const initialPrivateChatState = {
  threads: {} as Record<string, PrivateChatMessage[]>,
  unread: {} as Record<string, number>,
  activePartnerId: null as string | null,
  seededPartners: {} as Record<string, boolean>,
};

export const usePrivateChatStore = create<PrivateChatStore>((set, get) => ({
  ...initialPrivateChatState,

  setActivePartner: (playerId) => {
    if (get().activePartnerId === playerId) {
      if (playerId) get().markRead(playerId);
      return;
    }
    set({ activePartnerId: playerId });
    if (playerId) get().markRead(playerId);
  },

  ensureThread: (playerId, partnerName) => {
    const { threads, seededPartners } = get();
    if (seededPartners[playerId]) return;

    set({
      threads: {
        ...threads,
        [playerId]: threads[playerId] ?? seedThread(partnerName),
      },
      seededPartners: { ...seededPartners, [playerId]: true },
    });
  },

  markRead: (playerId) =>
    set((state) => ({
      unread: { ...state.unread, [playerId]: 0 },
    })),

  sendMessage: (playerId, partnerName, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const message: PrivateChatMessage = {
      id: `me-${Date.now()}`,
      from: 'me',
      text: trimmed,
      timestamp: formatChatTime(new Date()),
    };

    set((state) => ({
      threads: {
        ...state.threads,
        [playerId]: [...(state.threads[playerId] ?? []), message],
      },
    }));

    playUiSound('chatSend');

    window.setTimeout(() => {
      const reply =
        MOCK_REPLIES[Math.floor(Math.random() * MOCK_REPLIES.length)] ??
        MOCK_REPLIES[0]!;
      get().receiveMessage(playerId, partnerName, reply);
    }, 1400 + Math.random() * 1800);
  },

  receiveMessage: (playerId, partnerName, text, options) => {
    get().ensureThread(playerId, partnerName);

    const message: PrivateChatMessage = {
      id: `them-${Date.now()}`,
      from: 'them',
      text,
      timestamp: formatChatTime(new Date()),
    };

    const { activePartnerId } = get();
    const isActiveChat = activePartnerId === playerId;

    set((state) => ({
      threads: {
        ...state.threads,
        [playerId]: [...(state.threads[playerId] ?? []), message],
      },
      unread: isActiveChat
        ? state.unread
        : {
            ...state.unread,
            [playerId]: (state.unread[playerId] ?? 0) + 1,
          },
    }));

    if (options?.silent) return;

    playUiSound('chatReceive');

    if (!isActiveChat) {
      useChatNotificationStore.getState().push({
        kind: 'private',
        title: partnerName,
        body: text,
        playerId,
      });
    }
  },

  reset: () => set(initialPrivateChatState),
}));
