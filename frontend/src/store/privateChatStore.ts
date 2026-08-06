import { create } from 'zustand';

import { playUiSound } from '@/audio/uiSounds';
import { useChatNotificationStore } from '@/store/chatNotificationStore';
import type { BackendPrivateThreadMessage } from '@/types/game';

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

function formatTs(ts?: string): string {
  if (!ts) return formatChatTime(new Date());
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return formatChatTime(new Date());
  return formatChatTime(d);
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

function mapServerThread(raw: BackendPrivateThreadMessage[]): PrivateChatMessage[] {
  return raw
    .map((m, idx) => {
      const text = (m.text ?? '').trim();
      if (!text) return null;
      const sender = (m.sender ?? '').toLowerCase();
      const from: 'me' | 'them' =
        sender === 'human' || sender === 'me' ? 'me' : 'them';
      return {
        id: `sync-${idx}-${m.ts ?? idx}`,
        from,
        text,
        timestamp: formatTs(m.ts),
      } satisfies PrivateChatMessage;
    })
    .filter((m): m is PrivateChatMessage => m != null);
}

interface PrivateChatStore {
  liveMode: boolean;
  threads: Record<string, PrivateChatMessage[]>;
  unread: Record<string, number>;
  typingByPartner: Record<string, boolean>;
  activePartnerId: string | null;
  seededPartners: Record<string, boolean>;
  setLiveMode: (live: boolean) => void;
  setActivePartner: (playerId: string | null) => void;
  ensureThread: (playerId: string, partnerName: string) => void;
  markRead: (playerId: string) => void;
  /** Mock: local append + auto-reply. Live: local append only (WS send is caller's job). */
  sendMessage: (playerId: string, partnerName: string, text: string) => void;
  receiveMessage: (
    playerId: string,
    partnerName: string,
    text: string,
    options?: { silent?: boolean; timestamp?: string; id?: string },
  ) => void;
  setPartnerTyping: (playerId: string, typing: boolean) => void;
  applyServerSync: (
    threads: Record<string, BackendPrivateThreadMessage[]>,
  ) => void;
  clearThread: (playerId: string) => void;
  hydrate: (payload: {
    threads: Record<string, PrivateChatMessage[]>;
    unread: Record<string, number>;
    seededPartners: Record<string, boolean>;
  }) => void;
  reset: () => void;
}

const initialPrivateChatState = {
  liveMode: false,
  threads: {} as Record<string, PrivateChatMessage[]>,
  unread: {} as Record<string, number>,
  typingByPartner: {} as Record<string, boolean>,
  activePartnerId: null as string | null,
  seededPartners: {} as Record<string, boolean>,
};

export const usePrivateChatStore = create<PrivateChatStore>((set, get) => ({
  ...initialPrivateChatState,

  setLiveMode: (live) => set({ liveMode: live }),

  setActivePartner: (playerId) => {
    if (get().activePartnerId === playerId) {
      if (playerId) get().markRead(playerId);
      return;
    }
    set({ activePartnerId: playerId });
    if (playerId) get().markRead(playerId);
  },

  ensureThread: (playerId, partnerName) => {
    const { threads, seededPartners, liveMode } = get();
    if (seededPartners[playerId]) return;

    if (liveMode) {
      set({
        threads: {
          ...threads,
          [playerId]: threads[playerId] ?? [],
        },
        seededPartners: { ...seededPartners, [playerId]: true },
      });
      return;
    }

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

    // Live: replies come from WS (Helixa). Mock: local auto-reply.
    if (get().liveMode) return;

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
      id: options?.id ?? `them-${Date.now()}`,
      from: 'them',
      text,
      timestamp: options?.timestamp
        ? formatTs(options.timestamp)
        : formatChatTime(new Date()),
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

  setPartnerTyping: (playerId, typing) =>
    set((state) => ({
      typingByPartner: {
        ...state.typingByPartner,
        [playerId]: typing,
      },
    })),

  applyServerSync: (serverThreads) => {
    const threads: Record<string, PrivateChatMessage[]> = {};
    const seededPartners: Record<string, boolean> = {};
    for (const [agentId, raw] of Object.entries(serverThreads ?? {})) {
      threads[agentId] = mapServerThread(raw);
      seededPartners[agentId] = true;
    }
    set({
      threads,
      seededPartners,
      unread: {},
      typingByPartner: {},
      // keep activePartnerId
    });
  },

  clearThread: (playerId) =>
    set((state) => {
      const { [playerId]: _removedThread, ...threads } = state.threads;
      const { [playerId]: _removedUnread, ...unread } = state.unread;
      const { [playerId]: _removedSeed, ...seededPartners } = state.seededPartners;
      const { [playerId]: _removedTyping, ...typingByPartner } =
        state.typingByPartner;
      return {
        threads,
        unread,
        seededPartners,
        typingByPartner,
        activePartnerId:
          state.activePartnerId === playerId ? null : state.activePartnerId,
      };
    }),

  hydrate: ({ threads, unread, seededPartners }) =>
    set({
      threads: threads ?? {},
      unread: unread ?? {},
      seededPartners: seededPartners ?? {},
      typingByPartner: {},
      activePartnerId: null,
    }),

  reset: () => set(initialPrivateChatState),
}));
