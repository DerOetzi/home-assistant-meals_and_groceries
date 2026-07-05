from __future__ import annotations

import locale
import math

from homeassistant.components.todo import (
    TodoItem,
    TodoItemStatus,
    TodoListEntity,
    TodoListEntityFeature,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .models import ShoppingCategory, TodoItemRecord
from .store import CategoryStore, TodoItemStore

try:
    locale.setlocale(locale.LC_COLLATE, "de_DE.UTF-8")
    _COLLATE_KEY = locale.strxfrm
except locale.Error:
    _COLLATE_KEY = str.casefold


def _sort_key(item: TodoItemRecord, categories_by_id: dict[str, ShoppingCategory]) -> tuple[float, str]:
    category = categories_by_id.get(item.category_id) if item.category_id else None
    sort_index = category.sort_index if category else math.inf
    return (sort_index, _COLLATE_KEY(item.summary))


async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    data = hass.data[DOMAIN][config_entry.entry_id]
    entity = MealsAndGroceriesTodoListEntity(
        config_entry, data["categories"], data["todo_items"]
    )
    data["entity"] = entity
    async_add_entities([entity])


class MealsAndGroceriesTodoListEntity(TodoListEntity):
    """A shopping list backed by structured category/product data instead of ICS."""

    _attr_supported_features = (
        TodoListEntityFeature.CREATE_TODO_ITEM
        | TodoListEntityFeature.UPDATE_TODO_ITEM
        | TodoListEntityFeature.DELETE_TODO_ITEM
        | TodoListEntityFeature.SET_DESCRIPTION_ON_ITEM
    )

    def __init__(
        self,
        config_entry: ConfigEntry,
        category_store: CategoryStore,
        todo_store: TodoItemStore,
    ) -> None:
        self._config_entry = config_entry
        self._category_store = category_store
        self._todo_store = todo_store
        self._attr_unique_id = config_entry.entry_id
        self._attr_name = config_entry.title

    @property
    def todo_items(self) -> list[TodoItem]:
        categories_by_id = {c.id: c for c in self._category_store.categories}
        records = sorted(
            self._todo_store.items, key=lambda item: _sort_key(item, categories_by_id)
        )
        return [
            TodoItem(
                uid=record.uid,
                summary=record.summary,
                status=(
                    TodoItemStatus.COMPLETED
                    if record.status == "completed"
                    else TodoItemStatus.NEEDS_ACTION
                ),
                description=record.description,
            )
            for record in records
        ]

    async def async_create_todo_item(self, item: TodoItem) -> None:
        summary = (item.summary or "").strip()
        if not summary:
            return
        if self._todo_store.find_needs_action_by_summary(summary) is not None:
            return
        self._todo_store.add(summary=summary, description=item.description)
        await self._todo_store.async_save()
        self.async_write_ha_state()

    async def async_update_todo_item(self, item: TodoItem) -> None:
        status = (
            "completed" if item.status == TodoItemStatus.COMPLETED else "needs_action"
        )
        self._todo_store.update(
            item.uid, summary=item.summary, status=status, description=item.description
        )
        await self._todo_store.async_save()
        self.async_write_ha_state()

    async def async_delete_todo_items(self, uids: list[str]) -> None:
        for uid in uids:
            self._todo_store.delete(uid)
        await self._todo_store.async_save()
        self.async_write_ha_state()
