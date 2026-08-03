/** Акцентный цвет подложки в приватном чате (кулуары) */
export const CHARACTER_CHAT_ACCENT: Record<string, string> = {
  vance: '#bef264',
  cole: '#7dd3fc',
  martha: '#c4b5fd',
  penny: '#fdba74',
  gwen: '#5eead4',
  logan: '#fde047',
  chester: '#fca5a5',
  roxy: '#f9a8d4',
};

const DEFAULT_ACCENT = '#d9f99d';

export function getCharacterChatAccent(characterId: string): string {
  return CHARACTER_CHAT_ACCENT[characterId] ?? DEFAULT_ACCENT;
}
