import { useEffect, useRef } from 'react';

import { playUiSound } from '@/audio/uiSounds';
import { useChatNotificationStore } from '@/store/chatNotificationStore';
import type { ChatMessage, GamePhase, MyProfile } from '@/types/game';

function isSystemSender(sender: string): boolean {
  return sender === 'Система' || sender === 'System';
}

function isSelfMessage(sender: string, myProfile?: MyProfile | null): boolean {
  if (!myProfile) return sender === 'Вы';
  return sender === myProfile.name || sender === 'Вы';
}

function isPlayerMessage(msg: ChatMessage): boolean {
  return !msg.kind || msg.kind === 'message';
}

interface UseGeneralChatEffectsOptions {
  chat: ChatMessage[];
  myProfile?: MyProfile | null;
  gatheredAtTable: boolean;
  gameState: GamePhase;
  generalChatOpen?: boolean;
}

/** Звуки и toast при новых сообщениях общего чата. */
export function useGeneralChatEffects({
  chat,
  myProfile,
  gatheredAtTable,
  gameState,
  generalChatOpen = true,
}: UseGeneralChatEffectsOptions): void {
  const initialized = useRef(false);
  const prevLength = useRef(0);
  const pushNotification = useChatNotificationStore((s) => s.push);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      prevLength.current = chat.length;
      return;
    }

    if (chat.length <= prevLength.current) {
      prevLength.current = chat.length;
      return;
    }

    const newMessages = chat.slice(prevLength.current);
    prevLength.current = chat.length;

    const generalChatVisible =
      gatheredAtTable && gameState !== 'RECESS' && generalChatOpen;

    for (const msg of newMessages) {
      if (!isPlayerMessage(msg)) continue;

      if (isSelfMessage(msg.sender, myProfile)) {
        playUiSound('chatSend');
        continue;
      }

      if (isSystemSender(msg.sender)) continue;

      playUiSound('chatReceive');

      if (!generalChatVisible || document.hidden) {
        pushNotification({
          kind: 'general',
          title: msg.sender,
          body: msg.text,
        });
      }
    }
  }, [
    chat,
    gameState,
    gatheredAtTable,
    generalChatOpen,
    myProfile,
    pushNotification,
  ]);
}

/** Звук отправки для live-режима (сообщение уходит до echo с сервера). */
export function playChatSendSoundEffect(): void {
  playUiSound('chatSend');
}
