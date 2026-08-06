import { AnimatePresence } from 'framer-motion';
import { playUiSound } from '@/audio/uiSounds';
import { EmptySeatSprite, SeatSprite } from '@/components/SeatSprite';
import { StandingCharacterSprite } from '@/components/StandingCharacterSprite';
import { ASSETS } from '@/config/assets';
import { CHARACTERS } from '@/data/characters';
import type { Player } from '@/types/game';
import {
  getOutpostSpot,
  PREVIEW_EMPTY_SEATS,
  PREVIEW_OUTPOST_STANDING,
  SCENE_GROUP,
  SCENE_LAYOUT,
  seatZIndex,
  tableZIndex,
  type SeatLayout,
} from '@/utils/seatPositions';
import { playersBySeat } from '@/utils/scenePlayers';

interface RoundTableProps {
  players: Player[];
  gatheredAtTable: boolean;
  onGatherAtTable: () => void;
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
  onGatherAtTable,
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

  const seatEntries = SCENE_LAYOUT.seats.map((layout, index) => ({
    seatNumber: index + 1,
    layout,
    player: playerBySeat.get(index),
    zIndex: seatZIndex(layout),
  }));

  const backSeats = seatEntries.filter((s) => s.layout.behindTable);
  const frontSeats = seatEntries.filter((s) => !s.layout.behindTable);

  const renderChair = (
    seatNumber: number,
    layout: SeatLayout,
    player: Player | undefined,
    z: number,
  ) => {
    if (showSeated && player && !PREVIEW_EMPTY_SEATS) {
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
          onOpenPrivateChat={privateChatAtSeats ? onOpenPrivateChat : undefined}
        />
      );
    }
    return (
      <EmptySeatSprite
        key={`empty-${seatNumber}`}
        seatNumber={seatNumber}
        layout={layout}
        zIndex={z}
      />
    );
  };

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
      {!gatheredAtTable && (
        <button
          type="button"
          className="pointer-events-auto absolute inset-0 cursor-pointer bg-transparent focus:outline-none"
          onClick={() => {
            playUiSound('table');
            onGatherAtTable();
          }}
          aria-label="Собраться за столом"
        />
      )}
    </div>
  );

  return (
    <div className="absolute inset-0 overflow-visible">
      <img
        src={ASSETS.locations.outpost}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover object-center"
      />

      <AnimatePresence>
        {showChibi &&
          CHARACTERS.map((character) => {
            const player = playerBySeat.get(character.seat - 1);
            if (!player) return null;
            return (
              <StandingCharacterSprite
                key={`chibi-${player.id}`}
                player={player}
                layout={getOutpostSpot(character.seat)}
                zIndex={5 + character.seat}
                isSelf={player.id === selfId}
                selected={selectedPlayerId === player.id}
                onOpenPrivateChat={onOpenPrivateChat}
                onSelect={onSelectPlayer}
              />
            );
          })}
      </AnimatePresence>

      <div
        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
        style={{
          left: `${SCENE_GROUP.x}%`,
          top: `${SCENE_GROUP.y}%`,
          width: `${SCENE_GROUP.widthPercent}%`,
          aspectRatio: '1 / 1',
        }}
      >
        {!PREVIEW_OUTPOST_STANDING &&
          backSeats.map(({ seatNumber, layout, player, zIndex }) =>
            renderChair(seatNumber, layout, player, zIndex),
          )}

        {tableBlock}

        {!PREVIEW_OUTPOST_STANDING &&
          frontSeats.map(({ seatNumber, layout, player, zIndex }) =>
            renderChair(seatNumber, layout, player, zIndex),
          )}
      </div>
    </div>
  );
}
