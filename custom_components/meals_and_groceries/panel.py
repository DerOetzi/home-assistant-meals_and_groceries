from __future__ import annotations

import os

from homeassistant.components.frontend import async_remove_panel
from homeassistant.components.http import StaticPathConfig
from homeassistant.components.panel_custom import async_register_panel
from homeassistant.core import HomeAssistant

PANEL_URL_PATH = "meals-and-groceries"
STATIC_URL_PATH = "/meals_and_groceries_panel"

_PANEL_DIR = os.path.join(os.path.dirname(__file__), "panel_frontend")


async def async_setup(hass: HomeAssistant) -> None:
    """Register the sidebar panel and serve its frontend assets."""
    await hass.http.async_register_static_paths(
        [StaticPathConfig(STATIC_URL_PATH, _PANEL_DIR, cache_headers=False)]
    )

    await async_register_panel(
        hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name="meals-and-groceries-panel",
        sidebar_title="Meals & Groceries",
        sidebar_icon="mdi:cart",
        js_url=f"{STATIC_URL_PATH}/meals-and-groceries-panel.js",
        require_admin=True,
    )


def async_remove(hass: HomeAssistant) -> None:
    """Unregister the sidebar panel (called when the integration is removed)."""
    async_remove_panel(hass, PANEL_URL_PATH)
