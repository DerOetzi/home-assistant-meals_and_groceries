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

from .const import DOMAIN, GLOBAL_DATA_KEY, SUBENTRY_TYPE_SHOPPING_LIST
from .entities import refresh_list_sensors, shopping_list_device_info
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
    for subentry_id, subentry in config_entry.subentries.items():
        if subentry.subentry_type != SUBENTRY_TYPE_SHOPPING_LIST:
            continue
        data = hass.data[DOMAIN][subentry_id]
        entity = MealsAndGroceriesTodoListEntity(
            subentry_id, subentry.title, data["categories"], data["todo_items"]
        )
        data["entity"] = entity
        async_add_entities([entity], config_subentry_id=subentry_id)


class MealsAndGroceriesTodoListEntity(TodoListEntity):
    """A shopping list backed by structured category/product data instead of ICS."""

    _attr_supported_features = (
        TodoListEntityFeature.CREATE_TODO_ITEM
        | TodoListEntityFeature.UPDATE_TODO_ITEM
        | TodoListEntityFeature.DELETE_TODO_ITEM
        | TodoListEntityFeature.SET_DESCRIPTION_ON_ITEM
    )
    _attr_has_entity_name = True
    _attr_name = None

    def __init__(
        self,
        subentry_id: str,
        name: str,
        category_store: CategoryStore,
        todo_store: TodoItemStore,
    ) -> None:
        self._subentry_id = subentry_id
        self._category_store = category_store
        self._todo_store = todo_store
        self._attr_unique_id = subentry_id
        self._attr_device_info = shopping_list_device_info(subentry_id, name)

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
        raw_summary = (item.summary or "").strip()
        if not raw_summary:
            return

        product_id, category_id, summary = self._resolve_product(raw_summary)

        if self._todo_store.find_needs_action_by_summary(summary) is not None:
            return
        self._todo_store.add(
            summary=summary,
            product_id=product_id,
            category_id=category_id,
            description=item.description,
        )
        await self._todo_store.async_save()
        self.async_write_ha_state()
        refresh_list_sensors(self.hass, self._subentry_id)

    def _resolve_product(
        self, raw_summary: str
    ) -> tuple[str | None, str | None, str]:
        """Match a manually typed item (native todo-list card) against the
        product catalog by exact name, so its category/sort order is set
        automatically. Returns (product_id, category_id, clean_summary).
        """
        products = self.hass.data[DOMAIN][GLOBAL_DATA_KEY]["products"].products
        needle = raw_summary.casefold()
        for product in products:
            if (
                product.store_subentry_id == self._subentry_id
                and product.name.casefold() == needle
            ):
                return product.id, product.category_id, product.name
        return None, None, raw_summary

    async def async_update_todo_item(self, item: TodoItem) -> None:
        status = (
            "completed" if item.status == TodoItemStatus.COMPLETED else "needs_action"
        )
        self._todo_store.update(
            item.uid, summary=item.summary, status=status, description=item.description
        )
        await self._todo_store.async_save()
        self.async_write_ha_state()
        refresh_list_sensors(self.hass, self._subentry_id)

    async def async_delete_todo_items(self, uids: list[str]) -> None:
        for uid in uids:
            self._todo_store.delete(uid)
        await self._todo_store.async_save()
        self.async_write_ha_state()
        refresh_list_sensors(self.hass, self._subentry_id)
