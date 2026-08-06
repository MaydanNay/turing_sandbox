import { create } from 'zustand';

import { mapBackendPhase } from '@/config/env';
import { mapBackendHandCard } from '@/data/cardDecks';
import {
  CHARACTERS,
  getCharacterById,
  rollSessionAges,
} from '@/data/characters';
import { getPhaseMeta } from '@/data/gamePhaseConfig';
import { evaluateMeetingCallGate } from '@/data/meetingCallLimits';
import type {
  BackendHandCard,
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
import { standUpSpawnForSeat } from '@/utils/outpostCollision';
import { useChatNotificationStore } from '@/store/chatNotificationStore';
import { useOutpostMovementStore } from '@/store/outpostMovementStore';
import { usePrivateChatStore } from '@/store/privateChatStore';
import type { UiSnapshot } from '@/store/sessionPersistence';
import { loadUiSnapshot } from '@/store/sessionPersistence';

/** Stable empty hand — never allocate `[]` inside zustand selectors */
export const EMPTY_CARDS: PlayerHandCard[] = [];

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
  /** Own 6-card hand (incl. secret_mission) */
  myHand: PlayerHandCard[];
  /** Public revealed cards by characterId / clientId (never secret_mission) */
  revealedByPlayer: Record<string, PlayerHandCard[]>;
  /** false — персонажи стоят на локации; true — общий сбор за столом */
  gatheredAtTable: boolean;
  /** Кто сидит лично (вне общего сбора) */
  seatedPlayerIds: string[];
  /** Сколько раз игрок уже созвал общий сбор в этой сессии */
  meetingCallsUsed: number;
  /** Timestamp последнего созыва (ms) */
  lastMeetingCallAt: number | null;
  /** characterId игроков, отправленных в карцер (порядок изгнания) */
  brigCharacterIds: string[];
  /** voter player id → target characterId */
  votes: Record<string, string>;

  setConnectionMeta: (roomId: string, clientId: string) => void;
  setConnected: (connected: boolean) => void;
  setError: (error: string | null) => void;
  prepareLiveSession: (roomId: string, clientId: string) => void;
  handleBackendMessage: (msg: BackendWsMessage) => void;
  handleClientMessage: (msg: WsClientMessage) => void;
  applyRoomState: (state: BackendRoomState, selfId?: string) => void;
  setMyHand: (cards: PlayerHandCard[]) => void;
  revealMyCard: (cardId: string) => PlayerHandCard | null;
  getRevealedCardsFor: (characterOrClientId: string) => PlayerHandCard[];
  addChatMessage: (msg: Omit<ChatMessage, 'id'>) => void;
  recordCardReveal: (
    playerName: string,
    card: Pick<PlayerHandCard, 'type' | 'title' | 'description' | 'imageUrl'>,
    subtitle?: string,
  ) => void;
  bumpSuspicion: (targetId: string, amount?: number) => void;
  setTyping: (sender: string) => void;
  sitSelf: (playerId: string) => void;
  standSelf: (playerId: string) => void;
  /** Returns false if cooldown / max calls block the meeting. */
  tryCallMeeting: () => boolean;
  gatherAtTable: () => void;
  leaveTable: () => void;
  castVoteToBrig: (targetCharacterId: string) => void;
  applyHistoryEvents: (events: BackendHistoryEvent[]) => void;
  applyUiSnapshot: (snapshot: UiSnapshot, opts?: { restoreGathered?: boolean }) => void;
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

function playerToMyProfile(
  player: Player,
  hand?: PlayerHandCard[] | null,
): MyProfile {
  const invCard = hand?.find((c) => c.type === 'inventory');
  return {
    id: player.id,
    characterId: player.characterId,
    name: player.name,
    role: player.role,
    gender: player.gender,
    age: player.age,
    inventory: invCard ? [invCard.title] : [],
  };
}

function mapHandCards(raw: BackendHandCard[] | undefined): PlayerHandCard[] {
  if (!raw?.length) return [];
  return raw.map((c) => mapBackendHandCard(c as unknown as Record<string, unknown>));
}

function mergeRevealed(
  prev: Record<string, PlayerHandCard[]>,
  key: string | null | undefined,
  card: PlayerHandCard,
): Record<string, PlayerHandCard[]> {
  if (!key || card.type === 'secret_mission' || card.type === 'character') {
    return prev;
  }
  const existing = prev[key] ?? [];
  if (existing.some((c) => c.id === card.id)) return prev;
  return { ...prev, [key]: [...existing, { ...card, isRevealed: true }] };
}

/** Map Redis seats → frontend players using shuffled character_id (seat art stays per character). */
function backendPlayersToFrontend(
  playersRecord: BackendRoomState['players'],
  sessionAges: Record<string, number>,
): Player[] {
  const entries = Object.entries(playersRecord);
  return entries.map(([id, info], index) => {
    const fromServer = info.character_id
      ? getCharacterById(info.character_id)
      : undefined;
    // Legacy rooms without character_id: keep old seat-index mapping
    const character = fromServer ?? CHARACTERS[index % CHARACTERS.length];
    if (!character) {
      throw new Error(`Missing character definition for player ${id}`);
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
  myHand: [] as PlayerHandCard[],
  revealedByPlayer: {} as Record<string, PlayerHandCard[]>,
  gatheredAtTable: false,
  seatedPlayerIds: [] as string[],
  meetingCallsUsed: 0,
  lastMeetingCallAt: null as number | null,
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
      myHand: [],
      revealedByPlayer: {},
      gatheredAtTable: false,
      seatedPlayerIds: [],
      meetingCallsUsed: 0,
      lastMeetingCallAt: null,
      brigCharacterIds: [],
      votes: {},
    });
  },

  applyRoomState: (state, selfId) => {
    const sessionAges =
      Object.keys(get().sessionAges).length > 0 ? get().sessionAges : rollSessionAges();
    const players = backendPlayersToFrontend(state.players, sessionAges);
    const gameState = mapBackendPhase(state.phase);
    const self = selfId ? players.find((p) => p.id === selfId) : undefined;
    const hand = get().myHand;
    // Sit/stand is local UX — never auto-gather just because the match left INIT.
    // Continue/reconnect restores via applyUiSnapshot({ restoreGathered: true }).
    const gatheredAtTable =
      gameState === 'INIT' ? false : get().gatheredAtTable;

    set({
      roomId: state.room_id,
      gameState,
      sessionAges,
      players,
      gatheredAtTable,
      myProfile: self ? playerToMyProfile(self, hand) : get().myProfile,
    });
  },

  setMyHand: (cards) => {
    const self = get().players.find((p) => p.id === get().clientId);
    set({
      myHand: cards,
      myProfile: self
        ? playerToMyProfile(self, cards)
        : get().myProfile
          ? { ...get().myProfile!, inventory: cards.find((c) => c.type === 'inventory') ? [cards.find((c) => c.type === 'inventory')!.title] : get().myProfile!.inventory }
          : null,
    });
  },

  revealMyCard: (cardId) => {
    const hand = get().myHand;
    const card = hand.find((c) => c.id === cardId);
    if (!card || card.isRevealed) return null;
    const revealed = { ...card, isRevealed: true };
    const myHand = hand.map((c) => (c.id === cardId ? revealed : c));
    const myProfile = get().myProfile;
    let revealedByPlayer = get().revealedByPlayer;
    if (myProfile && revealed.type !== 'secret_mission' && revealed.type !== 'character') {
      revealedByPlayer = mergeRevealed(revealedByPlayer, myProfile.characterId, revealed);
      revealedByPlayer = mergeRevealed(revealedByPlayer, myProfile.id, revealed);
    }
    set({ myHand, revealedByPlayer });
    return revealed;
  },

  getRevealedCardsFor: (characterOrClientId) => {
    return get().revealedByPlayer[characterOrClientId] ?? EMPTY_CARDS;
  },

  handleBackendMessage: (msg) => {
    const { clientId } = get();

    switch (msg.type) {
      case 'state':
        get().applyRoomState(msg.state, msg.client_id);
        {
          const snap = loadUiSnapshot(msg.room_id);
          // Restore brig/votes only — never re-seat from a stale snapshot
          if (snap) get().applyUiSnapshot(snap, { restoreGathered: false });
        }
        break;
      case 'history':
        get().applyHistoryEvents(msg.events ?? []);
        {
          const snap = loadUiSnapshot(msg.room_id);
          if (snap) get().applyUiSnapshot(snap, { restoreGathered: false });
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
      case 'hand':
        get().setMyHand(mapHandCards(msg.cards));
        break;
      case 'revealed_cards_sync': {
        const next: Record<string, PlayerHandCard[]> = {};
        for (const [key, cards] of Object.entries(msg.by_player ?? {})) {
          next[key] = mapHandCards(cards).filter(
            (c) => c.type !== 'secret_mission' && c.type !== 'character',
          );
        }
        set({ revealedByPlayer: next });
        break;
      }
      case 'card_revealed': {
        const card = mapBackendHandCard(msg.card as unknown as Record<string, unknown>);
        let revealedByPlayer = get().revealedByPlayer;
        revealedByPlayer = mergeRevealed(revealedByPlayer, msg.character_id, card);
        revealedByPlayer = mergeRevealed(revealedByPlayer, msg.client_id, card);
        set({ revealedByPlayer });
        const players = get().players;
        const myProfile = get().myProfile;
        const player =
          players.find((p) => p.id === msg.client_id) ??
          players.find((p) => p.characterId === msg.character_id);
        const name =
          player?.name ??
          (myProfile?.id === msg.client_id ? myProfile.name : msg.client_id);
        if (msg.client_id !== clientId) {
          get().recordCardReveal(name, card);
        }
        break;
      }
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

  sitSelf: (playerId) => {
    if (get().gatheredAtTable) return;
    const seated = get().seatedPlayerIds;
    if (seated.includes(playerId)) return;
    const move = useOutpostMovementStore.getState();
    const { [playerId]: _drop, ...restAnim } = move.moveAnim;
    useOutpostMovementStore.setState({
      remainingPath: { ...move.remainingPath, [playerId]: [] },
      inMotion: { ...move.inMotion, [playerId]: false },
      moveAnim: restAnim,
      pendingSitPlayerId:
        move.pendingSitPlayerId === playerId ? null : move.pendingSitPlayerId,
    });
    set({ seatedPlayerIds: [...seated, playerId] });
  },

  standSelf: (playerId) => {
    if (get().gatheredAtTable) return;
    if (!get().seatedPlayerIds.includes(playerId)) return;
    const player = get().players.find((p) => p.id === playerId);
    set({
      seatedPlayerIds: get().seatedPlayerIds.filter((id) => id !== playerId),
    });
    if (player) {
      const spawn = standUpSpawnForSeat(player.tablePosition + 1);
      const move = useOutpostMovementStore.getState();
      const scale = move.positions[playerId]?.scale ?? 0.9;
      const { [playerId]: _drop, ...restAnim } = move.moveAnim;
      useOutpostMovementStore.setState({
        positions: {
          ...move.positions,
          [playerId]: { x: spawn.x, y: spawn.y, scale },
        },
        remainingPath: { ...move.remainingPath, [playerId]: [] },
        inMotion: { ...move.inMotion, [playerId]: false },
        moveAnim: restAnim,
      });
    }
  },

  tryCallMeeting: () => {
    if (get().gatheredAtTable) return false;
    const gate = evaluateMeetingCallGate(
      get().meetingCallsUsed,
      get().lastMeetingCallAt,
    );
    if (!gate.ok) return false;
    set({
      meetingCallsUsed: get().meetingCallsUsed + 1,
      lastMeetingCallAt: Date.now(),
    });
    return true;
  },

  gatherAtTable: () => {
    if (get().gatheredAtTable) return;
    const phase = get().gameState === 'INIT' ? 'PITCH' : get().gameState;
    const meta = getPhaseMeta(phase);

    useOutpostMovementStore.getState().reset();

    set({ gatheredAtTable: true, seatedPlayerIds: [], gameState: phase });
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

  leaveTable: () => {
    if (!get().gatheredAtTable) return;
    usePrivateChatStore.getState().setActivePartner(null);
    set({ gatheredAtTable: false, seatedPlayerIds: [] });
    get().addChatMessage({
      sender: 'Система',
      text: 'Вы встали из-за стола.',
      kind: 'system',
      timestamp: new Date().toISOString(),
    });
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

  applyUiSnapshot: (snapshot, opts) => {
    const restoreGathered = opts?.restoreGathered !== false;
    set({
      ...(restoreGathered ? { gatheredAtTable: snapshot.gatheredAtTable } : {}),
      seatedPlayerIds: snapshot.seatedPlayerIds ?? [],
      meetingCallsUsed: snapshot.meetingCallsUsed ?? 0,
      lastMeetingCallAt: snapshot.lastMeetingCallAt ?? null,
      brigCharacterIds: snapshot.brigCharacterIds ?? [],
      votes: snapshot.votes ?? {},
      sessionAges:
        Object.keys(snapshot.sessionAges ?? {}).length > 0
          ? snapshot.sessionAges
          : get().sessionAges,
    });
    if (snapshot.outpostPositions && Object.keys(snapshot.outpostPositions).length > 0) {
      useOutpostMovementStore.getState().hydratePositions(snapshot.outpostPositions);
    } else if (!get().gatheredAtTable) {
      useOutpostMovementStore.getState().sanitizeAllPositions();
    }
    // Hands + private chat: Redis/WS is authority — never hydrate from localStorage.
  },

  reset: () => set(initialState),
}));
