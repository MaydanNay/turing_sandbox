import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';

import {
  fetchSessionEvents,
  listSessions,
  type SessionEventItem,
  type SessionSummary,
} from '@/api/sessions';
import { ASSETS } from '@/config/assets';
import { useT } from '@/i18n';

interface SessionHistoryScreenProps {
  onBack: () => void;
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function eventPreview(ev: SessionEventItem): string {
  const payload = ev.raw_payload ?? {};
  const text = typeof payload.text === 'string' ? payload.text : '';
  if (text) return text;
  if (ev.action_type === 'phase') {
    return `фаза → ${String(payload.phase ?? '?')}`;
  }
  return ev.action_type;
}

export function SessionHistoryScreen({ onBack }: SessionHistoryScreenProps) {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [events, setEvents] = useState<SessionEventItem[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedId(null);
    setEvents([]);
    listSessions({ status: 'finished', limit: 40 })
      .then((rows) => {
        if (!cancelled) setSessions(rows);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Не удалось загрузить историю');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setEventsLoading(true);
    fetchSessionEvents(selectedId)
      .then((res) => {
        if (!cancelled) setEvents(res.events);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      })
      .finally(() => {
        if (!cancelled) setEventsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  return (
    <div className="relative h-full min-h-screen w-full overflow-hidden bg-black text-bunker-text">
      <img
        src={ASSETS.locations.menu}
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center opacity-40"
        width={1920}
        height={1080}
        draggable={false}
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/70 via-black/80 to-black"
        aria-hidden
      />

      <div className="relative z-10 flex h-full min-h-screen flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-8">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-bunker-muted">
              Turing Station
            </p>
            <h1 className="mt-1 font-display text-xl font-semibold tracking-wide text-white sm:text-2xl">
              {t('history.title')}
            </h1>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded border border-bunker-border/80 bg-black/60 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-bunker-muted backdrop-blur-sm transition hover:border-bunker-neon/50 hover:text-bunker-neon"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t('history.back')}
          </button>
        </header>

        <div className="grid min-h-0 w-full flex-1 grid-cols-1 gap-0 overflow-hidden md:grid-cols-[minmax(260px,340px)_1fr]">
          <aside className="custom-scrollbar min-h-0 overflow-y-auto border-b border-white/10 md:border-b-0 md:border-r md:border-white/10">
            {loading ? (
              <div className="flex items-center justify-center gap-2 px-5 py-16 text-sm text-bunker-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                Загрузка…
              </div>
            ) : error ? (
              <p className="px-5 py-8 text-sm text-bunker-danger">{error}</p>
            ) : sessions.length === 0 ? (
              <p className="px-5 py-8 text-sm text-bunker-muted">
                Пока нет завершённых матчей.
              </p>
            ) : (
              <ul className="divide-y divide-white/5 py-2">
                {sessions.map((s) => (
                  <li key={s.session_id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(s.room_id)}
                      className={`flex w-full flex-col gap-0.5 px-5 py-3.5 text-left transition hover:bg-white/5 ${
                        selectedId === s.room_id
                          ? 'bg-bunker-neon/10 ring-1 ring-inset ring-bunker-neon/25'
                          : ''
                      }`}
                    >
                      <span className="font-mono text-xs text-bunker-neon">
                        {s.room_id.slice(0, 8)}…
                      </span>
                      <span className="text-xs text-bunker-muted">
                        {formatWhen(s.created_at)} · {s.events_count} событий
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <section className="custom-scrollbar min-h-0 overflow-y-auto px-5 py-5 sm:px-8">
            {!selectedId ? (
              <p className="text-sm text-bunker-muted">
                Выберите матч слева, чтобы увидеть лог событий.
              </p>
            ) : eventsLoading ? (
              <div className="flex items-center gap-2 text-sm text-bunker-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                События…
              </div>
            ) : events.length === 0 ? (
              <p className="text-sm text-bunker-muted">Нет сохранённых событий.</p>
            ) : (
              <ul className="space-y-2.5">
                {events.map((ev, index) => (
                  <li
                    key={ev.id ?? `${ev.timestamp}-${index}`}
                    className="rounded-xl border border-white/10 bg-black/45 px-4 py-3 backdrop-blur-sm"
                  >
                    <p className="font-mono text-[10px] uppercase tracking-wider text-bunker-muted">
                      {ev.action_type}
                      {ev.is_ai ? ' · AI' : ''} · {ev.user_id}
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed text-bunker-text">
                      {eventPreview(ev)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
