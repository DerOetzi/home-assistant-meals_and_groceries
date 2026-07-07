from __future__ import annotations

DOMAIN = "meals_and_groceries"

STORAGE_VERSION = 1

GLOBAL_DATA_KEY = "_global"

SUBENTRY_TYPE_SHOPPING_LIST = "shopping_list"

PLATFORMS = ["todo", "sensor"]

SERVICE_SCAN_BARCODE = "scan_barcode"
SERVICE_SET_DAY_MEAL = "set_day_meal"
SERVICE_SELECT_SHOPPING_LIST = "select_shopping_list"

EVENT_BARCODE_ADDED = f"{DOMAIN}_barcode_added"
EVENT_BARCODE_UNKNOWN = f"{DOMAIN}_barcode_unknown"
EVENT_SHOPPING_LIST_SELECTED = f"{DOMAIN}_shopping_list_selected"

WEEKDAY_TRANSLATION_CATEGORY = "weekdays"

WEEKDAY_IDS = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]

DISH_KINDS = ["dish", "restaurant", "away", "other"]
