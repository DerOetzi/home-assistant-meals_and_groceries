from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.data_entry_flow import FlowResult

from .const import CONF_KIND, DOMAIN, ENTRY_KIND_HUB, ENTRY_KIND_SHOPPING_LIST, HUB_TITLE

STEP_USER_DATA_SCHEMA = vol.Schema({vol.Required("name"): str})


class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """User-facing entries are shopping lists; the management hub is created
    automatically (see async_step_import) the first time a shopping list is
    set up, and lives on independently afterwards."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        if user_input is not None:
            return self.async_create_entry(
                title=user_input["name"],
                data={CONF_KIND: ENTRY_KIND_SHOPPING_LIST},
            )

        return self.async_show_form(
            step_id="user",
            data_schema=STEP_USER_DATA_SCHEMA,
        )

    async def async_step_import(
        self, import_data: dict[str, Any] | None = None
    ) -> FlowResult:
        """Triggered programmatically from __init__.py, not by the user."""
        await self.async_set_unique_id(ENTRY_KIND_HUB)
        self._abort_if_unique_id_configured()
        return self.async_create_entry(
            title=HUB_TITLE, data={CONF_KIND: ENTRY_KIND_HUB}
        )
