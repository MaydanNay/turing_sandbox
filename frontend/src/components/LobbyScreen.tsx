import { Loader2, Play, Terminal } from 'lucide-react';
import { useState } from 'react';

import { createSession } from '@/api/sessions';
import { generateClientId } from '@/config/env';

interface LobbyScreenProps {
  onJoinMock: () => void;
  onJoinLive: (roomId: string, clientId: string) => void;
  error: string | null;
}

export function LobbyScreen({ onJoinMock, onJoinLive, error }: LobbyScreenProps) {
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleCreateSession = async () => {
    setLoading(true);
    setLocalError(null);
    try {
      const clientId = generateClientId();
      const session = await createSession();
      onJoinLive(session.room_id, clientId);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Connection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bunker-bg p-6">
      <div className="w-full max-w-lg rounded-2xl border border-bunker-border bg-bunker-panel p-8 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <Terminal className="h-8 w-8 text-bunker-neon" />
          <div>
            <h1 className="font-display text-2xl font-bold">Станция Тьюринг</h1>
            <p className="font-mono text-xs text-bunker-muted">Аванпост — MVP Terminal</p>
          </div>
        </div>

        <p className="mb-6 font-mono text-sm leading-relaxed text-bunker-text/80">
          Подключитесь к серверу или откройте mock-сцену с 8 игроками за столом для
          проверки UI и анимаций.
        </p>

        {(error || localError) && (
          <div className="mb-4 rounded-lg border border-bunker-danger/40 bg-bunker-danger/10 px-3 py-2 font-mono text-xs text-bunker-danger">
            {error ?? localError}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={handleCreateSession}
            disabled={loading}
            className="flex items-center justify-center gap-2 rounded-xl border border-bunker-neon/50 bg-bunker-neon/10 py-3 font-mono text-sm text-bunker-neon transition hover:bg-bunker-neon/20 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Создать сессию (Live WS)
          </button>

          <button
            type="button"
            onClick={onJoinMock}
            className="rounded-xl border border-bunker-border py-3 font-mono text-sm text-bunker-text transition hover:border-bunker-amber/50 hover:text-bunker-amber"
          >
            Mock-сцена (8 игроков за столом)
          </button>
        </div>

        <p className="mt-6 font-mono text-[10px] leading-relaxed text-bunker-muted">
          Backend: <code className="text-bunker-neonDim">VITE_API_URL</code> /{' '}
          <code className="text-bunker-neonDim">VITE_WS_URL</code>
          <br />
          WSL: если localhost не работает, укажите IP WSL в .env
        </p>
      </div>
    </div>
  );
}
