from __future__ import annotations

from datetime import datetime

from homeassistant.config_entries import SOURCE_IMPORT, ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers.event import async_track_time_change

from .barcode import SCAN_BARCODE_SCHEMA, async_handle_scan_barcode
from .const import (
    CONF_KIND,
    DOMAIN,
    ENTRY_KIND_HUB,
    ENTRY_KIND_SHOPPING_LIST,
    GLOBAL_DATA_KEY,
    PLATFORMS_BY_KIND,
    SERVICE_SCAN_BARCODE,
    SERVICE_SET_DAY_MEAL,
)
from .mealplan import (
    SET_DAY_MEAL_SCHEMA,
    async_handle_midnight_reset,
    async_handle_set_day_meal,
)
from .store import CategoryStore, DishStore, MealPlanStore, ProductStore, TodoItemStore


def _entry_kind(entry: ConfigEntry) -> str:
    return entry.data.get(CONF_KIND, ENTRY_KIND_SHOPPING_LIST)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hass.data.setdefault(DOMAIN, {})
    kind = _entry_kind(entry)

    if kind == ENTRY_KIND_HUB:
        await _async_setup_hub_entry(hass, entry)
    else:
        category_store = CategoryStore(hass, entry.entry_id)
        await category_store.async_load()

        todo_store = TodoItemStore(hass, entry.entry_id)
        await todo_store.async_load()

        hass.data[DOMAIN][entry.entry_id] = {
            "categories": category_store,
            "todo_items": todo_store,
        }

        _async_ensure_hub_exists(hass)

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS_BY_KIND[kind])
    return True


def _async_ensure_hub_exists(hass: HomeAssistant) -> None:
    """Auto-create the singleton management hub on the first shopping list.

    The hub is its own independent config entry once created — it is not
    tied to the shopping list that triggered its creation and survives that
    list being renamed or removed later.
    """
    hub_exists = any(
        entry.data.get(CONF_KIND) == ENTRY_KIND_HUB
        for entry in hass.config_entries.async_entries(DOMAIN)
    )
    if not hub_exists:
        hass.async_create_task(
            hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_IMPORT})
        )


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    kind = _entry_kind(entry)
    unload_ok = await hass.config_entries.async_unload_platforms(
        entry, PLATFORMS_BY_KIND[kind]
    )
    if unload_ok:
        if kind == ENTRY_KIND_HUB:
            hass.data[DOMAIN][GLOBAL_DATA_KEY]["midnight_unsub"]()
            hass.services.async_remove(DOMAIN, SERVICE_SCAN_BARCODE)
            hass.services.async_remove(DOMAIN, SERVICE_SET_DAY_MEAL)
            hass.data[DOMAIN].pop(GLOBAL_DATA_KEY, None)
        else:
            hass.data[DOMAIN].pop(entry.entry_id)
    return unload_ok


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    if _entry_kind(entry) == ENTRY_KIND_SHOPPING_LIST:
        await CategoryStore(hass, entry.entry_id).async_remove()
        await TodoItemStore(hass, entry.entry_id).async_remove()


async def _async_setup_hub_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
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
