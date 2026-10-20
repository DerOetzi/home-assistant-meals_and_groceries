from __future__ import annotations

import os
from pathlib import Path

from aiohttp import web

from homeassistant.components.frontend import async_remove_panel
from homeassistant.components.http import HomeAssistantView
from homeassistant.components.panel_custom import async_register_panel
from homeassistant.core import HomeAssistant
from homeassistant.helpers.http import KEY_HASS

PANEL_URL_PATH = "meals-and-groceries"
STATIC_URL_PATH = "/meals_and_groceries_panel"

_PANEL_DIR = Path(os.path.dirname(__file__), "panel_frontend").resolve()

_SIDEBAR_TITLES = {
    "de": "Essen & Einkauf",
}
_DEFAULT_SIDEBAR_TITLE = "Meals & Groceries"


class PanelFrontendView(HomeAssistantView):
    """Serves the panel's frontend files with `Cache-Control: no-cache`.

    HA's static paths with cache_headers=False send no Cache-Control at all,
    so browsers cache the ES modules heuristically (from Last-Modified) —
    and the panel module is loaded via a late import(), which even a hard
    reload does not bypass. no-cache makes the browser revalidate every load
    (cheap 304 via ETag) so JS changes show up after a normal reload.
    """

    url = STATIC_URL_PATH + "/{filename:.+}"
    name = "meals_and_groceries:panel_frontend"
    requires_auth = False

    async def get(self, request: web.Request, filename: str) -> web.StreamResponse:
        hass = request.app[KEY_HASS]
        path = await hass.async_add_executor_job(_resolve_frontend_file, filename)
        if path is None:
            raise web.HTTPNotFound
        return web.FileResponse(path, headers={"Cache-Control": "no-cache"})


def _resolve_frontend_file(filename: str) -> Path | None:
    path = (_PANEL_DIR / filename).resolve()
    if not path.is_relative_to(_PANEL_DIR) or not path.is_file():
        return None
    return path


async def async_setup(hass: HomeAssistant) -> None:
    """Register the sidebar panel and serve its frontend assets."""
    hass.http.register_view(PanelFrontendView())

    # sidebar_title is set once at registration (not per connected user), so
    # it follows the instance-wide language rather than each user's locale.
    sidebar_title = _SIDEBAR_TITLES.get(
        hass.config.language, _DEFAULT_SIDEBAR_TITLE
    )

    await async_register_panel(
        hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name="meals-and-groceries-panel",
        sidebar_title=sidebar_title,
        sidebar_icon="mdi:cart",
        module_url=f"{STATIC_URL_PATH}/meals-and-groceries-panel.js",
        require_admin=False,
    )


def async_remove(hass: HomeAssistant) -> None:
    """Unregister the sidebar panel (called when the integration is removed)."""
    async_remove_panel(hass, PANEL_URL_PATH)
