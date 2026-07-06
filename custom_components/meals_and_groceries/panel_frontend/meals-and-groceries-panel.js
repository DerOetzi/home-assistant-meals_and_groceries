import { t } from "./translations.js";
import "./views/products-view.js";

const TABS = ["categories", "products", "dishes", "mealplan"];

class MealsAndGroceriesPanel extends HTMLElement {
  constructor() {
    super();
    this._activeTab = TABS[0];
    this._hass = null;
    this._built = false;
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
    }
    if (!this._built) {
      this._build();
      this._built = true;
    }
    this._updateHass();
  }

  set hass(hass) {
    this._hass = hass;
    this._updateHass();
  }

  get hass() {
    return this._hass;
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
        nav {
          display: flex;
          border-bottom: 1px solid var(--divider-color, #ccc);
          background: var(--card-background-color, transparent);
        }
        button.tab {
          flex: 1;
          padding: 16px;
          border: none;
          background: none;
          cursor: pointer;
          font-size: 14px;
          color: var(--secondary-text-color, inherit);
          border-bottom: 2px solid transparent;
        }
        button.tab.active {
          color: var(--primary-color, #03a9f4);
          border-bottom-color: var(--primary-color, #03a9f4);
        }
        main {
          padding: 16px;
        }
        main > [data-view] {
          display: none;
        }
      </style>
      <nav>
        ${TABS.map((tab) => `<button class="tab" data-tab="${tab}"></button>`).join("")}
      </nav>
      <main>
        <div data-view="categories"></div>
        <mag-products-view data-view="products"></mag-products-view>
        <div data-view="dishes"></div>
        <div data-view="mealplan"></div>
      </main>
    `;

    this.shadowRoot.querySelectorAll("button.tab").forEach((button) => {
      button.addEventListener("click", () => {
        this._activeTab = button.dataset.tab;
        this._updateActiveTab();
      });
    });
    this._updateActiveTab();
  }

  _updateActiveTab() {
    this.shadowRoot.querySelectorAll("button.tab").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === this._activeTab);
    });
    this.shadowRoot.querySelectorAll("main > [data-view]").forEach((el) => {
      el.style.display = el.dataset.view === this._activeTab ? "block" : "none";
    });
  }

  _updateHass() {
    if (!this._hass || !this.shadowRoot) {
      return;
    }
    this.shadowRoot.querySelectorAll("button.tab").forEach((button) => {
      button.textContent = t(this._hass, `tab_${button.dataset.tab}`);
    });
    const placeholder = t(this._hass, "view_placeholder");
    this.shadowRoot.querySelectorAll(
      'main > [data-view="categories"], main > [data-view="dishes"], main > [data-view="mealplan"]'
    ).forEach((el) => {
      if (!el.textContent) {
        el.innerHTML = `<p><em>${placeholder}</em></p>`;
      }
    });

    const productsView = this.shadowRoot.querySelector("mag-products-view");
    if (productsView) {
      productsView.hass = this._hass;
    }
  }
}

if (!customElements.get("meals-and-groceries-panel")) {
  customElements.define("meals-and-groceries-panel", MealsAndGroceriesPanel);
}
