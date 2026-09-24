import { t } from "./translations.js";
import { callWS } from "./ha-ws.js";
import "./views/products-view.js";
import "./views/categories-view.js";
import "./views/dishes-view.js";
import "./views/mealplan-view.js";
import "./views/shopping-list-view.js";
import "./views/tabs-view.js";
import "./views/group-tab-view.js";

// Two-tier navigation: the daily view holds the meal plan, the shopping list
// and one dynamically created tab per configured Tab entity; the gear icon
// switches to the configuration pages.
const DAILY_TABS = ["mealplan", "shoppinglist"];
const CONFIG_TABS = ["products", "categories", "dishes", "tabs"];

class MealsAndGroceriesPanel extends HTMLElement {
  constructor() {
    super();
    this._activeTab = DAILY_TABS[0];
    this._configMode = false;
    this._dynamicTabs = []; // Tab objects from tabs/list, sorted
    this._storeTodoEntityIds = [];
    this._hass = null;
    this._narrow = false;
    this._built = false;
    this._barcodeSubscribed = false;
    this._panelTabSubscribed = false;
    this._toastTimeout = null;
    // Deep link parsed from the panel route, applied once the shell is built.
    this._routePrefix = "/meals-and-groceries";
    this._routeTab = "";
    this._routeListEntityId = "";
    // Whether the panel was opened with an explicit tab in the URL (e.g. a
    // dashboard link to /shoppinglist/todo.edeka). Decided by the first route
    // HA hands us; later in-panel navigation does not change it.
    this._openedViaDeepLink = undefined;
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
    }
    if (!this._built) {
      this._build();
      this._built = true;
      // A route set before the shell existed is applied now.
      this._applyRoute();
    }
    this._updateHass();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    this._updateHass();
    this._subscribeBarcodeUnknown();
    this._subscribePanelTab();
    if (first) {
      this._reloadDynamicTabs();
      this._loadStores();
    }
  }

  async _loadStores() {
    try {
      const { stores } = await callWS(this._hass, "meals_and_groceries/stores/list");
      this._storeTodoEntityIds = stores
        .map((store) => store.todo_entity_id)
        .filter(Boolean);
    } catch (err) {
      console.error("Meals & Groceries: failed to load stores", err);
      return;
    }
    this._updateShoppingBadge();
  }

  get hass() {
    return this._hass;
  }

  set narrow(narrow) {
    this._narrow = narrow;
    this._updateMenuButton();
  }

  get narrow() {
    return this._narrow;
  }

  // Home Assistant sets `route` for panel_custom panels and updates it on
  // every in-app navigation. Supported deep links:
  //   /meals-and-groceries/mealplan
  //   /meals-and-groceries/shoppinglist
  //   /meals-and-groceries/shoppinglist/todo.edeka   (preselects that list)
  //   /meals-and-groceries/tab:<tab_id>
  set route(route) {
    if (route?.prefix) {
      this._routePrefix = route.prefix;
    }
    const segments = String(route?.path || "")
      .split("/")
      .filter(Boolean);
    if (this._openedViaDeepLink === undefined) {
      this._openedViaDeepLink = segments.length > 0;
    }
    if (!segments.length) {
      // Bare panel path: canonicalize to the tab that is actually shown.
      this._routeTab = "";
      this._routeListEntityId = "";
      this._applyRoute();
      return;
    }
    const [tab, listEntityId = ""] = segments;
    if (tab === this._routeTab && listEntityId === this._routeListEntityId) {
      return;
    }
    this._routeTab = tab;
    this._routeListEntityId = listEntityId;
    this._applyRoute();
  }

  get route() {
    return { path: `/${this._routeTab}` };
  }

  // Push the current tab into the address bar so in-panel navigation is
  // linkable, bookmarkable and survives a reload. `location-changed` is the
  // frontend's own convention for telling it the URL moved.
  // `replace` rewrites the current entry instead of adding one — used when
  // the URL is only being made canonical (bare panel path -> default tab,
  // /shoppinglist -> /shoppinglist/<list>), not when the user navigated.
  _pushRoute(tab, listEntityId = "", replace = false) {
    if (tab === this._routeTab && listEntityId === this._routeListEntityId) {
      return;
    }
    this._routeTab = tab;
    this._routeListEntityId = listEntityId;
    const path = [this._routePrefix, tab, listEntityId]
      .filter(Boolean)
      .join("/");
    if (replace) {
      history.replaceState(null, "", path);
    } else {
      history.pushState(null, "", path);
    }
    this.dispatchEvent(
      new CustomEvent("location-changed", {
        bubbles: true,
        composed: true,
        detail: { replace },
      })
    );
  }

  // The shopping list always carries its list in the URL, so /shoppinglist
  // and /shoppinglist/todo.edeka never denote the same page.
  _currentListSegment() {
    if (this._activeTab !== "shoppinglist") {
      return "";
    }
    return (
      this.shadowRoot.querySelector('main > [data-view="shoppinglist"]')
        ?.selectedTodoEntityId || ""
    );
  }

  _applyRoute() {
    const tab = this._routeTab;
    if (!this._built) {
      return;
    }
    if (!tab) {
      // Bare panel path — make the default tab explicit in the address bar.
      this._pushRoute(this._activeTab, this._currentListSegment(), true);
      return;
    }
    const known =
      DAILY_TABS.includes(tab) ||
      CONFIG_TABS.includes(tab) ||
      tab.startsWith("tab:");
    if (!known) {
      return;
    }
    this._configMode = CONFIG_TABS.includes(tab);
    this._activeTab = tab;
    this._renderNav();
    this._updateActiveTab();
    const view = this._activeView();
    view?.refresh?.();
    if (tab === "shoppinglist" && this._routeListEntityId) {
      view?.selectList?.(this._routeListEntityId);
    }
  }

  _build() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif);
          color: var(--primary-text-color, inherit);
          background: var(--primary-background-color, transparent);
          min-height: 100%;
        }
        .toolbar {
          display: flex;
          align-items: center;
          gap: 8px;
          height: 56px;
          padding: 0 16px;
          background: var(--app-header-background-color, var(--primary-color, #03a9f4));
          color: var(--app-header-text-color, var(--text-primary-color, #fff));
        }
        .toolbar .title {
          font-size: 20px;
          font-weight: 400;
          flex: 1;
        }
        .toolbar #config-toggle {
          border: none;
          background: none;
          color: inherit;
          cursor: pointer;
          padding: 8px;
          border-radius: 50%;
          display: inline-flex;
        }
        .toolbar #config-toggle.active {
          background: rgba(255, 255, 255, 0.2);
        }
        nav {
          display: flex;
          border-bottom: 1px solid var(--divider-color, #ccc);
          background: var(--card-background-color, transparent);
          overflow-x: auto;
        }
        button.tab {
          flex: 1;
          padding: 16px;
          border: none;
          background: none;
          cursor: pointer;
          font-size: 14px;
          white-space: nowrap;
          color: var(--secondary-text-color, inherit);
          border-bottom: 2px solid transparent;
        }
        button.tab.active {
          color: var(--primary-color, #03a9f4);
          border-bottom-color: var(--primary-color, #03a9f4);
        }
        button.tab .badge {
          display: inline-block;
          margin-left: 6px;
          min-width: 18px;
          padding: 0 5px;
          border-radius: 9px;
          background: var(--primary-color, #03a9f4);
          color: var(--text-primary-color, #fff);
          font-size: 11px;
          line-height: 18px;
          text-align: center;
        }
        main {
          padding: 16px;
        }
        main > [data-view] {
          display: none;
        }
        #toast {
          position: fixed;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--primary-color, #03a9f4);
          color: var(--text-primary-color, #fff);
          padding: 12px 20px;
          border-radius: 8px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
          z-index: 20;
          display: none;
        }
      </style>
      <div class="toolbar">
        <ha-menu-button></ha-menu-button>
        <div class="title" id="panel-title"></div>
        <button id="config-toggle">
          <ha-icon icon="mdi:cog"></ha-icon>
        </button>
      </div>
      <nav id="nav"></nav>
      <main>
        <mag-mealplan-view data-view="mealplan"></mag-mealplan-view>
        <mag-shopping-list-view data-view="shoppinglist"></mag-shopping-list-view>
        <mag-products-view data-view="products"></mag-products-view>
        <mag-dishes-view data-view="dishes"></mag-dishes-view>
        <mag-categories-view data-view="categories"></mag-categories-view>
        <mag-tabs-view data-view="tabs"></mag-tabs-view>
      </main>
      <div id="toast"></div>
    `;

    this.shadowRoot
      .getElementById("config-toggle")
      .addEventListener("click", () => this._toggleConfigMode());
    this.shadowRoot.getElementById("nav").addEventListener("click", (event) => {
      const button = event.target.closest("button.tab");
      if (!button) {
        return;
      }
      this._activeTab = button.dataset.tab;
      this._updateActiveTab();
      this._pushRoute(this._activeTab, this._currentListSegment());
      // Daily views depend on data edited on the config pages (ingredients,
      // groups, categories) — refresh on activation to pick up changes.
      this._activeView()?.refresh?.();
    });
    this.shadowRoot.addEventListener("mag-list-selected", (event) => {
      if (this._activeTab !== "shoppinglist") {
        return;
      }
      this._pushRoute(
        "shoppinglist",
        event.detail?.todoEntityId || "",
        event.detail?.replace !== false
      );
    });
    this._renderNav();
  }

  _toggleConfigMode() {
    this._configMode = !this._configMode;
    this._activeTab = this._configMode ? CONFIG_TABS[0] : DAILY_TABS[0];
    if (!this._configMode) {
      // Tab config may have changed while in config mode.
      this._reloadDynamicTabs();
    }
    this._renderNav();
    this._updateActiveTab();
    this._pushRoute(this._activeTab);
    this._activeView()?.refresh?.();
  }

  async _reloadDynamicTabs() {
    if (!this._hass) {
      return;
    }
    try {
      const { tabs } = await callWS(this._hass, "meals_and_groceries/tabs/list");
      this._dynamicTabs = [...tabs].sort((a, b) => a.sort_index - b.sort_index);
    } catch (err) {
      console.error("Meals & Groceries: failed to load tabs", err);
      return;
    }
    this._syncDynamicViews();
    this._renderNav();
    this._updateActiveTab();
    // A tab:<id> deep link only resolves once the dynamic tabs exist.
    if (this._routeTab.startsWith("tab:")) {
      this._applyRoute();
    }
  }

  // One mag-group-tab-view instance per configured tab, keyed by
  // data-view="tab:<id>". Only actually added/removed tabs are touched so
  // surviving tabs keep their open subscriptions.
  _syncDynamicViews() {
    const main = this.shadowRoot.querySelector("main");
    const wanted = new Map(this._dynamicTabs.map((tab) => [`tab:${tab.id}`, tab]));

    for (const el of main.querySelectorAll("mag-group-tab-view")) {
      if (!wanted.has(el.dataset.view)) {
        el.remove();
      }
    }
    for (const [viewId, tab] of wanted) {
      let el = main.querySelector(`[data-view="${viewId}"]`);
      if (!el) {
        el = document.createElement("mag-group-tab-view");
        el.dataset.view = viewId;
        main.appendChild(el);
        if (this._hass) {
          el.hass = this._hass;
        }
      }
      el.tab = tab;
    }

    // Active tab may have been deleted meanwhile.
    if (
      this._activeTab.startsWith("tab:") &&
      !wanted.has(this._activeTab)
    ) {
      this._activeTab = DAILY_TABS[0];
    }
  }

  _renderNav() {
    const navEl = this.shadowRoot.getElementById("nav");
    const entries = this._configMode
      ? CONFIG_TABS.map((tab) => ({ id: tab }))
      : [
          ...DAILY_TABS.map((tab) => ({ id: tab })),
          ...this._dynamicTabs.map((tab) => ({
            id: `tab:${tab.id}`,
            label: tab.name,
          })),
        ];
    navEl.innerHTML = entries
      .map(
        (entry) =>
          `<button class="tab" data-tab="${entry.id}"${
            entry.label !== undefined ? ` data-fixed-label="1"` : ""
          }>${entry.label !== undefined ? _escape(entry.label) : ""}</button>`
      )
      .join("");
    this._applyNavLabels();
    this._updateActiveTab();
  }

  _applyNavLabels() {
    if (!this._hass) {
      return;
    }
    this.shadowRoot.getElementById("panel-title").textContent = t(
      this._hass,
      "panel_title"
    );
    this.shadowRoot.querySelectorAll("button.tab").forEach((button) => {
      if (!button.dataset.fixedLabel) {
        button.textContent = t(this._hass, `tab_${button.dataset.tab}`);
      }
    });
    const toggle = this.shadowRoot.getElementById("config-toggle");
    toggle.title = t(this._hass, "config_mode_button");
    toggle.setAttribute("aria-label", t(this._hass, "config_mode_button"));
    toggle.classList.toggle("active", this._configMode);
    this._updateShoppingBadge();
  }

  // Total open items across all shopping lists, shown on the shopping-list
  // tab button. The todo entities' state is the open-item count, so plain
  // hass updates keep this live.
  _updateShoppingBadge() {
    if (!this._hass || !this.shadowRoot) {
      return;
    }
    const button = this.shadowRoot.querySelector(
      'button.tab[data-tab="shoppinglist"]'
    );
    if (!button) {
      return;
    }
    let count = 0;
    for (const entityId of this._storeTodoEntityIds) {
      const value = Number(this._hass.states[entityId]?.state);
      if (!Number.isNaN(value)) {
        count += value;
      }
    }
    let badge = button.querySelector(".badge");
    if (count > 0) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "badge";
        button.appendChild(badge);
      }
      badge.textContent = count;
    } else if (badge) {
      badge.remove();
    }
  }

  _updateActiveTab() {
    this.shadowRoot.querySelectorAll("button.tab").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === this._activeTab);
    });
    this.shadowRoot.querySelectorAll("main > [data-view]").forEach((el) => {
      el.style.display = el.dataset.view === this._activeTab ? "block" : "none";
    });
  }

  _activeView() {
    return this.shadowRoot.querySelector(
      `main > [data-view="${this._activeTab}"]`
    );
  }

  _updateHass() {
    if (!this._hass || !this.shadowRoot) {
      return;
    }
    this._applyNavLabels();

    this.shadowRoot.querySelectorAll("main > [data-view]").forEach((view) => {
      view.hass = this._hass;
    });

    this._updateMenuButton();
  }

  _updateMenuButton() {
    const menuButton = this.shadowRoot?.querySelector("ha-menu-button");
    if (!menuButton) {
      return;
    }
    menuButton.hass = this._hass;
    menuButton.narrow = this._narrow;
  }

  _subscribeBarcodeUnknown() {
    if (this._barcodeSubscribed || !this._hass?.connection) {
      return;
    }
    this._barcodeSubscribed = true;
    this._hass.connection.subscribeMessage(
      (message) => this._onUnknownBarcode(message.barcode),
      { type: "meals_and_groceries/barcode_unknown/subscribe" }
    );
  }

  // Driven by the select_panel_tab service (e.g. a zone automation showing
  // the shopping list on arrival, or the meal plan when arriving home).
  _subscribePanelTab() {
    if (this._panelTabSubscribed || !this._hass?.connection) {
      return;
    }
    this._panelTabSubscribed = true;
    this._hass.connection.subscribeMessage(
      (message) => this._onPanelTabSelected(message.tab, message.replay),
      { type: "meals_and_groceries/panel_tab/subscribe" }
    );
  }

  // The server replays the last selected tab right after subscribing. That
  // replay only sets the starting tab of a bare panel open — a deep link is
  // an explicit request and wins over whatever an automation picked earlier.
  _onPanelTabSelected(tab, replay = false) {
    if (!DAILY_TABS.includes(tab)) {
      return;
    }
    if (replay && this._openedViaDeepLink) {
      return;
    }
    this._configMode = false;
    this._activeTab = tab;
    this._renderNav();
    this._updateActiveTab();
    this._pushRoute(tab);
    this._activeView()?.refresh?.();
  }

  _onUnknownBarcode(barcode) {
    this._configMode = true;
    this._activeTab = "products";
    this._renderNav();
    this._updateActiveTab();
    this._pushRoute("products");
    const productsView = this.shadowRoot.querySelector("mag-products-view");
    productsView?.openWithBarcode(barcode);
    this._showToast(t(this._hass, "unknown_barcode_toast").replace("{barcode}", barcode));
  }

  _showToast(message) {
    const toast = this.shadowRoot.getElementById("toast");
    toast.textContent = message;
    toast.style.display = "block";
    clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => {
      toast.style.display = "none";
    }, 6000);
  }
}

function _escape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

if (!customElements.get("meals-and-groceries-panel")) {
  customElements.define("meals-and-groceries-panel", MealsAndGroceriesPanel);
}
