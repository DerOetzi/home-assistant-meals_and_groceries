from __future__ import annotations

import os
from datetime import datetime

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers.event import async_track_time_change
from homeassistant.helpers.storage import Store

from .barcode import SCAN_BARCODE_SCHEMA, async_handle_scan_barcode
from .const import (
    DOMAIN,
    GLOBAL_DATA_KEY,
    PLATFORMS,
    SERVICE_SCAN_BARCODE,
    SERVICE_SET_DAY_MEAL,
    STORAGE_VERSION,
    SUBENTRY_TYPE_SHOPPING_LIST,
)
from .mealplan import (
    SET_DAY_MEAL_SCHEMA,
    async_handle_midnight_reset,
    async_handle_set_day_meal,
)
from .store import CategoryStore, DishStore, MealPlanStore, ProductStore, TodoItemStore


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hass.data.setdefault(DOMAIN, {})

    product_store = ProductStore(hass)
    await product_store.async_load()

    dish_store = DishStore(hass)
    await dish_store.async_load()

    mealplan_store = MealPlanStore(hass)
    await mealplan_store.async_load()

    async def _handle_scan_barcode(call: ServiceCall) -> None:
        await async_handle_scan_barcode(hass, call)

    async def _handle_set_day_meal(call: ServiceCall) -> None:
        await async_handle_set_day_meal(hass, call)

    async def _handle_midnight(now: datetime) -> None:
        await async_handle_midnight_reset(hass, now)

    hass.services.async_register(
        DOMAIN, SERVICE_SCAN_BARCODE, _handle_scan_barcode, schema=SCAN_BARCODE_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_SET_DAY_MEAL, _handle_set_day_meal, schema=SET_DAY_MEAL_SCHEMA
    )

    midnight_unsub = async_track_time_change(
        hass, _handle_midnight, hour=0, minute=10, second=0
    )

    hass.data[DOMAIN][GLOBAL_DATA_KEY] = {
        "products": product_store,
        "dishes": dish_store,
        "mealplan": mealplan_store,
        "midnight_unsub": midnight_unsub,
    }

    for subentry_id, subentry in entry.subentries.items():
        if subentry.subentry_type != SUBENTRY_TYPE_SHOPPING_LIST:
            continue
        category_store = CategoryStore(hass, subentry_id)
        await category_store.async_load()

        todo_store = TodoItemStore(hass, subentry_id)
        await todo_store.async_load()

        hass.data[DOMAIN][subentry_id] = {
            "categories": category_store,
            "todo_items": todo_store,
        }

    await _async_cleanup_orphaned_stores(hass, entry)

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    entry.async_on_unload(entry.add_update_listener(_async_reload_entry))

    return True


async def _async_reload_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Adding/removing a shopping-list subentry does not reload the entry on
    its own — this listener does, so the todo/sensor platforms pick up the
    change (verified empirically; HA does not appear to auto-reload)."""
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN][GLOBAL_DATA_KEY]["midnight_unsub"]()
        hass.services.async_remove(DOMAIN, SERVICE_SCAN_BARCODE)
        hass.services.async_remove(DOMAIN, SERVICE_SET_DAY_MEAL)
        hass.data[DOMAIN].pop(GLOBAL_DATA_KEY, None)
        for subentry_id in list(entry.subentries):
            hass.data[DOMAIN].pop(subentry_id, None)
    return unload_ok


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await ProductStore(hass).async_remove()
    await DishStore(hass).async_remove()
    await MealPlanStore(hass).async_remove()
    for subentry_id in entry.subentries:
        await CategoryStore(hass, subentry_id).async_remove()
        await TodoItemStore(hass, subentry_id).async_remove()


async def _async_cleanup_orphaned_stores(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Remove storage files for shopping-list subentries that no longer exist."""
    current_ids = {
        subentry_id
        for subentry_id, subentry in entry.subentries.items()
        if subentry.subentry_type == SUBENTRY_TYPE_SHOPPING_LIST
    }
    storage_dir = hass.config.path(".storage")
    try:
        filenames = await hass.async_add_executor_job(os.listdir, storage_dir)
    except OSError:
        return

    for filename in filenames:
        for prefix in (f"{DOMAIN}.categories_", f"{DOMAIN}.todo_"):
            if filename.startswith(prefix) and filename[len(prefix) :] not in current_ids:
                await Store(hass, STORAGE_VERSION, filename).async_remove()
