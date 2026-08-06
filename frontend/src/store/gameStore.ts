import { create } from 'zustand';

import { mapBackendPhase } from '@/config/env';
import {
  CHARACTERS,
  rollSessionAges,
} from '@/data/characters';
import { MATCH_PHASE_ORDER, getPhaseMeta } from '@/data/gamePhaseConfig';
import type {
  BackendHistoryEvent,
  BackendRoomState,
  BackendWsMessage,
  ChatMessage,
  GamePhase,
  MyProfile,
  Player,
  TypingIndicator,
  WsClientMessage,
} from '@/types/game';
import type { PlayerHandCard } from '@/types/card';
import { revealTypeLabel, toRevealCardPayload } from '@/utils/cardArt';
import { clampSuspicion } from '@/utils/seatPositions';
import { useChatNotificationStore } from '@/store/chatNotificationStore';
import { usePrivateChatStore } from '@/store/privateChatStore';
import type { UiSnapshot } from '@/store/sessionPersistence';
import { loadUiSnapshot } from '@/store/sessionPersistence';

interface GameStore {
  roomId: string | null;
  clientId: string | null;
  connected: boolean;
  gameState: GamePhase;
  players: Player[];
  chat: ChatMessage[];
  myProfile: MyProfile | null;
  typing: TypingIndicator[];
  error: string | null;
  sessionAges: Record<string, number>;
  /** false — персонажи стоят на локации; true — сидят за столом */
  gatheredAtTable: boolean;
  /** characterId игроков, отправленных в карцер (порядок изгнания) */
  brigCharacterIds: string[];
  /** voter player id → target characterId */
  votes: Record<string, string>;

  setConnectionMeta: (roomId: string, clientId: string) => void;
  setConnected: (connected: boolean) => void;
  setError: (error: string | null) => void;
  loadMockScene: () => void;
  prepareLiveSession: (roomId: string, clientId: string) => void;
  handleBackendMessage: (msg: BackendWsMessage) => void;
  handleClientMessage: (msg: WsClientMessage) => void;
  applyRoomState: (state: BackendRoomState, selfId?: string) => void;
  addChatMessage: (msg: Omit<ChatMessage, 'id'>) => void;
  recordCardReveal: (
    playerName: string,
    card: Pick<PlayerHandCard, 'type' | 'title' | 'description' | 'imageUrl'>,
    subtitle?: string,
  ) => void;
  bumpSuspicion: (targetId: string, amount?: number) => void;
  setTyping: (sender: string) => void;
  cycleMockPhase: () => void;
  gatherAtTable: () => void;
  castVoteToBrig: (targetCharacterId: string) => void;
  applyHistoryEvents: (events: BackendHistoryEvent[]) => void;
  applyUiSnapshot: (snapshot: UiSnapshot) => void;
  restoreMockSnapshot: (snapshot: UiSnapshot) => void;
  reset: () => void;
}

function buildPlayerFromCharacter(
  character: (typeof CHARACTERS)[number],
  age: number,
  overrides?: Partial<Player>,
): Player {
  return {
    id: character.id,
    characterId: character.id,
    name: character.displayName,
    role: character.role,
    gender: character.gender,
    age,
    stats: { Роль: character.role },
    is_alive: true,
    suspicion_score: 0,
    is_ai: false,
    connected: true,
    tablePosition: character.seat - 1,
    ...overrides,
  };
}

function createMockPlayers(sessionAges: Record<string, number>): Player[] {
  return CHARACTERS.map((c) =>
    buildPlayerFromCharacter(c, sessionAges[c.id] ?? c.ageMin, {
      is_ai: c.seat >= 6,
    }),
  );
}

function playerToMyProfile(player: Player): MyProfile {
  return {
    id: player.id,
    characterId: player.characterId,
    name: player.name,
    role: player.role,
    gender: player.gender,
    age: player.age,
    inventory: player.id === 'vance' ? ['Ключ-карта', 'Рация', 'Досье'] : [],
  };
}

/** Тот же порядок мест, что и в mock: игрок #0 → Vance, #1 → Cole, … */
function backendPlayersToFrontend(
  playersRecord: BackendRoomState['players'],
  sessionAges: Record<string, number>,
): Player[] {
  return Object.entries(playersRecord)
    .slice(0, CHARACTERS.length)
    .map(([id, info], index) => {
      const character = CHARACTERS[index];
      if (!character) {
        throw new Error(`Missing character definition for seat index ${index}`);
      }
      return buildPlayerFromCharacter(
        character,
        sessionAges[character.id] ?? character.ageMin,
        {
          id,
          role: info.role ?? character.role,
          stats: info.role ? { Профессия: info.role } : { Роль: character.role },
          is_ai: info.is_ai,
          connected: info.connected,
        },
      );
    });
}

const initialState = {
  roomId: null as string | null,
  clientId: null as string | null,
  connected: false,
  gameState: 'INIT' as GamePhase,
  players: [] as Player[],
  chat: [] as ChatMessage[],
  myProfile: null as MyProfile | null,
  typing: [] as TypingIndicator[],
  error: null as string | null,
  sessionAges: {} as Record<string, number>,
  gatheredAtTable: false,
  brigCharacterIds: [] as string[],
  votes: {} as Record<string, string>,
};

export const useGameStore = create<GameStore>((set, get) => ({
  ...initialState,

  setConnectionMeta: (roomId, clientId) => set({ roomId, clientId }),

  setConnected: (connected) => set({ connected }),

  setError: (error) => set({ error }),

  prepareLiveSession: (roomId, clientId) => {
    usePrivateChatStore.getState().reset();
    usePrivateChatStore.getState().setLiveMode(true);
    useChatNotificationStore.setState({ items: [] });
    set({
      roomId,
      clientId,
      connected: false,
      gameState: 'INIT',
      players: [],
      chat: [],
      typing: [],
      myProfile: null,
      error: null,
      sessionAges: rollSessionAges(),
      gatheredAtTable: false,
      brigCharacterIds: [],
      votes: {},
    });
  },

  loadMockScene: () => {
    usePrivateChatStore.getState().reset();
    usePrivateChatStore.getState().setLiveMode(false);
    useChatNotificationStore.setState({ items: [] });
    const sessionAges = rollSessionAges();
    const players = createMockPlayers(sessionAges);
    const self = players[0];
    set({
      roomId: 'mock-room',
      clientId: self?.id ?? 'vance',
      connected: false,
      gameState: 'INIT',
      sessionAges,
      players,
      myProfile: self ? playerToMyProfile(self) : null,
      chat: [
        {
          id: 'c1',
          sender: 'Logan',
          text: 'Я врач. Без меня вы не переживёте зиму в бункере.',
          timestamp: new Date(Date.now() - 120_000).toISOString(),
          is_ai: true,
        },
        {
          id: 'c2',
          sender: 'Penny',
          text: 'Генератор держится на честном слове. Мне нужен доступ к реактору.',
          timestamp: new Date(Date.now() - 60_000).toISOString(),
        },
        {
          id: 'c3',
          sender: 'Система',
          text: '>>> ФАЗА: INIT — сбор у аванпоста.',
          timestamp: new Date().toISOString(),
        },
      ],
      typing: [],
      error: null,
      gatheredAtTable: false,
    });
  },

  applyRoomState: (state, selfId) => {
    const sessionAges =
      Object.keys(get().sessionAges).length > 0 ? get().sessionAges : rollSessionAges();
    const players = backendPlayersToFrontend(state.players, sessionAges);
    const gameState = mapBackendPhase(state.phase);
    const self = selfId ? players.find((p) => p.id === selfId) : undefined;

    set({
      roomId: state.room_id,
      gameState,
      sessionAges,
      players,
      gatheredAtTable: gameState !== 'INIT',
      myProfile: self ? playerToMyProfile(self) : get().myProfile,
    });
  },

  handleBackendMessage: (msg) => {
    const { clientId } = get();

    switch (msg.type) {
      case 'state':
        get().applyRoomState(msg.state, msg.client_id);
        {
          const snap = loadUiSnapshot(msg.room_id);
          if (snap) get().applyUiSnapshot(snap);
        }
        break;
      case 'history':
        get().applyHistoryEvents(msg.events ?? []);
        {
          const snap = loadUiSnapshot(msg.room_id);
          if (snap) get().applyUiSnapshot(snap);
        }
        break;
      case 'phase_changed':
        get().applyRoomState(msg.state, clientId ?? undefined);
        get().addChatMessage({
          sender: 'Система',
          text: `>>> ФАЗА: ${msg.phase.toUpperCase()}`,
          timestamp: msg.ts,
        });
        break;
      case 'message': {
        const players = get().players;
        const myProfile = get().myProfile;
        const player = players.find((p) => p.id === msg.client_id);
        const senderName =
          player?.name ??
          (myProfile?.id === msg.client_id ? myProfile.name : msg.client_id);
        get().addChatMessage({
          sender: senderName,
          text: msg.text ?? '',
          timestamp: msg.ts,
          is_ai: msg.is_ai,
        });
        if (msg.action === 'vote' && msg.payload?.target) {
          get().bumpSuspicion(String(msg.payload.target), 15);
        }
        break;
      }
      case 'player_joined':
        get().addChatMessage({
          sender: 'Система',
          text: `>>> ${msg.client_id} ${msg.is_ai ? '(AI)' : ''} подключился к каналу.`,
          timestamp: msg.ts,
          is_ai: msg.is_ai,
        });
        break;
      case 'player_left':
        get().addChatMessage({
          sender: 'Система',
          text: `>>> ${msg.client_id} покинул канал.`,
          timestamp: msg.ts,
        });
        break;
      case 'error':
        set({ error: msg.text });
        break;
      case 'private_chat_typing':
        usePrivateChatStore
          .getState()
          .setPartnerTyping(msg.agent_id, Boolean(msg.typing));
        break;
      case 'private_chat_message': {
        if (msg.from === 'me') break;
        const partner =
          get().players.find((p) => p.id === msg.agent_id) ??
          get().players.find((p) => p.id === msg.client_id);
        const partnerName = partner?.name ?? msg.agent_id;
        usePrivateChatStore.getState().receiveMessage(
          msg.agent_id,
          partnerName,
          msg.text,
          { timestamp: msg.ts },
        );
        usePrivateChatStore.getState().setPartnerTyping(msg.agent_id, false);
        break;
      }
      case 'private_chat_sync':
        usePrivateChatStore.getState().applyServerSync(msg.threads ?? {});
        break;
      default: {
        const _exhaustive: never = msg;
        void _exhaustive;
      }
    }
  },

  handleClientMessage: (msg) => {
    switch (msg.action) {
      case 'sync_state':
        if (msg.data) {
          get().applyRoomState(msg.data as unknown as BackendRoomState);
        }
        break;
      case 'chat':
        if (msg.sender && msg.text) {
          get().addChatMessage({
            sender: msg.sender,
            text: msg.text,
            timestamp: new Date().toISOString(),
          });
        }
        break;
      case 'suspicion_up':
        if (msg.target) get().bumpSuspicion(msg.target, 20);
        break;
      case 'typing':
        if (msg.sender) get().setTyping(msg.sender);
        break;
    }
  },

  addChatMessage: (msg) =>
    set((s) => ({
      chat: [...s.chat, { ...msg, id: crypto.randomUUID() }],
    })),

  recordCardReveal: (playerName, card, subtitle) => {
    const ts = new Date().toISOString();
    const art = toRevealCardPayload(card);
    const typeLabel = revealTypeLabel(card.type);

    get().addChatMessage({
      sender: 'Система',
      text: `Время ${playerName} раскрывать карту`,
      kind: 'turn',
      senderColor: '#2dd4bf',
      timestamp: ts,
    });
    get().addChatMessage({
      sender: playerName,
      text: `${playerName} раскрыл ${typeLabel}`,
      subtitle: subtitle ?? card.description,
      kind: 'reveal',
      timestamp: ts,
      ...art,
    });
  },

  bumpSuspicion: (targetId, amount = 10) =>
    set((s) => ({
      players: s.players.map((p) =>
        p.id === targetId
          ? { ...p, suspicion_score: clampSuspicion(p.suspicion_score + amount) }
          : p,
      ),
    })),

  setTyping: (sender) => {
    const until = Date.now() + 3000;
    set((s) => ({
      typing: [...s.typing.filter((t) => t.sender !== sender), { sender, until }],
    }));
    window.setTimeout(() => {
      set((s) => ({
        typing: s.typing.filter((t) => t.sender !== sender || t.until > Date.now()),
      }));
    }, 3100);
  },

  cycleMockPhase: () => {
    const current = get().gameState;
    const index = MATCH_PHASE_ORDER.indexOf(current);
    const next = MATCH_PHASE_ORDER[(index + 1) % MATCH_PHASE_ORDER.length] ?? 'INIT';
    const meta = getPhaseMeta(next);

    set({
      gameState: next,
      gatheredAtTable: meta.format !== 'lobby',
      votes: {},
    });
    get().addChatMessage({
      sender: 'Система',
      text: `>>> [MOCK] ${meta.title.toUpperCase()} — ${meta.subtitle}`,
      timestamp: new Date().toISOString(),
    });
  },

  gatherAtTable: () => {
    if (get().gatheredAtTable) return;
    const phase = get().gameState === 'INIT' ? 'PITCH' : get().gameState;
    const meta = getPhaseMeta(phase);

    set({ gatheredAtTable: true, gameState: phase });
    get().addChatMessage({
      sender: 'Система',
      text: 'Сбор за столом переговоров.',
      kind: 'system',
      timestamp: new Date().toISOString(),
    });
    get().addChatMessage({
      sender: 'Система',
      text: `>>> ${meta.title.toUpperCase()} — ${meta.subtitle}`,
      timestamp: new Date().toISOString(),
    });
    get().recordCardReveal(
      'Chester',
      {
        type: 'skill',
        title: 'Хакерство',
        description: 'Взлом терминалов и обход замков',
      },
      'Оказывается он хакер',
    );
  },

  castVoteToBrig: (targetCharacterId) => {
    const { clientId, myProfile, players, votes, brigCharacterIds } = get();
    const voterId = clientId ?? myProfile?.id;
    if (!voterId) return;

    const target = players.find((p) => p.characterId === targetCharacterId && p.is_alive);
    if (!target) return;

    if (myProfile?.characterId === targetCharacterId) return;

    const nextVotes = { ...votes, [voterId]: targetCharacterId };
    set({ votes: nextVotes });

    if (brigCharacterIds.includes(targetCharacterId)) return;

    set({
      players: players.map((p) =>
        p.characterId === targetCharacterId ? { ...p, is_alive: false } : p,
      ),
      brigCharacterIds: [...brigCharacterIds, targetCharacterId],
    });

    get().addChatMessage({
      sender: 'Система',
      text: `>>> ${target.name} отправлен в Карцер по результатам голосования.`,
      kind: 'system',
      timestamp: new Date().toISOString(),
    });

    get().addChatMessage({
      sender: myProfile?.name ?? 'Вы',
      text: `Голосую отправить ${target.name} в Карцер.`,
      timestamp: new Date().toISOString(),
    });
  },

  applyHistoryEvents: (events) => {
    const players = get().players;
    const myProfile = get().myProfile;
    const lines: ChatMessage[] = [];

    for (const ev of events) {
      const action = ev.action_type ?? '';
      const payload = (ev.raw_payload ?? {}) as Record<string, unknown>;
      const ts =
        (typeof ev.timestamp === 'string' && ev.timestamp) ||
        (typeof payload.ts === 'string' && payload.ts) ||
        new Date().toISOString();

      if (action === 'join') {
        const cid = String(payload.client_id ?? ev.user_id ?? 'unknown');
        lines.push({
          id: crypto.randomUUID(),
          sender: 'Система',
          text: `>>> ${cid}${ev.is_ai ? ' (AI)' : ''} подключился к каналу.`,
          timestamp: ts,
          is_ai: Boolean(ev.is_ai),
          kind: 'system',
        });
        continue;
      }

      if (action === 'phase') {
        const phase = String(payload.phase ?? 'UNKNOWN');
        lines.push({
          id: crypto.randomUUID(),
          sender: 'Система',
          text: `>>> ФАЗА: ${phase.toUpperCase()}`,
          timestamp: ts,
          kind: 'system',
        });
        continue;
      }

      if (action === 'chat' || action === 'pitch' || action === 'vote') {
        const cid = String(payload.client_id ?? ev.user_id ?? '');
        const player = players.find((p) => p.id === cid);
        const senderName =
          player?.name ??
          (myProfile?.id === cid ? myProfile.name : cid || 'unknown');
        const text = typeof payload.text === 'string' ? payload.text : '';
        if (!text && action !== 'vote') continue;
        lines.push({
          id: crypto.randomUUID(),
          sender: senderName,
          text: text || `[${action}]`,
          timestamp: ts,
          is_ai: Boolean(ev.is_ai ?? payload.is_ai),
        });
      }
    }

    if (lines.length === 0) return;
    set({ chat: lines });
  },

  applyUiSnapshot: (snapshot) => {
    set({
      gatheredAtTable: snapshot.gatheredAtTable,
      brigCharacterIds: snapshot.brigCharacterIds ?? [],
      votes: snapshot.votes ?? {},
      sessionAges:
        Object.keys(snapshot.sessionAges ?? {}).length > 0
          ? snapshot.sessionAges
          : get().sessionAges,
    });
    // Live private chat authority is Redis/WS sync — do not hydrate from snapshot.
    if (snapshot.mode === 'mock') {
      usePrivateChatStore.getState().hydrate({
        threads: snapshot.privateThreads ?? {},
        unread: snapshot.privateUnread ?? {},
        seededPartners: snapshot.privateSeeded ?? {},
      });
    }
  },

  restoreMockSnapshot: (snapshot) => {
    useChatNotificationStore.setState({ items: [] });
    usePrivateChatStore.getState().setLiveMode(false);
    set({
      roomId: snapshot.roomId,
      clientId: snapshot.clientId,
      connected: false,
      gameState: snapshot.gameState,
      players: snapshot.players,
      chat: snapshot.chat,
      myProfile: snapshot.myProfile,
      typing: [],
      error: null,
      sessionAges: snapshot.sessionAges,
      gatheredAtTable: snapshot.gatheredAtTable,
      brigCharacterIds: snapshot.brigCharacterIds ?? [],
      votes: snapshot.votes ?? {},
    });
    usePrivateChatStore.getState().hydrate({
      threads: snapshot.privateThreads ?? {},
      unread: snapshot.privateUnread ?? {},
      seededPartners: snapshot.privateSeeded ?? {},
    });
  },

  reset: () => set(initialState),
}));
