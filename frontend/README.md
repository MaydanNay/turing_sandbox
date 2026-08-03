# Turing Sandbox — Frontend (MVP)

Клиент «Станция Тьюринг / Аванпост» — React + TypeScript + Tailwind + Framer Motion + Zustand.

## Требования

- Node.js 20+ **внутри WSL** (не Windows npm по UNC-пути)
- Backend на `http://localhost:8003` (Docker)

### Установка Node в WSL (если ещё нет)

```bash
curl -fsSL https://fnm.vercel.app/install | bash
# перезапустите терминал
fnm install 22
fnm use 22
```

## Быстрый старт

```bash
cd /home/diana/progects/turing_sandbox/frontend
cp .env.example .env
npm install
npm run dev
```

Откройте http://localhost:5173

## Режимы

1. **Mock-сцена** — 8 игроков за круглым столом, анимации, чат, смена фаз (без бэкенда).
2. **Live WS** — создаёт сессию через `POST /api/v1/sessions` и подключается к WebSocket.

## WSL / Windows routing

Если браузер в Windows не достучится до `localhost:8003`, укажите IP WSL в `.env`:

```env
VITE_API_URL=http://172.x.x.x:8003
VITE_WS_URL=ws://172.x.x.x:8003
VITE_API_PROXY_TARGET=http://172.x.x.x:8003
```

IP WSL: `hostname -I | awk '{print $1}'`

## Ассеты (картинки)

Все изображения кладите в **`frontend/public/assets/`** — подробнее в
[`public/assets/README.md`](public/assets/README.md).

| Папка | Что класть |
|-------|------------|
| `locations/` | Фоны аванпоста |
| `table/` | Стол, стулья |
| `characters/chibi/` | Чиби персонажей |
| `cards/` | Рамки карточек, штампы |
| `ui/` | Логотип, оверлеи |

Пути в коде: `src/config/assets.ts`

├── api/           # REST helpers
├── components/    # GameScene, RoundTable, PlayerSeat, ChatBox, ActionBar
├── config/        # env + phase mapping
├── providers/     # WebSocketProvider
├── store/         # Zustand gameStore
└── types/         # Strict TS contracts
```
