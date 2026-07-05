from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN, PLATFORMS
from .store import CategoryStore, TodoItemStore


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    category_store = CategoryStore(hass, entry.entry_id)
    await category_store.async_load()

    todo_store = TodoItemStore(hass, entry.entry_id)
    await todo_store.async_load()

    hass.data.setdefault(DOMAIN, {})
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
    return unload_ok


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await CategoryStore(hass, entry.entry_id).async_remove()
    await TodoItemStore(hass, entry.entry_id).async_remove()
