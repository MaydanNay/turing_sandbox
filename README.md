# diana (старт)

  cd /home/diana/progects/turing_sandbox
  docker compose up -d


  source ~/.bashrc
  fnm use 22

  cd /home/diana/progects/turing_sandbox/frontend
  cp .env.example .env   # только первый раз
  npm install            # только первый раз
  npm run dev

# diana (првоерка)
  curl http://localhost:8003/health

# diana (остановка)
  cd /home/diana/progects/turing_sandbox
  docker compose down  

> **UI / как выглядит игра (для фронта и масштабирования):** [docs/GAME_UI.md](docs/GAME_UI.md)

# Turing Sandbox — «Бункер» (MVP Backend)

Скелет бэкенда для реалтайм-игры «Бункер»: FastAPI + PostgreSQL + Redis + WebSockets + mock-агенты Helixa.

## Стек

- Python 3.11+, FastAPI (async)
- PostgreSQL (asyncpg + SQLAlchemy 2.0) — история сессий
- Redis — стейт комнаты и буфер событий
- Docker Compose

## Быстрый старт

```bash
cd turing_sandbox
docker compose up -d --build
```

Сервисы:

| Сервис   | Порт на хосте | Назначение                                |
|----------|---------------|-------------------------------------------|
| API      | `8001`        | FastAPI + WebSocket (внутри контейнера 8000) |
| Postgres | `5433`        | БД (внутри контейнера 5432)               |
| Redis    | `6380`        | Стейт комнат (внутри контейнера 6379)     |

> В монорепо Mixnet порт `8000` часто занят Mimora, поэтому снаружи API слушает **8001**.  
> Для Дианы: `http://localhost:8001` и `ws://localhost:8001/ws/room/...`.

Проверка:

```bash
curl http://localhost:8001/health
# {"status":"ok","service":"turing_sandbox"}
```

Swagger: http://localhost:8001/docs

### WSL / доступ для фронтенда (Диана)

API слушает `0.0.0.0:8000` и проброшен наружу. Из Windows / React-devserver:

- `http://localhost:8001`
- WebSocket: `ws://localhost:8001/ws/room/{room_id}/{client_id}`

CORS на MVP: `allow_origins=["*"]`.

Логи API:

```bash
docker compose logs -f api
```

Остановка:

```bash
docker compose down
```

---

## API-контракт (кратко)

### Создать сессию / комнату

```bash
curl -X POST http://localhost:8001/api/v1/sessions
```

Ответ:

```json
{
  "session_id": "…",
  "room_id": "…",
  "status": "active",
  "ws_url": "ws://localhost:8001/ws/room/{room_id}/{client_id}"
}
```

`room_id` == `session_id` (UUID). Подставляете свой `client_id` (строка, например `diana-1`).

### Стейт комнаты (HTTP)

```bash
curl http://localhost:8001/api/v1/sessions/{room_id}/state
```

### Завершить сессию → запись истории в PostgreSQL

```bash
curl -X POST http://localhost:8001/api/v1/sessions/{room_id}/finish \
  -H "Content-Type: application/json" \
  -d '{"winner_id": "diana-1"}'
```

Все события из Redis-буфера улетают в таблицу `game_events`, статус сессии → `finished`.

---

## WebSocket

**URL:** `ws://{host}/ws/room/{room_id}/{client_id}`

При коннекте сервер сразу шлёт текущий стейт:

```json
{
  "type": "state",
  "room_id": "…",
  "client_id": "…",
  "state": {
    "phase": "Pitch",
    "players": { "…": { "client_id": "…", "role": "Врач", "is_ai": false } }
  }
}
```

### Входящие сообщения (клиент → сервер)

```json
{"action": "chat", "text": "привет"}
```

| action  | Назначение                                      |
|---------|--------------------------------------------------|
| `chat`  | Чат в комнате (рассылка всем)                    |
| `pitch` | Речь на этапе Pitch                              |
| `vote`  | Голос (`text` / `payload` — кого выкидываем)     |
| `phase` | Смена фазы: `{"action":"phase","text":"Conflict"}` |

Фазы: `Init` → `Pitch` → `Conflict` → `Vote` → `Finished`.

### Исходящие (сервер → клиенты)

- `state` / `player_joined` / `player_left`
- `message` — эхо чата/pitch/vote всем в room
- `phase_changed`
- сообщения mock-бота: `"is_ai": true`

---

## Как мокать WS (тесты без UI)

### 1) wscat

```bash
npm i -g wscat

# 1. Создать комнату
ROOM=$(curl -s -X POST http://localhost:8001/api/v1/sessions | python3 -c "import sys,json; print(json.load(sys.stdin)['room_id'])")
echo "ROOM=$ROOM"

# 2. Подключиться
wscat -c "ws://localhost:8001/ws/room/$ROOM/human-1"

# 3. В консоли wscat отправить:
{"action":"chat","text":"привет"}
{"action":"pitch","text":"Я инженер, могу чинить генератор"}
{"action":"phase","text":"Conflict"}
```

Через 3–8 секунд после join/chat mock-бот ответит хардкодом:  
*«Я врач, я вам нужен в бункере! Не голосуйте против меня!»*

### 2) Postman

1. New → WebSocket Request  
2. URL: `ws://localhost:8001/ws/room/<room_id>/postman-1`  
3. Connect → в Messages отправить JSON выше.

### 3) websockets (Python)

```bash
pip install websockets
python - <<'PY'
import asyncio, json, websockets, urllib.request

room = json.load(urllib.request.urlopen(urllib.request.Request(
    "http://localhost:8001/api/v1/sessions", method="POST")))["room_id"]

async def main():
    uri = f"ws://localhost:8001/ws/room/{room}/py-client"
    async with websockets.connect(uri) as ws:
        print(await ws.recv())
        await ws.send(json.dumps({"action": "chat", "text": "привет"}))
        for _ in range(5):
            print(await asyncio.wait_for(ws.recv(), timeout=15))

asyncio.run(main())
PY
```

---

## Mock-агенты (изоляция Helixa)

При входе человека, если мест меньше `ROOM_CAPACITY` (по умолчанию 4), сервер «подключает» ботов:

- роль из пула (`Врач`, `Инженер`, …);
- на фазах Pitch/Conflict — `asyncio.sleep(random 3..8)` и хардкод-реплика в общий канал;
- события бота пишутся в Redis-буфер с `is_ai=true` и при `finish` попадают в Postgres.

---

## Структура

```
turing_sandbox/
├── docker-compose.yml
├── Dockerfile
├── alembic/ + alembic.ini
├── app/
│   ├── main.py              # FastAPI + CORS + lifespan
│   ├── models.py            # sessions, game_events
│   ├── redis_state.py       # стейт комнаты в Redis
│   ├── connection_manager.py
│   ├── mock_agent.py        # фоновые mock-боты
│   ├── services.py          # finish → Postgres
│   └── routers/
│       ├── sessions.py
│       └── ws.py
└── README.md
```

## Локальный запуск без Docker (опционально)

Нужны Postgres на `:5433` и Redis на `:6380`, затем:

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# поправьте DATABASE_URL на localhost:5433
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
