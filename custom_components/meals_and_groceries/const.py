from __future__ import annotations

DOMAIN = "meals_and_groceries"

PLATFORMS = ["todo"]

STORAGE_VERSION = 1

GLOBAL_DATA_KEY = "_global"

SERVICE_SCAN_BARCODE = "scan_barcode"

EVENT_BARCODE_ADDED = f"{DOMAIN}_barcode_added"
EVENT_BARCODE_UNKNOWN = f"{DOMAIN}_barcode_unknown"
