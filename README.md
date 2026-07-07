# Meals & Groceries

A Home Assistant custom integration for shopping-list and meal-planning management. Replaces a previous Node-RED- and Lovelace-dashboard-based setup with native `todo` entities, a proper data model (stores → categories/groups → products, dishes with ingredients), and a custom sidebar panel that serves as the sole daily shopping/planning interface — while still exposing plain entities for anyone who wants to build their own dashboard.

## Features

- **Shopping lists as native `todo` entities** — one per store (e.g. "Edeka", "dm"), added as sub-entries of a single integration entry via *Settings → Devices & Services → Meals & Groceries → Add sub-entry*. Each list is its own device, bundling the `todo` entity with two sensors: open item count and last-changed timestamp.
- **Product catalog** — products belong to a store and an optional category (categories are ordered per store to match the walking route through it), can carry one or more barcodes, and can additionally belong to one or more global, cross-store **groups** (e.g. "Grundnahrungsmittel", "Gewürze") independent of which store they're sold at.
- **Dishes with ingredients** — dishes/restaurants can reference a set of catalog products as ingredients (no quantities). The weekly meal plan surfaces a shopping-cart button next to any day whose dish has ingredients, opening an overlay to put individual ingredients on the right list; a separate lookup row lets you browse any dish's ingredients without touching the plan.
- **Barcode scanning** — a plain service, `meals_and_groceries.scan_barcode`, matches a scanned barcode against the catalog and adds the right product to the right list. Wiring up actual scanner hardware is just a normal automation (trigger on the scanner entity's state, call the service) — see `blueprints/barcode_scan_dispatcher.yaml` in [home-assistant-helper-collection](https://github.com/DerOetzi/home-assistant-helper-collection) for a ready-made blueprint.
- **Shopping-list selection service** — `meals_and_groceries.select_shopping_list` switches the store shown on the panel's shopping-list tab, so a zone-based automation can flip to the right list the moment someone arrives at a store; see `blueprints/shopping_list_zone_selector.yaml` in the same repo.
- **Weekly meal plan** — a 7-day plan (dish, restaurant, "eating out", or free text per day), exposed as `sensor.meals_and_groceries_today`, `_tomorrow`, and `_week_plan`, reset automatically every night.
- **Custom sidebar panel** (`/meals-and-groceries`) — a two-tier UI:
  - **Alltag (daily)**: weekly meal plan, a shopping-list tab (only items currently on the list, tap to remove, store picker as tappable chips with live open-item badges), and any configured **extra tabs** — named views that bundle an ordered set of groups (e.g. "Lebensmittel" combining several stores, "Drogerie" grouped however you like) and render as cross-store tappable tiles.
  - **Konfiguration** (behind the gear icon): products, categories, dishes, and extra tabs (which also manage groups — a tab owns an ordered list of groups, created/renamed/reordered right in the tab's form).
  - Hand-written vanilla JS web components, no build tooling required. Fully usable by non-admin users (only creating a new shopping list via *Add sub-entry* requires admin).
- **Custom Lovelace card** (`custom:meals-and-groceries-favorite-card`) — a tappable tile bound to a single catalog product (picked via a built-in visual editor, not a raw ID) that toggles it on/off the right shopping list, with live state synced through Home Assistant's native `todo` item subscription. Building your own dashboards from the plain `todo.*` entities, meal-plan sensors, and this card remains fully supported alongside the panel.
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

1. **Settings → Devices & Services → Add Integration → Meals & Groceries.** This creates the single main entry (hub), which sets up the product/dish/group/tab/meal-plan storage, the `scan_barcode`/`set_day_meal`/`select_shopping_list` services, and the meal-plan sensors.
2. Open the newly created entry and choose **Add sub-entry** to create a shopping list (e.g. "Edeka"). Repeat for each store. Each sub-entry becomes its own `todo.*` entity + device.
3. Open the **Meals & Groceries** panel in the sidebar. Use the gear icon to switch to Konfiguration and set up categories per store, products (barcodes, groups), dishes (with ingredients), and any extra tabs; switch back to Alltag for the weekly meal plan and shopping lists.
4. Optionally add `custom:meals-and-groceries-favorite-card` cards to a dashboard for quick one-tap shopping — add the card via the dashboard editor's "+ Add card" picker and select a product from the dropdown.

Deleting the main entry removes everything (all shopping lists, products, dishes, groups, tabs, meal plan) — this is intentional, so the integration can't be left in a half-orphaned state the way a separate hub entry could.

## Architecture notes

- Shopping lists are **Config Subentries** of a single main config entry (`single_config_entry: true`), not separate top-level entries — see the design notes in the repository history for why.
- All custom data (categories, products, dishes, groups, tabs, meal plan, todo items) is stored via Home Assistant's `helpers.storage.Store`, one JSON file per store/list plus one global file each for products, dishes, groups, and tabs.
- Groups are a global, store-independent classification of products (separate from the store-bound categories); an extra tab owns an ordered list of groups and is the unit of cross-store daily-use views.
- Referential integrity on delete is handled server-side: removing a category, product, dish, group, or tab cleans up dangling references in whatever referenced it (plus a startup sweep for anything edited outside the normal flow).
- All websocket commands and the panel itself are open to non-admin users; only adding/removing shopping-list sub-entries goes through the standard config-entry admin gate.
- The panel and card are hand-written ES modules (no Lit, no bundler) served as static files by the integration itself. Browsers cache these modules aggressively — after editing panel/card JS during development, a hard reload (not just a refresh) is needed to pick up changes.

## Development

```bash
pip install homeassistant

python -m script.hassfest
```
