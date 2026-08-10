import { AnimatePresence } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';

import { playUiSound } from '@/audio/uiSounds';
import { EmptySeatSprite, SeatSprite } from '@/components/SeatSprite';
import { FloorClickMarker } from '@/components/FloorClickMarker';
import { StandingCharacterSprite } from '@/components/StandingCharacterSprite';
import { ASSETS } from '@/config/assets';
import { CHARACTERS } from '@/data/characters';
import { useWasdMovement } from '@/hooks/useWasdMovement';
import { useWebSocket } from '@/providers/WebSocketProvider';
import { useOutpostMovementStore } from '@/store/outpostMovementStore';
import type { Player } from '@/types/game';
import {
  clampPlayerClick,
  isWalkableOutpostPoint,
} from '@/utils/outpostCollision';
import {
  getOutpostSpot,
  PREVIEW_EMPTY_SEATS,
  PREVIEW_OUTPOST_STANDING,
  SCENE_GROUP,
  SCENE_LAYOUT,
  seatLayoutToScenePos,
  seatZIndex,
  tableZIndex,
  depthZ,
  type SeatLayout,
} from '@/utils/seatPositions';
import { playersBySeat } from '@/utils/scenePlayers';

interface RoundTableProps {
  players: Player[];
  gatheredAtTable: boolean;
  /** Player ids sitting personally (outside a full meeting) */
  seatedPlayerIds?: string[];
  onSitSelf: (playerId: string) => void;
  onStandSelf?: (playerId: string) => void;
  onLeaveTable?: () => void;
  /** Click empty table → open call-meeting modal */
  onOpenTableMenu?: () => void;
  selfId?: string;
  selectedPlayerId?: string | null;
  onSelectPlayer?: (id: string) => void;
  onOpenPrivateChat?: (id: string, anchor: DOMRect) => void;
  /** За столом: клик по месту открывает кулуары (только RECESS) */
  privateChatAtSeats?: boolean;
}



export function RoundTable({
  players,
  gatheredAtTable,
  seatedPlayerIds = [],
  onSitSelf,
  onStandSelf,
  onLeaveTable,
  onOpenTableMenu,
  selfId,
  selectedPlayerId,
  onSelectPlayer,
  onOpenPrivateChat,
  privateChatAtSeats = false,
}: RoundTableProps) {
  const playerBySeat = playersBySeat(players);
  const showChibi = !gatheredAtTable && !PREVIEW_EMPTY_SEATS;
  const showSeated = gatheredAtTable && !PREVIEW_OUTPOST_STANDING;
  const { send } = useWebSocket();

  const positions = useOutpostMovementStore((s) => s.positions);
  const initFromPlayers = useOutpostMovementStore((s) => s.initFromPlayers);
  const respawnOutsideFurniture = useOutpostMovementStore(
    (s) => s.respawnOutsideFurniture,
  );
  const setTarget = useOutpostMovementStore((s) => s.setTarget);
  const advancePath = useOutpostMovementStore((s) => s.advancePath);
  const setPendingSit = useOutpostMovementStore((s) => s.setPendingSit);
  const clearPendingSit = useOutpostMovementStore((s) => s.clearPendingSit);
  const resetMovement = useOutpostMovementStore((s) => s.reset);
  const sanitizeAllPositions = useOutpostMovementStore((s) => s.sanitizeAllPositions);
  const sceneRef = useRef<HTMLDivElement>(null);
  const wasGatheredRef = useRef(gatheredAtTable);
  const [clickMarker, setClickMarker] = useState<{
    x: number;
    y: number;
    id: number;
  } | null>(null);
  const markerSeq = useRef(0);
  const [floorWalkCursor, setFloorWalkCursor] = useState(false);
  const seatedSet = useMemo(() => new Set(seatedPlayerIds), [seatedPlayerIds]);
  const selfIsSeated = Boolean(selfId && seatedSet.has(selfId));

  useEffect(() => {
    if (gatheredAtTable) {
      resetMovement();
      wasGatheredRef.current = true;
      setClickMarker(null);
      return;
    }
    const hasPositions =
      Object.keys(useOutpostMovementStore.getState().positions).length > 0;
    if (wasGatheredRef.current || !hasPositions) {
      respawnOutsideFurniture(players);
      wasGatheredRef.current = false;
      return;
    }
    initFromPlayers(players);
    sanitizeAllPositions();
  }, [
    gatheredAtTable,
    players,
    initFromPlayers,
    respawnOutsideFurniture,
    resetMovement,
    sanitizeAllPositions,
  ]);

  // AI wander on outpost — DELETED (now driven by backend sync)

  const handleMarkerDone = useCallback((id: number) => {
    setClickMarker((prev) => (prev?.id === id ? null : prev));
  }, []);

  const clearClickMarker = useCallback(() => {
    setClickMarker(null);
  }, []);

  const sendWasdMove = useCallback(
    (x: number, y: number) => {
      send({ action: 'move_to', payload: { x, y } });
    },
    [send],
  );

  useWasdMovement({
    enabled: !gatheredAtTable,
    selfId,
    selfIsSeated,
    onStandSelf,
    onClearClickMarker: clearClickMarker,
    sendMove: sendWasdMove,
  });

  const handleFloorCursorMove = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        setFloorWalkCursor(false);
        return;
      }
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;
      setFloorWalkCursor(isWalkableOutpostPoint({ x, y }));
    },
    [],
  );

  const handleFloorClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      if (gatheredAtTable || !selfId) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;
      if (!isWalkableOutpostPoint({ x, y })) return;
      const clamped = clampPlayerClick({ x, y });

      if (seatedSet.has(selfId)) {
        onStandSelf?.(selfId);
        clearPendingSit();
        const id = ++markerSeq.current;
        setClickMarker({ x: clamped.x, y: clamped.y, id });
        setTarget(selfId, clamped.x, clamped.y);
        send({ action: 'move_to', payload: { x: clamped.x, y: clamped.y } });
        return;
      }

      clearPendingSit();
      const id = ++markerSeq.current;
      setClickMarker({ x: clamped.x, y: clamped.y, id });
      setTarget(selfId, clamped.x, clamped.y);
      send({ action: 'move_to', payload: { x: clamped.x, y: clamped.y } });
    },
    [
      gatheredAtTable,
      selfId,
      seatedSet,
      setTarget,
      clearPendingSit,
      onStandSelf,
      send,
    ],
  );

  const handleOwnChairClick = useCallback(
    (seatNumber: number) => {
      if (gatheredAtTable || !selfId) return;
      if (seatedSet.has(selfId)) return;
      const self = players.find((p) => p.id === selfId);
      if (!self || self.tablePosition !== seatNumber - 1) return;

      const seat = SCENE_LAYOUT.seats[seatNumber - 1];
      if (!seat) return;
      const scenePos = seatLayoutToScenePos(seat);
      playUiSound('table');

      const live = useOutpostMovementStore.getState().positions[selfId];
      const alreadyThere =
        live != null &&
        Math.hypot(live.x - scenePos.x, live.y - scenePos.y) < 4;

      if (alreadyThere) {
        clearPendingSit();
        onSitSelf(selfId);
        return;
      }

      setPendingSit(selfId);
      setTarget(selfId, scenePos.x, scenePos.y, { passThroughSeat: seatNumber });

      // If path is empty / already at first waypoint, sprite won't fire onMoveComplete
      window.setTimeout(() => {
        const move = useOutpostMovementStore.getState();
        if (move.pendingSitPlayerId !== selfId) return;
        if (move.isMoving(selfId)) return;
        move.clearPendingSit();
        onSitSelf(selfId);
      }, 50);
    },
    [
      gatheredAtTable,
      selfId,
      seatedSet,
      players,
      setPendingSit,
      setTarget,
      clearPendingSit,
      onSitSelf,
    ],
  );

  const handleMoveComplete = useCallback(
    (playerId: string) => {
      const arrived = advancePath(playerId);
      if (!arrived) return;
      const pending = useOutpostMovementStore.getState().pendingSitPlayerId;
      if (pending && pending === playerId) {
        clearPendingSit();
        onSitSelf(playerId);
      }
    },
    [advancePath, clearPendingSit, onSitSelf],
  );

  const seatEntries = Object.values(SCENE_LAYOUT.seats).map((layout, index) => {
    return {
      seatNumber: index + 1,
      layout,
      player: playerBySeat.get(index),
      zIndex: seatZIndex(layout),
    };
  });

  const backSeats = seatEntries.filter((s) => s.layout.behindTable);
  const frontSeats = seatEntries.filter((s) => !s.layout.behindTable);

  const selfSeatNumber =
    selfId != null
      ? (players.find((p) => p.id === selfId)?.tablePosition ?? -1) + 1
      : -1;

  const renderChair = (
    seatNumber: number,
    layout: SeatLayout,
    player: Player | undefined,
    z: number,
  ) => {
    const personallySeated =
      !gatheredAtTable && player != null && seatedSet.has(player.id);

    if ((showSeated || personallySeated) && player && !PREVIEW_EMPTY_SEATS) {
      if (!player.is_alive) {
        return (
          <EmptySeatSprite
            key={`empty-${seatNumber}`}
            seatNumber={seatNumber}
            layout={layout}
            zIndex={z}
          />
        );
      }
      return (
        <SeatSprite
          key={`seated-${player.id}`}
          seatNumber={seatNumber}
          player={player}
          layout={layout}
          zIndex={z}
          isSelf={player.id === selfId}
          selected={selectedPlayerId === player.id}
          onSelect={onSelectPlayer}
          onOpenPrivateChat={
            showSeated && privateChatAtSeats ? onOpenPrivateChat : undefined
          }
          onStandUp={
            player.id === selfId
              ? () => {
                  if (gatheredAtTable) onLeaveTable?.();
                  else onStandSelf?.(player.id);
                }
              : undefined
          }
        />
      );
    }

    // Roaming: any empty chair hovers; click always sits on your assigned seat
    const canSitAnyChair =
      !gatheredAtTable && !selfIsSeated && selfSeatNumber > 0;
    return (
      <EmptySeatSprite
        key={`empty-${seatNumber}`}
        seatNumber={seatNumber}
        layout={layout}
        zIndex={z}
        interactive={canSitAnyChair}
        onClick={
          canSitAnyChair ? () => handleOwnChairClick(selfSeatNumber) : undefined
        }
      />
    );
  };

  const tableBlock = (
    <div
      className="absolute"
      style={{
        left: `${SCENE_LAYOUT.table.x + (SCENE_LAYOUT.table.offsetX ?? 0)}%`,
        top: `${SCENE_LAYOUT.table.y + (SCENE_LAYOUT.table.offsetY ?? 0)}%`,
        width: `${SCENE_LAYOUT.table.widthPercent}%`,
        zIndex: tableZIndex(),
        transform: 'translate(-50%, -50%)',
      }}
    >
      <img
        src={ASSETS.table.round}
        alt=""
        aria-hidden
        className="h-auto w-full select-none"
        draggable={false}
      />
      {!gatheredAtTable && onOpenTableMenu && (
        <button
          type="button"
          className="pointer-events-auto absolute inset-0 cursor-pointer bg-transparent focus:outline-none"
          onClick={(event) => {
            event.stopPropagation();
            playUiSound('table');
            onOpenTableMenu();
          }}
          aria-label="Стол переговоров"
          title="Стол переговоров"
        />
      )}
      {gatheredAtTable && onLeaveTable && (
        <button
          type="button"
          className="pointer-events-auto absolute inset-0 cursor-pointer bg-transparent focus:outline-none"
          onClick={(event) => {
            event.stopPropagation();
            playUiSound('table');
            onLeaveTable();
          }}
          aria-label="Встать из-за стола"
          title="Встать из-за стола"
        />
      )}
    </div>
  );

  const standingEntries = showChibi
    ? CHARACTERS.flatMap((character) => {
        const player = playerBySeat.get(character.seat - 1);
        if (!player) return [];
        if (seatedSet.has(player.id)) return [];
        const live = positions[player.id];
        const fallback = getOutpostSpot(character.seat);
        const layout: SeatLayout = live
          ? { x: live.x, y: live.y, scale: live.scale }
          : fallback;
        return [{ character, player, layout }];
      })
    : [];

  const renderStanding = (
    entries: typeof standingEntries,
    layerKey: string,
  ) =>
    entries.map(({ character, player, layout }) => (
      <StandingCharacterSprite
        key={`${layerKey}-${player.id}`}
        player={player}
        layout={layout}
        zIndex={depthZ(layout.y, character.seat)}
        isSelf={player.id === selfId}
        selected={selectedPlayerId === player.id}
        onOpenPrivateChat={onOpenPrivateChat}
        onSelect={onSelectPlayer}
        onMoveComplete={handleMoveComplete}
      />
    ));

  return (
    <div ref={sceneRef} className="absolute inset-0 overflow-visible">
      <img
        src={ASSETS.locations.outpost}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full"
      />

      {!gatheredAtTable && (
        <button
          type="button"
          className={`pointer-events-auto absolute inset-0 z-[1] bg-transparent focus:outline-none ${
            floorWalkCursor ? 'cursor-pointer' : 'cursor-default'
          }`}
          aria-label="Идти"
          onClick={handleFloorClick}
          onMouseMove={handleFloorCursorMove}
          onMouseLeave={() => setFloorWalkCursor(false)}
        />
      )}

      {clickMarker && (
        <FloorClickMarker
          x={clickMarker.x}
          y={clickMarker.y}
          markerId={clickMarker.id}
          onDone={handleMarkerDone}
        />
      )}

      {/* ALL elements (chibis, table, chairs) in ONE stacking context for dynamic zIndex sorting */}
      <div className="pointer-events-none absolute inset-0 z-[3]">
        {showChibi && (
          <AnimatePresence>{renderStanding(standingEntries, 'chibis')}</AnimatePresence>
        )}
        
        {(showChibi || showSeated) && (
          <div
            className="pointer-events-none absolute"
            style={{
              left: `${SCENE_GROUP.x}%`,
              top: `${SCENE_GROUP.y}%`,
              width: `${SCENE_GROUP.widthPercent}%`,
              aspectRatio: '1 / 1',
              marginLeft: `-${SCENE_GROUP.widthPercent / 2}%`,
              marginTop: `-${SCENE_GROUP.widthPercent / 2}%`,
              // NO transform, NO z-index to avoid creating a new stacking context!
            }}
          >
            {backSeats.map(({ seatNumber, layout, player, zIndex }) =>
              renderChair(seatNumber, layout, player, zIndex),
            )}
            {tableBlock}
            {frontSeats.map(({ seatNumber, layout, player, zIndex }) =>
              renderChair(seatNumber, layout, player, zIndex),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
