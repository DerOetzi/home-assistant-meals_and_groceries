from __future__ import annotations

from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceInfo

from .const import DOMAIN


def shopping_list_device_info(entry_id: str, name: str) -> DeviceInfo:
    """Shared device each shopping list's todo entity and sensors belong to."""
    return DeviceInfo(
        identifiers={(DOMAIN, entry_id)},
        name=name,
        manufacturer="Meals & Groceries",
        model="Einkaufsliste",
    )


def refresh_list_sensors(hass: HomeAssistant, entry_id: str) -> None:
    for sensor in hass.data[DOMAIN][entry_id].get("list_sensors", []):
        sensor.async_write_ha_state()
