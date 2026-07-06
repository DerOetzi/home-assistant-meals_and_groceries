import { t } from "../translations.js";
import { callWS } from "../ha-ws.js";

class MealsAndGroceriesFavoriteCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._rendered = false;
    this._products = [];
    this._stores = [];
    this._error = null;
  }

  setConfig(config) {
    this._config = { ...config };
    if (this._rendered) {
      this._updateSelectedValue();
    }
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) {
      this._load();
    }
  }

  async _load() {
    try {
      const [{ products }, { stores }] = await Promise.all([
        callWS(this._hass, "meals_and_groceries/products/list"),
        callWS(this._hass, "meals_and_groceries/stores/list"),
      ]);
      this._products = products;
      this._stores = stores;
    } catch (err) {
      this._error = err?.message || String(err);
    }
    this._render();
  }

  _storeTitle(subentryId) {
    return this._stores.find((s) => s.subentry_id === subentryId)?.title || "?";
  }

  _render() {
    if (!this.shadowRoot || !this._hass || !this._config) {
      return;
    }
    const hass = this._hass;

    if (this._error) {
      this.shadowRoot.innerHTML = `<div>${t(hass, "error_prefix")}: ${_escape(
        this._error
      )}</div>`;
      return;
    }

    const byStore = new Map();
    for (const product of this._products) {
      const key = product.store_subentry_id;
      if (!byStore.has(key)) {
        byStore.set(key, []);
      }
      byStore.get(key).push(product);
    }
    for (const list of byStore.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    const groups = [...byStore.entries()]
      .sort((a, b) => this._storeTitle(a[0]).localeCompare(this._storeTitle(b[0])))
      .map(
        ([subentryId, products]) => `
          <optgroup label="${_escape(this._storeTitle(subentryId))}">
            ${products
              .map(
                (p) =>
                  `<option value="${p.id}" ${
                    p.id === this._config.product_id ? "selected" : ""
                  }>${_escape(p.name)}</option>`
              )
              .join("")}
          </optgroup>`
      )
      .join("");

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .form-row { display: flex; flex-direction: column; gap: 4px; padding: 12px 0; }
        label { font-size: 12px; color: var(--secondary-text-color, inherit); }
        select {
          font: inherit;
          padding: 8px;
          border: 1px solid var(--divider-color, #ccc);
          border-radius: 4px;
          background: var(--card-background-color, #fff);
          color: var(--primary-text-color, inherit);
        }
      </style>
      <div class="form-row">
        <label>${t(hass, "editor_product_label")}</label>
        <select id="product">
          <option value="">${t(hass, "editor_product_placeholder")}</option>
          ${groups}
        </select>
      </div>
    `;
    this._rendered = true;

    this.shadowRoot.getElementById("product").addEventListener("change", (event) => {
      this._config = { ...this._config, product_id: event.target.value };
      this.dispatchEvent(
        new CustomEvent("config-changed", {
          detail: { config: this._config },
          bubbles: true,
          composed: true,
        })
      );
    });
  }

  _updateSelectedValue() {
    const select = this.shadowRoot.getElementById("product");
    if (select) {
      select.value = this._config.product_id || "";
    }
  }
}

function _escape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

if (!customElements.get("meals-and-groceries-favorite-card-editor")) {
  customElements.define(
    "meals-and-groceries-favorite-card-editor",
    MealsAndGroceriesFavoriteCardEditor
  );
}
