import { t } from "./translations.js";
import "./views/products-view.js";
import "./views/categories-view.js";
import "./views/dishes-view.js";
import "./views/mealplan-view.js";

const TABS = ["mealplan", "products", "dishes", "categories"];

class MealsAndGroceriesPanel extends HTMLElement {
  constructor() {
    super();
    this._activeTab = TABS[0];
    this._hass = null;
    this._built = false;
    this._barcodeSubscribed = false;
    this._toastTimeout = null;
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
    this._subscribeBarcodeUnknown();
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
      <nav>
        ${TABS.map((tab) => `<button class="tab" data-tab="${tab}"></button>`).join("")}
      </nav>
      <main>
        <mag-mealplan-view data-view="mealplan"></mag-mealplan-view>
        <mag-products-view data-view="products"></mag-products-view>
        <mag-dishes-view data-view="dishes"></mag-dishes-view>
        <mag-categories-view data-view="categories"></mag-categories-view>
      </main>
      <div id="toast"></div>
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

    for (const selector of [
      "mag-products-view",
      "mag-categories-view",
      "mag-dishes-view",
      "mag-mealplan-view",
    ]) {
      const view = this.shadowRoot.querySelector(selector);
      if (view) {
        view.hass = this._hass;
      }
    }
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

  _onUnknownBarcode(barcode) {
    this._activeTab = "products";
    this._updateActiveTab();
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

if (!customElements.get("meals-and-groceries-panel")) {
  customElements.define("meals-and-groceries-panel", MealsAndGroceriesPanel);
}
