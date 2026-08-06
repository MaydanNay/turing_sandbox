"""Deal 6-card bunker hands: character + 5 draws from typed decks."""

from __future__ import annotations

import random
from typing import Any, Literal

CardType = Literal[
    "character",
    "skill",
    "biometrics",
    "inventory",
    "trait",
    "secret_mission",
]

CHARACTER_META: dict[str, dict[str, str]] = {
    "vance": {"title": "Vance", "flavor": "Старожил"},
    "cole": {"title": "Cole", "flavor": "Сорванец"},
    "martha": {"title": "Martha", "flavor": "Бунтарка"},
    "penny": {"title": "Penny", "flavor": "Патриарх"},
    "gwen": {"title": "Gwen", "flavor": "Беглец"},
    "logan": {"title": "Logan", "flavor": "Хранительница"},
    "chester": {"title": "Chester", "flavor": "Смельчакка"},
    "roxy": {"title": "Roxy", "flavor": "Отшельница"},
}

# Pools — unique cards dealt without replacement within a room (per type).
SKILL_DECK: list[tuple[str, str]] = [
    ("Старожил станции", "Знает схемы вентиляции и служебные ходы"),
    ("Взлом замков", "Открывает механические и электронные запоры"),
    ("Агитация", "Может склонить группу к своей версии"),
    ("Медицина", "Стабилизирует раненых и читает симптомы"),
    ("Скрытность", "Проходит незамеченной через патрули"),
    ("Архивист", "Находит записи в закрытых терминалах"),
    ("Лазание", "Проходит там, где взрослые не пролезут"),
    ("Хакерство", "Взлом терминалов и обход замков"),
    ("Переговоры", "Снимает напряжение в конфликте одним аргументом"),
    ("Следопыт", "Читает следы в пыли технических коридоров"),
]

BIOMETRICS_DECK: list[tuple[str, str]] = [
    ("Шрам на ладони", "Старый ожог от короткого замыкания"),
    ("Тремор рук", "Падает точность при тонкой работе"),
    ("Кибер-имплант", "Бионический глаз с записью окружения"),
    ("Аритмия", "Периодические скачки пульса под нагрузкой"),
    ("Холодные конечности", "Температура тела ниже нормы"),
    ("Тихий шаг", "Почти не издаёт звуков при ходьбе"),
    ("Детский голос", "Легко узнаваем в записи переговоров"),
    ("Кибер-рука", "Протез с встроенным интерфейсом"),
    ("Хроническая бессонница", "Редко выглядит отдохнувшим"),
    ("Шрам на виске", "Старая травма, ноет при перепадах давления"),
]

INVENTORY_DECK: list[tuple[str, str]] = [
    ("Ключ-карта", "Доступ в технический сектор B"),
    ("Отмычки", "Самодельный набор для вскрытия"),
    ("Графити-спрей", "Оставляет метки на стенах секторов"),
    ("Аптечка", "Базовый набор перевязочных материалов"),
    ("Компас", "Старый механический, всегда при себе"),
    ("Журнал смен", "Записи за последние две недели"),
    ("Фонарик", "Самодельный, мерцает на слабом заряде"),
    ("Портативный терминал", "Старый, но читает локальные логи"),
    ("Колода карт", "Старые игральные карты. Объективно мусор"),
    ("Рация", "Короткий канал связи по станции"),
]

TRAIT_DECK: list[tuple[str, str]] = [
    ("Старожил", "На станции с первых дней экспедиции"),
    ("Сорванец", "Действует импульсивно, не любит правила"),
    ("Бунтарка", "Оспаривает любую официальную версию"),
    ("Патриарх", "Привык командовать и защищать своих"),
    ("Беглец", "Привыкла исчезать до начала разбирательств"),
    ("Хранительница", "Помнит имена всех, кто был на станции"),
    ("Смельчакка", "Не боится лезть в закрытые секции"),
    ("Отшельница", "Избегает общих собраний и разговоров"),
    ("Патологический лжец", "В стрессе всегда приукрашивает"),
    ("Параноик", "Видит угрозу в каждом молчании"),
]

SECRET_MISSION_DECK: list[tuple[str, str]] = [
    ("Протокол: Хранитель", "Не допусти эвакуации подозреваемого"),
    ("Протокол: Диверсант", "Саботируй голосование против синтетика"),
    ("Протокол: Провокатор", "Вызови досрочное голосование"),
    ("Протокол: Наставник", "Убеди группу сохранить порядок"),
    ("Протокол: Бегство", "Подготовь путь к аварийному шлюзу"),
    ("Протокол: Летописец", "Зафиксируй три подозрительных события"),
    ("Протокол: Разведка", "Найди спрятанный проход в секторе C"),
    ("Протокол: Симпатизант", "Сделай так, чтобы Синтетик попал в Конвой"),
    ("Протокол: Судья", "Добейся изгнания двух подозреваемых"),
    ("Протокол: Щит", "Спаси от карцера того, кого считают виновным"),
]

HAND_ORDER: tuple[CardType, ...] = (
    "character",
    "skill",
    "biometrics",
    "inventory",
    "trait",
    "secret_mission",
)


def _slug(title: str) -> str:
    return (
        title.lower()
        .replace(" ", "-")
        .replace(":", "")
        .replace("ё", "е")
    )


def _card(
    *,
    card_type: CardType,
    title: str,
    description: str,
    owner_key: str,
    is_revealed: bool = False,
    image_hint: str | None = None,
) -> dict[str, Any]:
    return {
        "id": f"{owner_key}-{card_type}-{_slug(title)[:24]}",
        "type": card_type,
        "title": title,
        "description": description,
        "is_revealed": is_revealed,
        "image_hint": image_hint,
    }


def _draw(
    deck: list[tuple[str, str]],
    bag: list[tuple[str, str]],
) -> tuple[str, str]:
    if not bag:
        bag.extend(deck)
        random.shuffle(bag)
    return bag.pop()


def build_hands_for_room(
    assignments: dict[str, str | None],
    *,
    professions: dict[str, str | None] | None = None,
) -> dict[str, list[dict[str, Any]]]:
    """
    assignments: client_id -> character_id
    Returns full 6-card hands (incl. secret_mission) per client.
    """
    professions = professions or {}
    skill_bag = list(SKILL_DECK)
    bio_bag = list(BIOMETRICS_DECK)
    inv_bag = list(INVENTORY_DECK)
    trait_bag = list(TRAIT_DECK)
    mission_bag = list(SECRET_MISSION_DECK)
    for bag in (skill_bag, bio_bag, inv_bag, trait_bag, mission_bag):
        random.shuffle(bag)

    hands: dict[str, list[dict[str, Any]]] = {}
    for client_id, character_id in assignments.items():
        cid = (character_id or "vance").strip() or "vance"
        meta = CHARACTER_META.get(cid, {"title": cid.title(), "flavor": "Неизвестный"})
        profession = (professions.get(client_id) or "").strip()
        char_desc = profession or meta["flavor"]

        skill_t, skill_d = _draw(SKILL_DECK, skill_bag)
        bio_t, bio_d = _draw(BIOMETRICS_DECK, bio_bag)
        inv_t, inv_d = _draw(INVENTORY_DECK, inv_bag)
        trait_t, trait_d = _draw(TRAIT_DECK, trait_bag)
        mission_t, mission_d = _draw(SECRET_MISSION_DECK, mission_bag)

        hands[client_id] = [
            _card(
                card_type="character",
                title=meta["title"],
                description=char_desc,
                owner_key=client_id,
                is_revealed=True,
                image_hint=cid,
            ),
            _card(
                card_type="skill",
                title=skill_t,
                description=skill_d,
                owner_key=client_id,
            ),
            _card(
                card_type="biometrics",
                title=bio_t,
                description=bio_d,
                owner_key=client_id,
            ),
            _card(
                card_type="inventory",
                title=inv_t,
                description=inv_d,
                owner_key=client_id,
            ),
            _card(
                card_type="trait",
                title=trait_t,
                description=trait_d,
                owner_key=client_id,
            ),
            _card(
                card_type="secret_mission",
                title=mission_t,
                description=mission_d,
                owner_key=client_id,
            ),
        ]
    return hands


def public_card_view(card: dict[str, Any]) -> dict[str, Any] | None:
    """Strip secrets — never leak secret_mission to other clients."""
    if card.get("type") == "secret_mission":
        return None
    return {
        "id": card.get("id"),
        "type": card.get("type"),
        "title": card.get("title"),
        "description": card.get("description"),
        "is_revealed": bool(card.get("is_revealed")),
        "image_hint": card.get("image_hint"),
    }


def revealed_public_cards(hand: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for card in hand:
        if not card.get("is_revealed"):
            continue
        if card.get("type") in ("secret_mission", "character"):
            continue
        view = public_card_view(card)
        if view:
            out.append(view)
    return out
