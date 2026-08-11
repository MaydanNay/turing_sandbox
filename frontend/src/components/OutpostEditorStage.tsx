import { useSyncExternalStore } from 'react';

import { EmptySeatSprite } from '@/components/SeatSprite';
import { ASSETS } from '@/config/assets';
import { CHARACTERS } from '@/data/characters';
import {
  getFurnitureVersion,
  subscribeFurniture,
} from '@/utils/furnitureRuntime';
import {
  depthZ,
  getOutpostSpot,
  getSceneGroup,
  getSceneLayout,
  OUTPOST_BASE_WIDTH,
  seatZIndex,
  tableZIndex,
} from '@/utils/seatPositions';

/** Static table/chairs (+ optional chibi preview) for the standalone scene editor. */
export function OutpostEditorStage({ showPlayers }: { showPlayers: boolean }) {
  useSyncExternalStore(subscribeFurniture, getFurnitureVersion, getFurnitureVersion);
  const group = getSceneGroup();
  const { seats, table } = getSceneLayout();

  const seatEntries = seats.map((layout, index) => ({
    seatNumber: index + 1,
    layout,
    zIndex: seatZIndex(layout),
  }));
  const backSeats = seatEntries.filter((s) => s.layout.behindTable);
  const frontSeats = seatEntries.filter((s) => !s.layout.behindTable);

  return (
    <div className="pointer-events-none absolute inset-0 z-[3]">
      {showPlayers &&
        CHARACTERS.map((character) => {
          const layout = getOutpostSpot(character.seat);
          const width = OUTPOST_BASE_WIDTH * layout.scale;
          return (
            <div
              key={character.id}
              className="absolute"
              style={{
                left: `${layout.x}%`,
                top: `${layout.y}%`,
                width: `${width}%`,
                zIndex: depthZ(layout.y, character.seat),
                transform: 'translateX(-50%) translateY(-92%)',
              }}
            >
              <img
                src={ASSETS.characters.chibi(character.id)}
                alt=""
                draggable={false}
                className="h-auto w-full select-none drop-shadow-[0_8px_14px_rgba(0,0,0,0.55)]"
                onError={(e) => {
                  e.currentTarget.src = ASSETS.characters.default;
                }}
              />
              <span className="absolute left-1/2 top-[92%] -translate-x-1/2 whitespace-nowrap rounded bg-black/70 px-1.5 py-0.5 font-mono text-[9px] text-white">
                {character.displayName}
              </span>
            </div>
          );
        })}

      <div
        className="pointer-events-none absolute"
        style={{
          left: `${group.x}%`,
          top: `${group.y}%`,
          width: `${group.widthPercent}%`,
          aspectRatio: '1 / 1',
          marginLeft: `-${group.widthPercent / 2}%`,
          marginTop: `-${group.widthPercent / 2}%`,
        }}
      >
        {backSeats.map(({ seatNumber, layout, zIndex }) => (
          <EmptySeatSprite
            key={`b-${seatNumber}`}
            seatNumber={seatNumber}
            layout={layout}
            zIndex={zIndex}
          />
        ))}
        <div
          className="absolute"
          style={{
            left: `${table.x + (table.offsetX ?? 0)}%`,
            top: `${table.y + (table.offsetY ?? 0)}%`,
            width: `${table.widthPercent}%`,
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
        </div>
        {frontSeats.map(({ seatNumber, layout, zIndex }) => (
          <EmptySeatSprite
            key={`f-${seatNumber}`}
            seatNumber={seatNumber}
            layout={layout}
            zIndex={zIndex}
          />
        ))}
      </div>
    </div>
  );
}
