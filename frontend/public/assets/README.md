# Игровые ассеты — Станция Тьюринг

Кладите **все картинки** сюда: `frontend/public/assets/`

Vite отдаёт их как статику по URL `/assets/...`.

## Структура папок

```
public/assets/
├── locations/
│   ├── outpost.jpg              # Фон аванпоста
│   ├── brig.png                 # Карцер (prop, размещается в scene editor)
│   └── menu.png                 # Главное меню — 1920×1080 (16:9)
├── table/
│   ├── table.png                # Стол по центру
│   └── seats/
│       ├── empty/               # 8 пустых стульев (по позициям)
│       │   ├── 01.png … 08.png
│       └── occupied/            # Стул + сидящий персонаж
│           ├── 01-captain.png
│           ├── 02-medic.png
│           └── …
├── characters/
│   ├── chibi/                   # Чиби на локации (фаза аванпоста)
│   └── chat/                    # Полноразмерные портреты для приватного чата
├── cards/
│   └── characters/              # Иллюстрации на карте «Персонаж»
└── ui/
```

## Нумерация мест (01–08)

Позиции идут **по часовой стрелке**, начиная **сверху** (12 часов):

```
        01
   08        02
 07    ⊙    03
   06        04
        05
```

Каждый стул нарисован под **свой ракурс** — поэтому 8 отдельных файлов, не один.

## Именование

| Что | Папка | Пример |
|-----|-------|--------|
| Стол | `table/` | `table.png` |
| Пустой стул | `table/seats/empty/` | `03.png` |
| Стул + персонаж | `table/seats/occupied/` | `03-engineer.png` |
| Портрет для чата | `characters/chat/` | `cole_chat.png` |
| Карта «Персонаж» | `cards/characters/` | `cole_card.png` |

**ID персонажа** — латиница, lowercase:

| Персонаж | ID в имени файла |
|----------|------------------|
| Капитан | `captain` |
| Медик | `medic` |
| Инженер | `engineer` |
| Биолог | `biologist` |
| … | … |

Пример полного набора occupied:
```
01-captain.png
02-medic.png
03-engineer.png
04-biologist.png
05-pilot.png
06-guard.png
07-radio.png
08-plumber.png
```

## Подготовка файлов

- PNG с **прозрачным** фоном
- Обрезать лишнюю прозрачность (небольшой отступ под glow — ок)
- Стол: ~1500–2000 px по ширине
- Стулья: одинаковый «логический» размер между empty и occupied

## В коде

`src/config/assets.ts`:

```ts
ASSETS.table.round                    // стол
ASSETS.table.seatEmpty(3)             // /assets/table/seats/empty/03.png
ASSETS.table.seatOccupied(3, 'medic') // /assets/table/seats/occupied/03-medic.png
```

После добавления файлов — **обновите страницу** в браузере.
