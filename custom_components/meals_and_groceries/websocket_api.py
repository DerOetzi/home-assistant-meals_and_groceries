from __future__ import annotations

import dataclasses

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er

from .const import (
    DISH_KINDS,
    DOMAIN,
    EVENT_BARCODE_UNKNOWN,
    GLOBAL_DATA_KEY,
    SUBENTRY_TYPE_SHOPPING_LIST,
)
from .mealplan import async_set_day_meal

ERR_NOT_FOUND = "not_found"


@callback
def async_setup(hass: HomeAssistant) -> None:
    """Register all meals_and_groceries websocket commands."""
    websocket_api.async_register_command(hass, ws_stores_list)
    websocket_api.async_register_command(hass, ws_categories_list)
    websocket_api.async_register_command(hass, ws_categories_add)
    websocket_api.async_register_command(hass, ws_categories_update)
    websocket_api.async_register_command(hass, ws_categories_delete)
    websocket_api.async_register_command(hass, ws_categories_reorder)
    websocket_api.async_register_command(hass, ws_products_list)
    websocket_api.async_register_command(hass, ws_products_add)
    websocket_api.async_register_command(hass, ws_products_update)
    websocket_api.async_register_command(hass, ws_products_delete)
    websocket_api.async_register_command(hass, ws_products_resolve_barcode)
    websocket_api.async_register_command(hass, ws_dishes_list)
    websocket_api.async_register_command(hass, ws_dishes_add)
    websocket_api.async_register_command(hass, ws_dishes_update)
    websocket_api.async_register_command(hass, ws_dishes_delete)
    websocket_api.async_register_command(hass, ws_mealplan_get)
    websocket_api.async_register_command(hass, ws_mealplan_set_day)
    websocket_api.async_register_command(hass, ws_barcode_unknown_subscribe)


def _global_data(hass: HomeAssistant) -> dict:
    return hass.data[DOMAIN][GLOBAL_DATA_KEY]


def _refresh_list_entity(hass: HomeAssistant, subentry_id: str) -> None:
    list_data = hass.data[DOMAIN].get(subentry_id)
    if list_data and "entity" in list_data:
        list_data["entity"].async_write_ha_state()


# --- stores -----------------------------------------------------------------


@websocket_api.websocket_command({vol.Required("type"): "meals_and_groceries/stores/list"})
@websocket_api.require_admin
@callback
def ws_stores_list(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry = _global_data(hass)["entry"]
    registry = er.async_get(hass)
    stores = [
        {
            "subentry_id": subentry_id,
            "title": subentry.title,
            "todo_entity_id": registry.async_get_entity_id(
                "todo", DOMAIN, subentry_id
            ),
        }
        for subentry_id, subentry in entry.subentries.items()
        if subentry.subentry_type == SUBENTRY_TYPE_SHOPPING_LIST
    ]
    connection.send_result(msg["id"], {"stores": stores})


# --- categories ---------------------------------------------------------------


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meals_and_groceries/categories/list",
        vol.Required("subentry_id"): str,
    }
)
@websocket_api.require_admin
@callback
def ws_categories_list(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    list_data = hass.data[DOMAIN].get(msg["subentry_id"])
    if list_data is None:
        connection.send_error(msg["id"], ERR_NOT_FOUND, "Unknown shopping list")
        return
    categories = [dataclasses.asdict(c) for c in list_data["categories"].categories]
    connection.send_result(msg["id"], {"categories": categories})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meals_and_groceries/categories/add",
        vol.Required("subentry_id"): str,
        vol.Required("name"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_categories_add(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    list_data = hass.data[DOMAIN].get(msg["subentry_id"])
    if list_data is None:
        connection.send_error(msg["id"], ERR_NOT_FOUND, "Unknown shopping list")
        return
    category_store = list_data["categories"]
    category = category_store.add(msg["name"])
    await category_store.async_save()
    _refresh_list_entity(hass, msg["subentry_id"])
    connection.send_result(msg["id"], {"category": dataclasses.asdict(category)})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meals_and_groceries/categories/update",
        vol.Required("subentry_id"): str,
        vol.Required("category_id"): str,
        vol.Required("name"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_categories_update(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    list_data = hass.data[DOMAIN].get(msg["subentry_id"])
    if list_data is None:
        connection.send_error(msg["id"], ERR_NOT_FOUND, "Unknown shopping list")
        return
    category_store = list_data["categories"]
    try:
        category_store.update(msg["category_id"], name=msg["name"])
    except KeyError:
        connection.send_error(msg["id"], ERR_NOT_FOUND, "Unknown category")
        return
    await category_store.async_save()
    _refresh_list_entity(hass, msg["subentry_id"])
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meals_and_groceries/categories/delete",
        vol.Required("subentry_id"): str,
        vol.Required("category_id"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_categories_delete(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    list_data = hass.data[DOMAIN].get(msg["subentry_id"])
    if list_data is None:
        connection.send_error(msg["id"], ERR_NOT_FOUND, "Unknown shopping list")
        return
    category_store = list_data["categories"]
    category_store.delete(msg["category_id"])
    await category_store.async_save()
    _refresh_list_entity(hass, msg["subentry_id"])
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meals_and_groceries/categories/reorder",
        vol.Required("subentry_id"): str,
        vol.Required("category_ids"): [str],
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_categories_reorder(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    list_data = hass.data[DOMAIN].get(msg["subentry_id"])
    if list_data is None:
        connection.send_error(msg["id"], ERR_NOT_FOUND, "Unknown shopping list")
        return
    category_store = list_data["categories"]
    category_store.reorder(msg["category_ids"])
    await category_store.async_save()
    _refresh_list_entity(hass, msg["subentry_id"])
    connection.send_result(msg["id"])


# --- products -----------------------------------------------------------------


@websocket_api.websocket_command({vol.Required("type"): "meals_and_groceries/products/list"})
@websocket_api.require_admin
@callback
def ws_products_list(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    products = [dataclasses.asdict(p) for p in _global_data(hass)["products"].products]
    connection.send_result(msg["id"], {"products": products})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meals_and_groceries/products/add",
        vol.Required("name"): str,
        vol.Required("store_subentry_id"): str,
        vol.Optional("category_id"): vol.Any(str, None),
        vol.Optional("barcodes", default=list): [str],
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_products_add(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    product_store = _global_data(hass)["products"]
    product = product_store.add(
        msg["name"],
        store_subentry_id=msg["store_subentry_id"],
        category_id=msg.get("category_id"),
        barcodes=msg["barcodes"],
    )
    await product_store.async_save()
    connection.send_result(msg["id"], {"product": dataclasses.asdict(product)})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meals_and_groceries/products/update",
        vol.Required("product_id"): str,
        vol.Required("name"): str,
        vol.Optional("category_id"): vol.Any(str, None),
        vol.Optional("barcodes", default=list): [str],
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_products_update(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    product_store = _global_data(hass)["products"]
    try:
        product_store.update(
            msg["product_id"],
            name=msg["name"],
            category_id=msg.get("category_id"),
            barcodes=msg["barcodes"],
        )
    except KeyError:
        connection.send_error(msg["id"], ERR_NOT_FOUND, "Unknown product")
        return
    await product_store.async_save()
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meals_and_groceries/products/delete",
        vol.Required("product_id"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_products_delete(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    product_store = _global_data(hass)["products"]
    product_store.delete(msg["product_id"])
    await product_store.async_save()
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meals_and_groceries/products/resolve_barcode",
        vol.Required("barcode"): str,
    }
)
@websocket_api.require_admin
@callback
def ws_products_resolve_barcode(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    product = _global_data(hass)["products"].find_by_barcode(msg["barcode"])
    connection.send_result(
        msg["id"], {"product": dataclasses.asdict(product) if product else None}
    )


# --- dishes -------------------------------------------------------------------


@websocket_api.websocket_command({vol.Required("type"): "meals_and_groceries/dishes/list"})
@websocket_api.require_admin
@callback
def ws_dishes_list(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    dishes = [dataclasses.asdict(d) for d in _global_data(hass)["dishes"].dishes]
    connection.send_result(msg["id"], {"dishes": dishes})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meals_and_groceries/dishes/add",
        vol.Required("name"): str,
        vol.Required("kind"): vol.In(DISH_KINDS),
        vol.Optional("notes"): vol.Any(str, None),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_dishes_add(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    dish_store = _global_data(hass)["dishes"]
    dish = dish_store.add(msg["name"], kind=msg["kind"], notes=msg.get("notes"))
    await dish_store.async_save()
    connection.send_result(msg["id"], {"dish": dataclasses.asdict(dish)})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meals_and_groceries/dishes/update",
        vol.Required("dish_id"): str,
        vol.Required("name"): str,
        vol.Required("kind"): vol.In(DISH_KINDS),
        vol.Optional("notes"): vol.Any(str, None),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_dishes_update(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    dish_store = _global_data(hass)["dishes"]
    try:
        dish_store.update(
            msg["dish_id"], name=msg["name"], kind=msg["kind"], notes=msg.get("notes")
        )
    except KeyError:
        connection.send_error(msg["id"], ERR_NOT_FOUND, "Unknown dish")
        return
    await dish_store.async_save()
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meals_and_groceries/dishes/delete",
        vol.Required("dish_id"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_dishes_delete(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    dish_store = _global_data(hass)["dishes"]
    dish_store.delete(msg["dish_id"])
    await dish_store.async_save()
    connection.send_result(msg["id"])


# --- meal plan ------------------------------------------------------------


@websocket_api.websocket_command({vol.Required("type"): "meals_and_groceries/mealplan/get"})
@websocket_api.require_admin
@callback
def ws_mealplan_get(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    days = [dataclasses.asdict(d) for d in _global_data(hass)["mealplan"].days]
    connection.send_result(msg["id"], {"days": days})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meals_and_groceries/mealplan/set_day",
        vol.Required("weekday_index"): vol.All(int, vol.Range(min=0, max=6)),
        vol.Optional("dish_id"): vol.Any(str, None),
        vol.Optional("free_text"): vol.Any(str, None),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_mealplan_set_day(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    await async_set_day_meal(
        hass,
        msg["weekday_index"],
        dish_id=msg.get("dish_id"),
        free_text=msg.get("free_text"),
    )
    connection.send_result(msg["id"])


# --- unknown-barcode subscription ----------------------------------------


@websocket_api.websocket_command(
    {vol.Required("type"): "meals_and_groceries/barcode_unknown/subscribe"}
)
@websocket_api.require_admin
@callback
def ws_barcode_unknown_subscribe(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    @callback
    def _forward(event) -> None:
        connection.send_message(
            websocket_api.event_message(msg["id"], {"barcode": event.data["barcode"]})
        )

    connection.subscriptions[msg["id"]] = hass.bus.async_listen(
        EVENT_BARCODE_UNKNOWN, _forward
    )
    connection.send_result(msg["id"])
