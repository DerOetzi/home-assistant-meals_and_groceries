# Meals & Groceries

A Home Assistant custom integration for shopping-list and meal-planning management. Replaces a previous Node-RED-based setup with native `todo` entities, a proper data model (stores → categories → products, with barcodes), a custom sidebar panel for management, and a custom Lovelace card for quick shopping.

## Features

- **Shopping lists as native `todo` entities** — one per store (e.g. "Edeka", "dm"), added as sub-entries of a single integration entry via *Settings → Devices & Services → Meals & Groceries → Add sub-entry*. Each list is its own device, bundling the `todo` entity with two sensors: open item count and last-changed timestamp.
- **Product catalog** — products belong to a store and an optional category (categories are ordered per store to match the walking route through it), and can carry one or more barcodes.
- **Barcode scanning** — a plain service, `meals_and_groceries.scan_barcode`, matches a scanned barcode against the catalog and adds the right product to the right list. Wiring up actual scanner hardware is just a normal automation (trigger on the scanner entity's state, call the service) — see `blueprints/barcode_scan_dispatcher.yaml` in [home-assistant-helper-collection](https://github.com/DerOetzi/home-assistant-helper-collection) for a ready-made blueprint.
- **Weekly meal plan** — a 7-day plan (dish, restaurant, or free text per day), exposed as `sensor.meals_and_groceries_today`, `_tomorrow`, and `_week_plan`, reset automatically every night.
- **Custom sidebar panel** (`/meals-and-groceries`) — manage shopping lists' categories (drag & drop to reorder), products (with barcode entry), dishes/restaurants, and the weekly meal plan. Hand-written vanilla JS web components, no build tooling required.
- **Custom Lovelace card** (`custom:meals-and-groceries-favorite-card`) — a tappable tile bound to a single catalog product (picked via a built-in visual editor, not a raw ID) that toggles it on/off the right shopping list, with live state synced through Home Assistant's native `todo` item subscription.
- Fully bilingual UI (English/German), both backend (`strings.json`/`translations/`) and frontend (`translations.js`).

## Installation

### HACS (recommended)

1. HACS → Integrations → ⋮ → Custom repositories
2. Add `https://github.com/DerOetzi/home-assistant-meals_and_groceries`, category "Integration"
3. Install "Meals & Groceries" and restart Home Assistant

### Manual

1. Copy `custom_components/meals_and_groceries/` into your Home Assistant `custom_components/` folder
2. Restart Home Assistant

## Setup

1. **Settings → Devices & Services → Add Integration → Meals & Groceries.** This creates the single main entry (hub), which sets up the product/dish/meal-plan storage, the `scan_barcode`/`set_day_meal` services, and the meal-plan sensors.
2. Open the newly created entry and choose **Add sub-entry** to create a shopping list (e.g. "Edeka"). Repeat for each store. Each sub-entry becomes its own `todo.*` entity + device.
3. Open the **Meals & Groceries** panel in the sidebar to manage categories per store, products (with barcodes), dishes/restaurants, and the weekly meal plan.
4. Optionally add `custom:meals-and-groceries-favorite-card` cards to a dashboard for quick one-tap shopping — add the card via the dashboard editor's "+ Add card" picker and select a product from the dropdown.

Deleting the main entry removes everything (all shopping lists, products, dishes, meal plan) — this is intentional, so the integration can't be left in a half-orphaned state the way a separate hub entry could.

## Architecture notes

- Shopping lists are **Config Subentries** of a single main config entry (`single_config_entry: true`), not separate top-level entries — see the design notes in the repository history for why.
- All custom data (categories, products, dishes, meal plan, todo items) is stored via Home Assistant's `helpers.storage.Store`, one JSON file per store/list.
- The panel and card are hand-written ES modules (no Lit, no bundler) served as static files by the integration itself.

## Development

```bash
pip install homeassistant

python -m script.hassfest
```
