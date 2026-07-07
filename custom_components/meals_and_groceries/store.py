from __future__ import annotations

import dataclasses
import uuid
from datetime import datetime

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import DOMAIN, STORAGE_VERSION
from .models import (
    Dish,
    Group,
    MealPlanDay,
    Product,
    ShoppingCategory,
    Tab,
    TodoItemRecord,
)


class ProductStore:
    """Persists the product master data, shared across all shopping lists."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store = Store(hass, STORAGE_VERSION, f"{DOMAIN}.products")
        self.products: list[Product] = []

    async def async_load(self) -> None:
        data = await self._store.async_load()
        if data:
            self.products = [Product(**p) for p in data.get("products", [])]

    async def async_save(self) -> None:
        await self._store.async_save(
            {"products": [dataclasses.asdict(p) for p in self.products]}
        )

    def find_by_barcode(self, barcode: str) -> Product | None:
        for product in self.products:
            if barcode in product.barcodes:
                return product
        return None

    def get(self, product_id: str) -> Product | None:
        for product in self.products:
            if product.id == product_id:
                return product
        return None

    async def async_remove(self) -> None:
        await self._store.async_remove()

    def add(
        self,
        name: str,
        *,
        store_subentry_id: str,
        category_id: str | None = None,
        barcodes: list[str] | None = None,
        group_ids: list[str] | None = None,
    ) -> Product:
        product = Product(
            id=uuid.uuid4().hex,
            name=name,
            store_subentry_id=store_subentry_id,
            category_id=category_id,
            barcodes=list(barcodes) if barcodes else [],
            group_ids=list(group_ids) if group_ids else [],
        )
        self.products.append(product)
        return product

    def update(
        self,
        product_id: str,
        *,
        name: str,
        category_id: str | None,
        barcodes: list[str],
        group_ids: list[str],
    ) -> None:
        product = self.get(product_id)
        if product is None:
            raise KeyError(product_id)
        product.name = name
        product.category_id = category_id
        product.barcodes = list(barcodes)
        product.group_ids = list(group_ids)

    def delete(self, product_id: str) -> None:
        self.products = [p for p in self.products if p.id != product_id]


class DishStore:
    """Persists dishes/restaurants that can be referenced from the meal plan."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store = Store(hass, STORAGE_VERSION, f"{DOMAIN}.dishes")
        self.dishes: list[Dish] = []

    async def async_load(self) -> None:
        data = await self._store.async_load()
        if data:
            self.dishes = [Dish(**d) for d in data.get("dishes", [])]

    async def async_save(self) -> None:
        await self._store.async_save(
            {"dishes": [dataclasses.asdict(d) for d in self.dishes]}
        )

    async def async_remove(self) -> None:
        await self._store.async_remove()

    def get(self, dish_id: str) -> Dish | None:
        for dish in self.dishes:
            if dish.id == dish_id:
                return dish
        return None

    def add(
        self,
        name: str,
        *,
        kind: str,
        notes: str | None = None,
        ingredients: list[str] | None = None,
    ) -> Dish:
        dish = Dish(
            id=uuid.uuid4().hex,
            name=name,
            kind=kind,
            notes=notes,
            ingredients=list(ingredients) if ingredients else [],
        )
        self.dishes.append(dish)
        return dish

    def update(
        self,
        dish_id: str,
        *,
        name: str,
        kind: str,
        notes: str | None,
        ingredients: list[str],
    ) -> None:
        dish = self.get(dish_id)
        if dish is None:
            raise KeyError(dish_id)
        dish.name = name
        dish.kind = kind
        dish.notes = notes
        dish.ingredients = list(ingredients)

    def delete(self, dish_id: str) -> None:
        self.dishes = [d for d in self.dishes if d.id != dish_id]


class GroupStore:
    """Persists the global, store-independent product groups."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store = Store(hass, STORAGE_VERSION, f"{DOMAIN}.groups")
        self.groups: list[Group] = []

    async def async_load(self) -> None:
        data = await self._store.async_load()
        if data:
            self.groups = [Group(**g) for g in data.get("groups", [])]

    async def async_save(self) -> None:
        await self._store.async_save(
            {"groups": [dataclasses.asdict(g) for g in self.groups]}
        )

    async def async_remove(self) -> None:
        await self._store.async_remove()

    def get(self, group_id: str) -> Group | None:
        for group in self.groups:
            if group.id == group_id:
                return group
        return None

    def add(self, name: str) -> Group:
        group = Group(id=uuid.uuid4().hex, name=name, sort_index=len(self.groups))
        self.groups.append(group)
        return group

    def update(self, group_id: str, *, name: str) -> None:
        group = self.get(group_id)
        if group is None:
            raise KeyError(group_id)
        group.name = name

    def delete(self, group_id: str) -> None:
        self.groups = [g for g in self.groups if g.id != group_id]

    def reorder(self, ordered_ids: list[str]) -> None:
        by_id = {g.id: g for g in self.groups}
        for index, group_id in enumerate(ordered_ids):
            by_id[group_id].sort_index = index


class TabStore:
    """Persists the configured extra daily-use panel tabs."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store = Store(hass, STORAGE_VERSION, f"{DOMAIN}.tabs")
        self.tabs: list[Tab] = []

    async def async_load(self) -> None:
        data = await self._store.async_load()
        if data:
            self.tabs = [Tab(**t) for t in data.get("tabs", [])]

    async def async_save(self) -> None:
        await self._store.async_save(
            {"tabs": [dataclasses.asdict(t) for t in self.tabs]}
        )

    async def async_remove(self) -> None:
        await self._store.async_remove()

    def get(self, tab_id: str) -> Tab | None:
        for tab in self.tabs:
            if tab.id == tab_id:
                return tab
        return None

    def add(self, name: str, *, group_ids: list[str] | None = None) -> Tab:
        tab = Tab(
            id=uuid.uuid4().hex,
            name=name,
            sort_index=len(self.tabs),
            group_ids=list(group_ids) if group_ids else [],
        )
        self.tabs.append(tab)
        return tab

    def update(self, tab_id: str, *, name: str, group_ids: list[str]) -> None:
        tab = self.get(tab_id)
        if tab is None:
            raise KeyError(tab_id)
        tab.name = name
        tab.group_ids = list(group_ids)

    def delete(self, tab_id: str) -> None:
        self.tabs = [t for t in self.tabs if t.id != tab_id]

    def reorder(self, ordered_ids: list[str]) -> None:
        by_id = {t.id: t for t in self.tabs}
        for index, tab_id in enumerate(ordered_ids):
            by_id[tab_id].sort_index = index


class MealPlanStore:
    """Persists the 7 weekday slots of the weekly meal plan."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store = Store(hass, STORAGE_VERSION, f"{DOMAIN}.mealplan")
        self.days: list[MealPlanDay] = [MealPlanDay(weekday_index=i) for i in range(7)]

    async def async_load(self) -> None:
        data = await self._store.async_load()
        if data and data.get("days"):
            by_index = {d["weekday_index"]: MealPlanDay(**d) for d in data["days"]}
            self.days = [by_index.get(i, MealPlanDay(weekday_index=i)) for i in range(7)]

    async def async_save(self) -> None:
        await self._store.async_save(
            {"days": [dataclasses.asdict(d) for d in self.days]}
        )

    async def async_remove(self) -> None:
        await self._store.async_remove()

    def get_day(self, weekday_index: int) -> MealPlanDay:
        return self.days[weekday_index]

    def set_day(
        self,
        weekday_index: int,
        *,
        dish_id: str | None = None,
        free_text: str | None = None,
    ) -> None:
        self.days[weekday_index] = MealPlanDay(
            weekday_index=weekday_index, dish_id=dish_id, free_text=free_text
        )

    def reset_day(self, weekday_index: int) -> None:
        self.days[weekday_index] = MealPlanDay(weekday_index=weekday_index)


class CategoryStore:
    """Persists the ordered list of categories for one shopping list."""

    def __init__(self, hass: HomeAssistant, subentry_id: str) -> None:
        self._store = Store(hass, STORAGE_VERSION, f"{DOMAIN}.categories_{subentry_id}")
        self.categories: list[ShoppingCategory] = []

    async def async_load(self) -> None:
        data = await self._store.async_load()
        if data:
            self.categories = [ShoppingCategory(**c) for c in data.get("categories", [])]

    async def async_save(self) -> None:
        await self._store.async_save(
            {"categories": [dataclasses.asdict(c) for c in self.categories]}
        )

    async def async_remove(self) -> None:
        await self._store.async_remove()

    def add(self, name: str) -> ShoppingCategory:
        category = ShoppingCategory(
            id=uuid.uuid4().hex, name=name, sort_index=len(self.categories)
        )
        self.categories.append(category)
        return category

    def update(self, category_id: str, *, name: str | None = None) -> None:
        category = self._get(category_id)
        if name is not None:
            category.name = name

    def delete(self, category_id: str) -> None:
        self.categories = [c for c in self.categories if c.id != category_id]

    def reorder(self, ordered_ids: list[str]) -> None:
        by_id = {c.id: c for c in self.categories}
        for index, category_id in enumerate(ordered_ids):
            by_id[category_id].sort_index = index

    def _get(self, category_id: str) -> ShoppingCategory:
        for category in self.categories:
            if category.id == category_id:
                return category
        raise KeyError(category_id)


class TodoItemStore:
    """Persists the items of one shopping list."""

    def __init__(self, hass: HomeAssistant, subentry_id: str) -> None:
        self._store = Store(hass, STORAGE_VERSION, f"{DOMAIN}.todo_{subentry_id}")
        self.items: list[TodoItemRecord] = []
        self.last_changed: datetime | None = None

    async def async_load(self) -> None:
        data = await self._store.async_load()
        if data:
            self.items = [TodoItemRecord(**i) for i in data.get("items", [])]
            last_changed = data.get("last_changed")
            if last_changed:
                self.last_changed = dt_util.parse_datetime(last_changed)

    async def async_save(self) -> None:
        await self._store.async_save(
            {
                "items": [dataclasses.asdict(i) for i in self.items],
                "last_changed": (
                    self.last_changed.isoformat() if self.last_changed else None
                ),
            }
        )

    async def async_remove(self) -> None:
        await self._store.async_remove()

    def get(self, uid: str) -> TodoItemRecord:
        for item in self.items:
            if item.uid == uid:
                return item
        raise KeyError(uid)

    def find_needs_action_by_summary(self, summary: str) -> TodoItemRecord | None:
        needle = summary.strip().casefold()
        for item in self.items:
            if item.status == "needs_action" and item.summary.strip().casefold() == needle:
                return item
        return None

    def add(
        self,
        summary: str,
        *,
        product_id: str | None = None,
        category_id: str | None = None,
        description: str | None = None,
    ) -> TodoItemRecord:
        record = TodoItemRecord(
            uid=uuid.uuid4().hex,
            summary=summary,
            status="needs_action",
            product_id=product_id,
            category_id=category_id,
            description=description,
        )
        self.items.append(record)
        self.last_changed = dt_util.utcnow()
        return record

    def update(
        self,
        uid: str,
        *,
        summary: str | None = None,
        status: str | None = None,
        description: str | None = None,
    ) -> None:
        record = self.get(uid)
        if summary is not None:
            record.summary = summary
        if status is not None:
            record.status = status
        if description is not None:
            record.description = description
        self.last_changed = dt_util.utcnow()

    def delete(self, uid: str) -> None:
        self.items = [i for i in self.items if i.uid != uid]
        self.last_changed = dt_util.utcnow()

    def open_item_count(self) -> int:
        return sum(1 for item in self.items if item.status == "needs_action")
