import EmojiPicker, {
  EmojiStyle,
  Theme,
  type EmojiClickData,
} from 'emoji-picker-react';

interface EmojiPickerPanelProps {
  onEmojiClick: (emoji: EmojiClickData) => void;
}

/** Isolated so emoji-picker-react stays in a lazy chunk. */
export default function EmojiPickerPanel({ onEmojiClick }: EmojiPickerPanelProps) {
  return (
    <EmojiPicker
      onEmojiClick={onEmojiClick}
      theme={Theme.LIGHT}
      emojiStyle={EmojiStyle.NATIVE}
      lazyLoadEmojis
      searchPlaceHolder="Поиск…"
      width={320}
      height={350}
      previewConfig={{ showPreview: false }}
    />
  );
}
