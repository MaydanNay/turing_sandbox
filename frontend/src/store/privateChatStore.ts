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

function formatChatTime(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function formatTs(ts?: string): string {
  if (!ts) return formatChatTime(new Date());
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return formatChatTime(new Date());
  return formatChatTime(d);
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
  ensureThread: (playerId: string, _partnerName: string) => void;
  markRead: (playerId: string) => void;
  /** Append local outbound message; Helixa replies arrive via WS. */
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

  ensureThread: (playerId, _partnerName) => {
    const { threads, seededPartners } = get();
    if (seededPartners[playerId]) return;

    set({
      threads: {
        ...threads,
        [playerId]: threads[playerId] ?? [],
      },
      seededPartners: { ...seededPartners, [playerId]: true },
    });
  },

  markRead: (playerId) =>
    set((state) => ({
      unread: { ...state.unread, [playerId]: 0 },
    })),

  sendMessage: (playerId, _partnerName, text) => {
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
    // Replies arrive via WS (Helixa) in live sessions.
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
