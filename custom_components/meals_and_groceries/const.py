from __future__ import annotations

DOMAIN = "meals_and_groceries"

STORAGE_VERSION = 1

GLOBAL_DATA_KEY = "_global"

CONF_KIND = "kind"
ENTRY_KIND_SHOPPING_LIST = "shopping_list"
ENTRY_KIND_HUB = "hub"

HUB_TITLE = "Meals & Groceries Verwaltung"

PLATFORMS_BY_KIND = {
    ENTRY_KIND_SHOPPING_LIST: ["todo", "sensor"],
    ENTRY_KIND_HUB: ["sensor"],
}

SERVICE_SCAN_BARCODE = "scan_barcode"
SERVICE_SET_DAY_MEAL = "set_day_meal"

EVENT_BARCODE_ADDED = f"{DOMAIN}_barcode_added"
EVENT_BARCODE_UNKNOWN = f"{DOMAIN}_barcode_unknown"

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
