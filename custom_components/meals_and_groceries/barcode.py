from __future__ import annotations

import voluptuous as vol
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv

from .const import DOMAIN, EVENT_BARCODE_ADDED, EVENT_BARCODE_UNKNOWN, GLOBAL_DATA_KEY

SCAN_BARCODE_SCHEMA = vol.Schema({vol.Required("barcode"): cv.string})


async def async_handle_scan_barcode(hass: HomeAssistant, call: ServiceCall) -> None:
    """Look up a scanned barcode and add the matching product to its shopping list."""
    barcode = call.data["barcode"].strip()
    if not barcode:
        return

    product_store = hass.data[DOMAIN][GLOBAL_DATA_KEY]["products"]
    product = product_store.find_by_barcode(barcode)

    if product is None:
        hass.bus.async_fire(EVENT_BARCODE_UNKNOWN, {"barcode": barcode})
        return

    entry_data = hass.data[DOMAIN].get(product.store_config_entry_id)
    if entry_data is None:
        # Product references a shopping list that no longer exists.
        hass.bus.async_fire(EVENT_BARCODE_UNKNOWN, {"barcode": barcode})
        return

    todo_store = entry_data["todo_items"]
    if todo_store.find_needs_action_by_summary(product.name) is None:
        todo_store.add(
            product.name, product_id=product.id, category_id=product.category_id
        )
        await todo_store.async_save()
        entry_data["entity"].async_write_ha_state()

    hass.bus.async_fire(
        EVENT_BARCODE_ADDED,
        {
            "barcode": barcode,
            "product_id": product.id,
            "store_config_entry_id": product.store_config_entry_id,
        },
    )
