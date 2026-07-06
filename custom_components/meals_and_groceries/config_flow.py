from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.config_entries import ConfigEntry, ConfigSubentryFlow, SubentryFlowResult
from homeassistant.core import callback
from homeassistant.data_entry_flow import FlowResult

from .const import DOMAIN, SUBENTRY_TYPE_SHOPPING_LIST

STEP_SHOPPING_LIST_DATA_SCHEMA = vol.Schema({vol.Required("name"): str})


class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Single main entry (the management hub); shopping lists are subentries."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        if user_input is not None:
            return self.async_create_entry(title="Meals & Groceries", data={})

        return self.async_show_form(step_id="user", data_schema=vol.Schema({}))

    @classmethod
    @callback
    def async_get_supported_subentry_types(
        cls, config_entry: ConfigEntry
    ) -> dict[str, type[ConfigSubentryFlow]]:
        return {SUBENTRY_TYPE_SHOPPING_LIST: ShoppingListSubentryFlow}


class ShoppingListSubentryFlow(ConfigSubentryFlow):
    """Each subentry of this type represents one shopping list (one store)."""

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        if user_input is not None:
            return self.async_create_entry(title=user_input["name"], data={})

        return self.async_show_form(
            step_id="user", data_schema=STEP_SHOPPING_LIST_DATA_SCHEMA
        )
