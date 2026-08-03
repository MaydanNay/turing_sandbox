import { CHARACTERS } from '@/data/characters';
import type { Player } from '@/types/game';

/** Игрок на каждом из 8 мест (0–7). Mock и live — только tablePosition. */
export function playersBySeat(players: Player[]): Map<number, Player> {
  const map = new Map<number, Player>();
  for (const player of players) {
    const seat = player.tablePosition;
    if (seat >= 0 && seat < CHARACTERS.length && !map.has(seat)) {
      map.set(seat, player);
    }
  }
  return map;
}
