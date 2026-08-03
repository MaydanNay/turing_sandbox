# Карты «Персонаж» — иллюстрации на лицевой стороне

Кладите сюда **нарисованные** портреты персонажей для игровой карты типа `character`.

## Именование

`{id}_card.png`:

```
vance_card.png
cole_card.png
martha_card.png
penny_card.png
gwen_card.png
logan_card.png
chester_card.png
roxy_card.png
```

Сейчас загружены все 8 персонажей.

## В коде

```ts
ASSETS.cards.character('cole') // → /assets/cards/characters/cole_card.png
```

Новый персонаж: файл + id в `CHARACTER_CARD_IDS` (`src/config/assets.ts`).

Если файла нет — chibi, затем placeholder.

## Рекомендации

- PNG или WebP, пропорции ~2:3 (например 400×600 px)
- Персонаж по пояс или в полный рост
