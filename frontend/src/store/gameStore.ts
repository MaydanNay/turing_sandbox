import { create } from 'zustand';

import { mapBackendPhase } from '@/config/env';
import {
  CHARACTERS,
  rollSessionAges,
} from '@/data/characters';
import type {
  BackendRoomState,
  BackendWsMessage,
  ChatMessage,
  GamePhase,
  MyProfile,
  Player,
  TypingIndicator,
  WsClientMessage,
} from '@/types/game';
import { clampSuspicion } from '@/utils/seatPositions';

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

  setConnectionMeta: (roomId: string, clientId: string) => void;
  setConnected: (connected: boolean) => void;
  setError: (error: string | null) => void;
  loadMockScene: () => void;
  prepareLiveSession: (roomId: string, clientId: string) => void;
  handleBackendMessage: (msg: BackendWsMessage) => void;
  handleClientMessage: (msg: WsClientMessage) => void;
  applyRoomState: (state: BackendRoomState, selfId?: string) => void;
  addChatMessage: (msg: Omit<ChatMessage, 'id'>) => void;
  bumpSuspicion: (targetId: string, amount?: number) => void;
  setTyping: (sender: string) => void;
  cycleMockPhase: () => void;
  gatherAtTable: () => void;
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
};

export const useGameStore = create<GameStore>((set, get) => ({
  ...initialState,

  setConnectionMeta: (roomId, clientId) => set({ roomId, clientId }),

  setConnected: (connected) => set({ connected }),

  setError: (error) => set({ error }),

  prepareLiveSession: (roomId, clientId) => {
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
    });
  },

  loadMockScene: () => {
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
        break;
      case 'phase_changed':
        get().applyRoomState(msg.state, clientId ?? undefined);
        get().addChatMessage({
          sender: 'Система',
          text: `>>> ФАЗА: ${msg.phase.toUpperCase()}`,
          timestamp: msg.ts,
        });
        break;
      case 'message':
        get().addChatMessage({
          sender: msg.client_id,
          text: msg.text ?? '',
          timestamp: msg.ts,
          is_ai: msg.is_ai,
        });
        if (msg.action === 'vote' && msg.payload?.target) {
          get().bumpSuspicion(String(msg.payload.target), 15);
        }
        break;
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
    const order: GamePhase[] = ['INIT', 'PITCH', 'CONFLICT', 'VOTE', 'RESOLVE'];
    const current = get().gameState;
    const next = order[(order.indexOf(current) + 1) % order.length] ?? 'INIT';
    set({
      gameState: next,
      gatheredAtTable: next === 'INIT' ? false : true,
    });
    get().addChatMessage({
      sender: 'Система',
      text: `>>> [MOCK] Переход в фазу ${next}`,
      timestamp: new Date().toISOString(),
    });
  },

  gatherAtTable: () => {
    if (get().gatheredAtTable) return;
    set({ gatheredAtTable: true });
    get().addChatMessage({
      sender: 'Система',
      text: '>>> Сбор за столом переговоров.',
      timestamp: new Date().toISOString(),
    });
  },

  reset: () => set(initialState),
}));
