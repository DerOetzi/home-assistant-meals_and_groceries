import { t } from "./translations.js";
import { callWS } from "./ha-ws.js";

const TABS = ["categories", "products", "dishes", "mealplan"];

class MealsAndGroceriesPanel extends HTMLElement {
  constructor() {
    super();
    this._activeTab = TABS[0];
    this._stores = null;
    this._error = null;
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
    }
    this._render();
    this._loadStores();
  }

  set hass(hass) {
    const hadHass = Boolean(this._hass);
    this._hass = hass;
    this._render();
    if (!hadHass) {
      this._loadStores();
    }
  }

  get hass() {
    return this._hass;
  }

  async _loadStores() {
    if (!this._hass) {
      return;
    }
    try {
      const result = await callWS(this._hass, "meals_and_groceries/stores/list");
      this._stores = result.stores;
      this._error = null;
    } catch (err) {
      this._stores = [];
      this._error = err?.message || String(err);
    }
    this._render();
  }

  _selectTab(tab) {
    this._activeTab = tab;
    this._render();
  }

  _render() {
    if (!this.shadowRoot) {
      return;
    }
    const hass = this._hass;

    let storesLine;
    if (this._error) {
      storesLine = `${t(hass, "error_prefix")}: ${this._error}`;
    } else if (this._stores === null) {
      storesLine = t(hass, "loading");
    } else if (this._stores.length === 0) {
      storesLine = t(hass, "no_stores");
    } else {
      storesLine = this._stores.map((store) => store.title).join(", ");
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif);
          color: var(--primary-text-color, inherit);
          background: var(--primary-background-color, transparent);
          min-height: 100%;
        }
        nav {
          display: flex;
          border-bottom: 1px solid var(--divider-color, #ccc);
          background: var(--card-background-color, transparent);
        }
        button {
          flex: 1;
          padding: 16px;
          border: none;
          background: none;
          cursor: pointer;
          font-size: 14px;
          color: var(--secondary-text-color, inherit);
          border-bottom: 2px solid transparent;
        }
        button.active {
          color: var(--primary-color, #03a9f4);
          border-bottom-color: var(--primary-color, #03a9f4);
        }
        main {
          padding: 16px;
        }
      </style>
      <nav>
        ${TABS.map(
          (tab) =>
            `<button data-tab="${tab}" class="${
              tab === this._activeTab ? "active" : ""
            }">${t(hass, `tab_${tab}`)}</button>`
        ).join("")}
      </nav>
      <main>
        <p>${t(hass, "stores_label")}: ${storesLine}</p>
        <p><em>${t(hass, "view_placeholder")}</em></p>
      </main>
    `;

    this.shadowRoot.querySelectorAll("button[data-tab]").forEach((button) => {
      button.addEventListener("click", () => this._selectTab(button.dataset.tab));
    });
  }
}

if (!customElements.get("meals-and-groceries-panel")) {
  customElements.define("meals-and-groceries-panel", MealsAndGroceriesPanel);
}
