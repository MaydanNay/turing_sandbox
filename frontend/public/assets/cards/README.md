# Иллюстрации карт (раскрытие в чате)

Положите PNG в подпапку по типу карты. Имя файла: `{slug}_card.png`

## Пути

| Тип | Папка | Пример |
|-----|-------|--------|
| skill | `skills/` | `skills/hacking_card.png` ← «Хакерство» |
| biometrics | `biometrics/` | `biometrics/hand-tremor_card.png` |
| inventory | `inventory/` | `inventory/card-deck_card.png` |
| trait | `trait/` | `trait/pathological-liar_card.png` |
| secret_mission | `secret_mission/` | `secret_mission/sympathizer-protocol_card.png` |
| character | `characters/` | `characters/chester_card.png` (уже есть) |

Slug задаётся в `src/utils/cardArt.ts` (`TITLE_ART_SLUG`) или генерируется из названия карты.

Если файла нет — показывается CSS-заглушка как в руке игрока.
