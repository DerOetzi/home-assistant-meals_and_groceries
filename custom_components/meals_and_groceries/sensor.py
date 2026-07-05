from __future__ import annotations

from datetime import date, datetime

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import CONF_KIND, DOMAIN, ENTRY_KIND_HUB, GLOBAL_DATA_KEY, WEEKDAY_IDS
from .entities import shopping_list_device_info
from .mealplan import async_get_weekday_labels, day_label
from .store import DishStore, MealPlanStore, TodoItemStore


async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    if config_entry.data.get(CONF_KIND) == ENTRY_KIND_HUB:
        await _async_setup_hub_sensors(hass, async_add_entities)
    else:
        _async_setup_list_sensors(hass, config_entry, async_add_entities)


async def _async_setup_hub_sensors(
    hass: HomeAssistant, async_add_entities: AddEntitiesCallback
) -> None:
    global_data = hass.data[DOMAIN][GLOBAL_DATA_KEY]

    mealplan_store: MealPlanStore = global_data["mealplan"]
    dish_store: DishStore = global_data["dishes"]
    weekday_labels = await async_get_weekday_labels(hass)

    entities = [
        MealsAndGroceriesTodaySensor(mealplan_store, dish_store),
        MealsAndGroceriesTomorrowSensor(mealplan_store, dish_store),
        MealsAndGroceriesWeekSensor(mealplan_store, dish_store, weekday_labels),
    ]
    global_data["mealplan_sensors"] = entities
    async_add_entities(entities)


def _async_setup_list_sensors(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    data = hass.data[DOMAIN][config_entry.entry_id]
    todo_store: TodoItemStore = data["todo_items"]

    entities = [
        MealsAndGroceriesItemCountSensor(config_entry, todo_store),
        MealsAndGroceriesLastChangedSensor(config_entry, todo_store),
    ]
    data["list_sensors"] = entities
    async_add_entities(entities)


class MealsAndGroceriesItemCountSensor(SensorEntity):
    """Number of open (needs_action) items on one shopping list."""

    _attr_should_poll = False
    _attr_has_entity_name = True
    _attr_translation_key = "item_count"

    def __init__(self, config_entry: ConfigEntry, todo_store: TodoItemStore) -> None:
        self._todo_store = todo_store
        self._attr_unique_id = f"{config_entry.entry_id}_item_count"
        self._attr_device_info = shopping_list_device_info(
            config_entry.entry_id, config_entry.title
        )

    @property
    def native_value(self) -> int:
        return self._todo_store.open_item_count()


class MealsAndGroceriesLastChangedSensor(SensorEntity):
    """Timestamp of the last mutation (add/update/delete) on one shopping list."""

    _attr_should_poll = False
    _attr_has_entity_name = True
    _attr_translation_key = "last_changed"
    _attr_device_class = SensorDeviceClass.TIMESTAMP

    def __init__(self, config_entry: ConfigEntry, todo_store: TodoItemStore) -> None:
        self._todo_store = todo_store
        self._attr_unique_id = f"{config_entry.entry_id}_last_changed"
        self._attr_device_info = shopping_list_device_info(
            config_entry.entry_id, config_entry.title
        )

    @property
    def native_value(self) -> datetime | None:
        return self._todo_store.last_changed


class _MealPlanSensor(SensorEntity):
    _attr_should_poll = False
    _attr_has_entity_name = True

    def __init__(
        self,
        mealplan_store: MealPlanStore,
        dish_store: DishStore,
        *,
        translation_key: str,
        unique_id: str,
        entity_id: str,
    ) -> None:
        self._mealplan_store = mealplan_store
        self._dish_store = dish_store
        self._attr_translation_key = translation_key
        self._attr_unique_id = unique_id
        self.entity_id = entity_id


class MealsAndGroceriesTodaySensor(_MealPlanSensor):
    def __init__(self, mealplan_store: MealPlanStore, dish_store: DishStore) -> None:
        super().__init__(
            mealplan_store,
            dish_store,
            translation_key="today",
            unique_id=f"{DOMAIN}_today",
            entity_id="sensor.meals_and_groceries_today",
        )

    @property
    def native_value(self) -> str:
        day = self._mealplan_store.get_day(date.today().weekday())
        return day_label(day, self._dish_store)


class MealsAndGroceriesTomorrowSensor(_MealPlanSensor):
    def __init__(self, mealplan_store: MealPlanStore, dish_store: DishStore) -> None:
        super().__init__(
            mealplan_store,
            dish_store,
            translation_key="tomorrow",
            unique_id=f"{DOMAIN}_tomorrow",
            entity_id="sensor.meals_and_groceries_tomorrow",
        )

    @property
    def native_value(self) -> str:
        day = self._mealplan_store.get_day((date.today().weekday() + 1) % 7)
        return day_label(day, self._dish_store)


class MealsAndGroceriesWeekSensor(_MealPlanSensor):
    def __init__(
        self,
        mealplan_store: MealPlanStore,
        dish_store: DishStore,
        weekday_labels: dict[str, str],
    ) -> None:
        super().__init__(
            mealplan_store,
            dish_store,
            translation_key="week_plan",
            unique_id=f"{DOMAIN}_week_plan",
            entity_id="sensor.meals_and_groceries_week_plan",
        )
        self._weekday_labels = weekday_labels

    @property
    def native_value(self) -> str:
        today_index = date.today().weekday()
        order = [(today_index + offset) % 7 for offset in range(7)]
        lines = [
            f"**{self._weekday_labels[WEEKDAY_IDS[index]]}:** "
            f"{day_label(self._mealplan_store.get_day(index), self._dish_store)}"
            for index in order
        ]
        return "\n".join(lines)
