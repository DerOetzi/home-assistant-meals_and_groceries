from __future__ import annotations

from datetime import date, datetime

import voluptuous as vol
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv

from .const import DOMAIN, GLOBAL_DATA_KEY, WEEKDAY_IDS, WEEKDAY_LABELS
from .models import Dish, MealPlanDay

SET_DAY_MEAL_SCHEMA = vol.Schema(
    {
        vol.Required("weekday_index"): vol.All(int, vol.Range(min=0, max=6)),
        vol.Optional("dish_id"): vol.Any(cv.string, None),
        vol.Optional("free_text"): vol.Any(cv.string, None),
    }
)


async def async_get_weekday_labels(hass: HomeAssistant) -> dict[str, str]:
    """Return the localized weekday display labels."""
    labels = WEEKDAY_LABELS.get(hass.config.language, WEEKDAY_LABELS["en"])
    return {day_id: labels.get(day_id, day_id.capitalize()) for day_id in WEEKDAY_IDS}


def day_label(day: MealPlanDay, dish_store) -> str:
    """Resolve a meal plan day to its display text."""
    if day.dish_id:
        dish: Dish | None = dish_store.get(day.dish_id)
        if dish is not None:
            return dish.name
    if day.free_text:
        return day.free_text
    return "-"


def _notify_sensors(hass: HomeAssistant) -> None:
    for entity in hass.data[DOMAIN][GLOBAL_DATA_KEY].get("mealplan_sensors", []):
        entity.async_write_ha_state()


async def async_set_day_meal(
    hass: HomeAssistant,
    weekday_index: int,
    *,
    dish_id: str | None = None,
    free_text: str | None = None,
) -> None:
    """Set (or clear) the dish/free text for one weekday slot.

    Shared by the scan_barcode service handler and the panel's
    mealplan/set_day websocket command so both stay in sync with one
    implementation.
    """
    global_data = hass.data[DOMAIN][GLOBAL_DATA_KEY]
    mealplan_store = global_data["mealplan"]

    mealplan_store.set_day(weekday_index, dish_id=dish_id, free_text=free_text)
    await mealplan_store.async_save()
    _notify_sensors(hass)


async def async_handle_set_day_meal(hass: HomeAssistant, call: ServiceCall) -> None:
    """Service-call wrapper around async_set_day_meal."""
    await async_set_day_meal(
        hass,
        call.data["weekday_index"],
        dish_id=call.data.get("dish_id"),
        free_text=call.data.get("free_text"),
    )


async def async_handle_midnight_reset(hass: HomeAssistant, now: datetime) -> None:
    """Clear yesterday's meal plan slot, same as the old Node-RED cron job."""
    global_data = hass.data[DOMAIN][GLOBAL_DATA_KEY]
    mealplan_store = global_data["mealplan"]

    yesterday_index = (date.today().weekday() - 1) % 7
    mealplan_store.reset_day(yesterday_index)
    await mealplan_store.async_save()
    _notify_sensors(hass)


__all__ = [
    "SET_DAY_MEAL_SCHEMA",
    "async_get_weekday_labels",
    "day_label",
    "async_set_day_meal",
    "async_handle_set_day_meal",
    "async_handle_midnight_reset",
]
