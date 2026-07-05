from __future__ import annotations

import dataclasses
import uuid

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DOMAIN, STORAGE_VERSION
from .models import ShoppingCategory, TodoItemRecord


class CategoryStore:
    """Persists the ordered list of categories for one shopping list."""

    def __init__(self, hass: HomeAssistant, config_entry_id: str) -> None:
        self._store = Store(hass, STORAGE_VERSION, f"{DOMAIN}.categories_{config_entry_id}")
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

    def __init__(self, hass: HomeAssistant, config_entry_id: str) -> None:
        self._store = Store(hass, STORAGE_VERSION, f"{DOMAIN}.todo_{config_entry_id}")
        self.items: list[TodoItemRecord] = []

    async def async_load(self) -> None:
        data = await self._store.async_load()
        if data:
            self.items = [TodoItemRecord(**i) for i in data.get("items", [])]

    async def async_save(self) -> None:
        await self._store.async_save(
            {"items": [dataclasses.asdict(i) for i in self.items]}
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

    def delete(self, uid: str) -> None:
        self.items = [i for i in self.items if i.uid != uid]
