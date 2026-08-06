import { AnimatePresence } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';

import { playUiSound } from '@/audio/uiSounds';
import { EmptySeatSprite, SeatSprite } from '@/components/SeatSprite';
import { FloorClickMarker } from '@/components/FloorClickMarker';
import { StandingCharacterSprite } from '@/components/StandingCharacterSprite';
import { ASSETS } from '@/config/assets';
import { CHARACTERS } from '@/data/characters';
import { useOutpostMovementStore } from '@/store/outpostMovementStore';
import type { Player } from '@/types/game';
import {
  clampPlayerClick,
  isWalkableOutpostPoint,
  randomWalkableWanderPoint,
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

function depthZ(sceneY: number, tieBreak = 0): number {
  return Math.round(sceneY * 10) + tieBreak * 0.01;
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
  const { table } = SCENE_LAYOUT;
  const showChibi = !gatheredAtTable && !PREVIEW_EMPTY_SEATS;
  const showSeated = gatheredAtTable && !PREVIEW_OUTPOST_STANDING;

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

  const aiKey = useMemo(
    () =>
      players
        .filter((p) => p.is_ai && p.is_alive)
        .map((p) => p.id)
        .sort()
        .join(','),
    [players],
  );

  // AI wander on outpost — slow + skip if still walking
  useEffect(() => {
    if (gatheredAtTable || !showChibi || !aiKey) return;

    const timers: number[] = [];
    const aiIds = aiKey.split(',').filter(Boolean);

    for (const botId of aiIds) {
      const schedule = () => {
        const delay = 12000 + Math.random() * 28000;
        const id = window.setTimeout(() => {
          if (useOutpostMovementStore.getState().isMoving(botId)) {
            schedule();
            return;
          }
          // ~35% idle beat
          if (Math.random() < 0.35) {
            schedule();
            return;
          }
          const point = randomWalkableWanderPoint();
          setTarget(botId, point.x, point.y);
          schedule();
        }, delay);
        timers.push(id);
      };
      const first = window.setTimeout(
        () => {
          if (!useOutpostMovementStore.getState().isMoving(botId) && Math.random() >= 0.35) {
            const point = randomWalkableWanderPoint();
            setTarget(botId, point.x, point.y);
          }
          schedule();
        },
        8000 + Math.random() * 12000,
      );
      timers.push(first);
    }

    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [gatheredAtTable, showChibi, aiKey, setTarget]);

  const handleMarkerDone = useCallback((id: number) => {
    setClickMarker((prev) => (prev?.id === id ? null : prev));
  }, []);

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
        return;
      }

      clearPendingSit();
      const id = ++markerSeq.current;
      setClickMarker({ x: clamped.x, y: clamped.y, id });
      setTarget(selfId, clamped.x, clamped.y);
    },
    [
      gatheredAtTable,
      selfId,
      seatedSet,
      setTarget,
      clearPendingSit,
      onStandSelf,
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

  const seatEntries = SCENE_LAYOUT.seats.map((layout, index) => ({
    seatNumber: index + 1,
    layout,
    player: playerBySeat.get(index),
    zIndex: seatZIndex(layout),
  }));

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

  const tableScene = seatLayoutToScenePos({
    x: table.x + (table.offsetX ?? 0),
    y: table.y + (table.offsetY ?? 0),
    scale: 1,
  });

  const tableBlock = (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{
        left: `${table.x + (table.offsetX ?? 0)}%`,
        top: `${table.y + (table.offsetY ?? 0)}%`,
        width: `${table.widthPercent}%`,
        zIndex: tableZIndex(),
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

  const chibisBehind = standingEntries.filter((e) => e.layout.y < tableScene.y);
  const chibisFront = standingEntries.filter((e) => e.layout.y >= tableScene.y);

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

      {/* Behind table */}
      {showChibi && (
        <div className="pointer-events-none absolute inset-0 z-[3]">
          <AnimatePresence>{renderStanding(chibisBehind, 'behind')}</AnimatePresence>
        </div>
      )}

      {/* Table + chairs — standing layer above is pointer-events-none except sprites */}
      {(showChibi || showSeated) && (
        <div
          className="pointer-events-none absolute z-[4] -translate-x-1/2 -translate-y-1/2"
          style={{
            left: `${SCENE_GROUP.x}%`,
            top: `${SCENE_GROUP.y}%`,
            width: `${SCENE_GROUP.widthPercent}%`,
            aspectRatio: '1 / 1',
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

      {/* In front of table — closer to camera than furniture */}
      {showChibi && (
        <div className="pointer-events-none absolute inset-0 z-[5]">
          <AnimatePresence>{renderStanding(chibisFront, 'front')}</AnimatePresence>
        </div>
      )}
    </div>
  );
}
