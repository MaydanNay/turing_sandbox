import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronUp, Radio, Satellite } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { ChatMessage, TypingIndicator } from '@/types/game';

interface ChatBoxProps {
  messages: ChatMessage[];
  typing: TypingIndicator[];
  defaultCollapsed?: boolean;
  className?: string;
}

function TypewriterLine({ text }: { text: string }) {
  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      {text.split('').map((char, i) => (
        <motion.span
          key={`${char}-${i}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.015 }}
        >
          {char}
        </motion.span>
      ))}
    </motion.span>
  );
}

export function ChatBox({
  messages,
  typing,
  defaultCollapsed = false,
  className = '',
}: ChatBoxProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const bottomRef = useRef<HTMLDivElement>(null);
  const activeTyping = typing.filter((t) => t.until > Date.now());
  const unreadHint = collapsed && (messages.length > 0 || activeTyping.length > 0);

  useEffect(() => {
    if (!collapsed) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, activeTyping.length, collapsed]);

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-xl border border-bunker-border bg-bunker-panel/90 font-mono text-sm shadow-lg backdrop-blur ${className}`}
    >
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center gap-2 border-b border-bunker-border px-3 py-2 text-left text-bunker-neon transition hover:bg-bunker-border/20"
        aria-expanded={!collapsed}
        aria-controls="chat-panel"
      >
        <Radio className="h-4 w-4 shrink-0" />
        <span className="text-xs uppercase tracking-widest">Канал связи</span>
        {unreadHint && (
          <span className="rounded-full bg-bunker-neon/20 px-2 py-0.5 text-[10px] text-bunker-neon">
            {messages.length}
          </span>
        )}
        <Satellite
          className={`ml-auto h-3 w-3 shrink-0 text-bunker-neonDim ${collapsed ? '' : 'animate-pulse'}`}
        />
        {collapsed ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-bunker-muted" />
        ) : (
          <ChevronUp className="h-4 w-4 shrink-0 text-bunker-muted" />
        )}
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            id="chat-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="flex max-h-[min(420px,45vh)] min-h-[180px] flex-1 flex-col overflow-hidden lg:max-h-none">
              <div className="flex-1 space-y-1.5 overflow-y-auto p-3 text-bunker-text">
              <AnimatePresence initial={false}>
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="leading-relaxed"
                  >
                    <span className={msg.is_ai ? 'text-indigo-400' : 'text-bunker-neon'}>
                      [{msg.sender}]
                    </span>
                    <span className="text-bunker-muted">: </span>
                    {msg.sender === 'Система' ? (
                      <span className="text-bunker-amber">{msg.text}</span>
                    ) : (
                      <TypewriterLine text={msg.text} />
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>

              {activeTyping.map((t) => (
                <motion.p
                  key={t.sender}
                  className="text-bunker-muted"
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                >
                  [{t.sender}]: печатает...
                </motion.p>
              ))}
              <div ref={bottomRef} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
