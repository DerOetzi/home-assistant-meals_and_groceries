from __future__ import annotations

from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceInfo

from .const import DOMAIN


def shopping_list_device_info(subentry_id: str, name: str) -> DeviceInfo:
    """Shared device each shopping list's todo entity and sensors belong to."""
    return DeviceInfo(
        identifiers={(DOMAIN, subentry_id)},
        name=name,
        manufacturer="Meals & Groceries",
        model="Shopping list",
    )


def refresh_list_sensors(hass: HomeAssistant, subentry_id: str) -> None:
    for sensor in hass.data[DOMAIN][subentry_id].get("list_sensors", []):
        sensor.async_write_ha_state()
