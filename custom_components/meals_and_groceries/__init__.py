from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall

from .barcode import SCAN_BARCODE_SCHEMA, async_handle_scan_barcode
from .const import DOMAIN, GLOBAL_DATA_KEY, PLATFORMS, SERVICE_SCAN_BARCODE
from .store import CategoryStore, ProductStore, TodoItemStore


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hass.data.setdefault(DOMAIN, {})

    if GLOBAL_DATA_KEY not in hass.data[DOMAIN]:
        product_store = ProductStore(hass)
        await product_store.async_load()
        hass.data[DOMAIN][GLOBAL_DATA_KEY] = {"products": product_store}

        async def _handle_scan_barcode(call: ServiceCall) -> None:
            await async_handle_scan_barcode(hass, call)

        hass.services.async_register(
            DOMAIN,
            SERVICE_SCAN_BARCODE,
            _handle_scan_barcode,
            schema=SCAN_BARCODE_SCHEMA,
        )

    category_store = CategoryStore(hass, entry.entry_id)
    await category_store.async_load()

    todo_store = TodoItemStore(hass, entry.entry_id)
    await todo_store.async_load()

    hass.data[DOMAIN][entry.entry_id] = {
        "categories": category_store,
        "todo_items": todo_store,
    }

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)
        if not any(key != GLOBAL_DATA_KEY for key in hass.data[DOMAIN]):
            hass.services.async_remove(DOMAIN, SERVICE_SCAN_BARCODE)
            hass.data[DOMAIN].pop(GLOBAL_DATA_KEY, None)
    return unload_ok


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await CategoryStore(hass, entry.entry_id).async_remove()
    await TodoItemStore(hass, entry.entry_id).async_remove()
