import { t } from "../translations.js";
import { callWS } from "../ha-ws.js";
import {
  PRODUCT_TILE_CSS,
  renderProductTileHtml,
  resolveTileState,
  toggleProductTile,
} from "../cards/product-tile.js";
import { createMultiStoreSubscriptions } from "../cards/multi-store-subscribe.js";

const WEEKDAY_IDS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const KIND_IDS = ["dish", "restaurant", "away", "other"];

class MealsAndGroceriesMealplanView extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._dishes = [];
    this._days = [];
    this._products = [];
    this._stores = [];
    this._error = null;
    this._overlaySubs = null;
    this._overlayItemsByStore = new Map();
    this._overlayProducts = [];
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this._buildShell();
    }
  }

  disconnectedCallback() {
    this._closeIngredientsOverlay();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this._buildShell();
    }
    if (first) {
      this._loadAll();
    }
  }

  get hass() {
    return this._hass;
  }

  refresh() {
    if (this._hass) {
      this._loadAll();
    }
  }

  _buildShell() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        select, input {
          font: inherit;
          padding: 8px;
          border: 1px solid var(--divider-color, #ccc);
          border-radius: 4px;
          background: var(--card-background-color, #fff);
          color: var(--primary-text-color, inherit);
        }
        button {
          font: inherit;
          padding: 8px 12px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          background: var(--primary-color, #03a9f4);
          color: var(--text-primary-color, #fff);
        }
        button.secondary {
          background: none;
          color: var(--primary-text-color, inherit);
          border: 1px solid var(--divider-color, #ccc);
        }
        button.icon-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 6px;
        }
        #error { color: var(--error-color, #db4437); }
        .day-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 0;
          border-bottom: 1px solid var(--divider-color, #eee);
          flex-wrap: wrap;
        }
        .day-label { width: 110px; font-weight: 500; flex-shrink: 0; }
        #lookup-row {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          margin-top: 24px;
          padding: 12px 16px;
          border: 1px solid var(--divider-color, #ccc);
          border-radius: var(--ha-card-border-radius, 12px);
          background: var(--card-background-color, #fff);
          box-shadow: var(--ha-card-box-shadow, none);
        }
        .day-controls { display: flex; align-items: center; gap: 8px; flex: 1; flex-wrap: wrap; }
        .day-controls select { flex: 1; min-width: 160px; }
        .day-controls input { flex: 1; min-width: 160px; }
        #overlay-container:empty { display: none; }
        .overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 5vh 16px;
          overflow-y: auto;
          z-index: 10;
        }
        .sheet {
          width: 100%;
          max-width: 480px;
          padding: 16px;
          border-radius: 8px;
          background: var(--primary-background-color, #fafafa);
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
        }
        .sheet-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }
        .sheet-header h3 { margin: 0; }
        .store-heading {
          margin: 16px 0 8px;
          font-size: 13px;
          font-weight: 500;
          color: var(--secondary-text-color, inherit);
          text-transform: uppercase;
        }
        .tiles { display: flex; flex-direction: column; gap: 8px; }
        ${PRODUCT_TILE_CSS}
      </style>
      <div id="error"></div>
      <div id="grid"></div>
      <div id="lookup-row">
        <div class="day-label" id="lookup-label"></div>
        <div class="day-controls">
          <select id="lookup-select"></select>
          <button
            class="icon-btn"
            id="lookup-cart"
            style="display: none;"
            aria-label="${t(this._hass, "mealplan_show_ingredients")}"
          ><ha-icon icon="mdi:cart-outline"></ha-icon></button>
        </div>
      </div>
      <div id="overlay-container"></div>
    `;

    const lookupSelect = this.shadowRoot.getElementById("lookup-select");
    const lookupCart = this.shadowRoot.getElementById("lookup-cart");
    lookupSelect.addEventListener("change", () => {
      lookupCart.style.display = this._dishHasIngredients(lookupSelect.value)
        ? ""
        : "none";
    });
    lookupCart.addEventListener("click", () => {
      if (lookupSelect.value) {
        this._openIngredientsOverlay(lookupSelect.value);
      }
    });
  }

  async _loadAll() {
    try {
      const [{ dishes }, { days }, { products }, { stores }] = await Promise.all([
        callWS(this._hass, "meals_and_groceries/dishes/list"),
        callWS(this._hass, "meals_and_groceries/mealplan/get"),
        callWS(this._hass, "meals_and_groceries/products/list"),
        callWS(this._hass, "meals_and_groceries/stores/list"),
      ]);
      this._dishes = dishes;
      this._days = days;
      this._products = products;
      this._stores = stores;
      this._error = null;
    } catch (err) {
      this._error = err?.message || String(err);
    }
    this._renderGrid();
  }

  _dishOptionsHtml(selectedId, dishes = this._dishes) {
    const hass = this._hass;
    const groupOptions = (kind) => {
      const items = dishes
        .filter((d) => d.kind === kind)
        .sort((a, b) => a.name.localeCompare(b.name));
      if (items.length === 0) {
        return "";
      }
      const options = items
        .map(
          (dish) =>
            `<option value="${dish.id}" ${
              dish.id === selectedId ? "selected" : ""
            }>${_escape(dish.name)}</option>`
        )
        .join("");
      return `<optgroup label="${t(hass, `mealplan_group_${kind}`)}">${options}</optgroup>`;
    };
    return (
      `<option value="" ${!selectedId ? "selected" : ""}>${t(
        hass,
        "mealplan_no_dish"
      )}</option>` +
      KIND_IDS.map(groupOptions).join("")
    );
  }

  _dishHasIngredients(dishId) {
    if (!dishId) {
      return false;
    }
    const dish = this._dishes.find((d) => d.id === dishId);
    return (dish?.ingredients || []).length > 0;
  }

  _renderGrid() {
    const hass = this._hass;
    const errorEl = this.shadowRoot.getElementById("error");
    errorEl.textContent = this._error
      ? `${t(hass, "error_prefix")}: ${this._error}`
      : "";

    // Dish lookup row: browse any dish's ingredients without assigning it
    // to a day.
    this.shadowRoot.getElementById("lookup-label").textContent = t(
      hass,
      "mealplan_lookup_label"
    );
    const lookupSelect = this.shadowRoot.getElementById("lookup-select");
    const lookupValue = lookupSelect.value;
    // Only dishes that actually have ingredients — anything else would make
    // the "ingredients" label a lie.
    const withIngredients = this._dishes.filter(
      (d) => (d.ingredients || []).length > 0
    );
    lookupSelect.innerHTML = this._dishOptionsHtml(
      lookupValue || null,
      withIngredients
    );
    this.shadowRoot.getElementById("lookup-row").style.display =
      withIngredients.length ? "" : "none";
    const lookupCart = this.shadowRoot.getElementById("lookup-cart");
    lookupCart.title = t(hass, "mealplan_show_ingredients");
    lookupCart.setAttribute("aria-label", t(hass, "mealplan_show_ingredients"));
    lookupCart.style.display = this._dishHasIngredients(lookupSelect.value)
      ? ""
      : "none";

    const gridEl = this.shadowRoot.getElementById("grid");
    const byIndex = new Map(this._days.map((day) => [day.weekday_index, day]));

    gridEl.innerHTML = WEEKDAY_IDS.map((weekdayId, index) => {
      const day = byIndex.get(index) || {};
      const showCart = this._dishHasIngredients(day.dish_id);
      return `
        <div class="day-row" data-index="${index}">
          <div class="day-label">${t(hass, `weekday_${weekdayId}`)}</div>
          <div class="day-controls">
            <select data-role="dish">${this._dishOptionsHtml(day.dish_id)}</select>
            <input
              type="text"
              data-role="free-text"
              placeholder="${t(hass, "mealplan_free_text_placeholder")}"
              value="${_escapeAttr(day.dish_id ? "" : day.free_text || "")}"
            />
            <button
              class="icon-btn"
              data-role="cart"
              title="${t(hass, "mealplan_show_ingredients")}"
              aria-label="${t(hass, "mealplan_show_ingredients")}"
              style="${showCart ? "" : "display: none;"}"
            ><ha-icon icon="mdi:cart-outline"></ha-icon></button>
            <button
              class="secondary icon-btn"
              data-role="clear"
              title="${t(hass, "clear")}"
              aria-label="${t(hass, "clear")}"
            ><ha-icon icon="mdi:close-circle-outline"></ha-icon></button>
          </div>
        </div>`;
    }).join("");

    gridEl.querySelectorAll(".day-row").forEach((row) => {
      const index = Number(row.dataset.index);
      const select = row.querySelector('[data-role="dish"]');
      const textInput = row.querySelector('[data-role="free-text"]');
      const cartButton = row.querySelector('[data-role="cart"]');
      const clearButton = row.querySelector('[data-role="clear"]');

      const updateCart = () => {
        cartButton.style.display = this._dishHasIngredients(select.value)
          ? ""
          : "none";
      };

      select.addEventListener("change", () => {
        const dishId = select.value || null;
        textInput.value = "";
        updateCart();
        this._setDay(index, { dish_id: dishId, free_text: null });
      });
      textInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          textInput.blur();
        }
      });
      textInput.addEventListener("blur", () => {
        const value = textInput.value.trim();
        if (!value) {
          return;
        }
        select.value = "";
        updateCart();
        this._setDay(index, { dish_id: null, free_text: value });
      });
      cartButton.addEventListener("click", () => {
        if (select.value) {
          this._openIngredientsOverlay(select.value);
        }
      });
      clearButton.addEventListener("click", () => {
        select.value = "";
        textInput.value = "";
        updateCart();
        this._setDay(index, { dish_id: null, free_text: null });
      });
    });
  }

  async _setDay(weekdayIndex, { dish_id, free_text }) {
    try {
      await callWS(this._hass, "meals_and_groceries/mealplan/set_day", {
        weekday_index: weekdayIndex,
        dish_id,
        free_text,
      });
      const day = this._days.find((d) => d.weekday_index === weekdayIndex);
      if (day) {
        day.dish_id = dish_id;
        day.free_text = free_text;
      } else {
        this._days.push({ weekday_index: weekdayIndex, dish_id, free_text });
      }
    } catch (err) {
      this._error = err?.message || String(err);
      this._renderGrid();
    }
  }

  // --- ingredients overlay --------------------------------------------------

  _openIngredientsOverlay(dishId) {
    this._closeIngredientsOverlay();

    const dish = this._dishes.find((d) => d.id === dishId);
    if (!dish) {
      return;
    }
    // Resolve ingredient products; skip references to deleted products.
    this._overlayProducts = (dish.ingredients || [])
      .map((productId) => this._products.find((p) => p.id === productId))
      .filter(Boolean);
    if (this._overlayProducts.length === 0) {
      return;
    }

    const container = this.shadowRoot.getElementById("overlay-container");
    container.innerHTML = `
      <div class="overlay" id="ing-overlay">
        <div class="sheet">
          <div class="sheet-header">
            <h3>${_escape(dish.name)}</h3>
            <button class="secondary icon-btn" id="ing-close">
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
          <div id="ing-sections"></div>
        </div>
      </div>
    `;

    container.querySelector("#ing-overlay").addEventListener("click", (event) => {
      if (event.target.id === "ing-overlay") {
        this._closeIngredientsOverlay();
      }
    });
    container
      .querySelector("#ing-close")
      .addEventListener("click", () => this._closeIngredientsOverlay());
    container
      .querySelector("#ing-sections")
      .addEventListener("click", (event) => this._onOverlayTileClick(event));

    this._overlayItemsByStore = new Map();
    const storeIds = [
      ...new Set(this._overlayProducts.map((p) => p.store_subentry_id)),
    ];
    this._overlaySubs = createMultiStoreSubscriptions(
      this._hass,
      this._stores,
      (storeId, items) => {
        this._overlayItemsByStore.set(storeId, items || []);
        this._renderOverlaySections();
      }
    );
    this._overlaySubs.update(storeIds);
    this._renderOverlaySections();
  }

  _closeIngredientsOverlay() {
    if (this._overlaySubs) {
      this._overlaySubs.closeAll();
      this._overlaySubs = null;
    }
    this._overlayItemsByStore = new Map();
    this._overlayProducts = [];
    const container = this.shadowRoot?.getElementById("overlay-container");
    if (container) {
      container.innerHTML = "";
    }
  }

  _renderOverlaySections() {
    const sectionsEl = this.shadowRoot.getElementById("ing-sections");
    if (!sectionsEl) {
      return;
    }
    const byStore = new Map();
    for (const product of this._overlayProducts) {
      if (!byStore.has(product.store_subentry_id)) {
        byStore.set(product.store_subentry_id, []);
      }
      byStore.get(product.store_subentry_id).push(product);
    }

    sectionsEl.innerHTML = [...byStore.entries()]
      .map(([storeId, products]) => {
        const title =
          this._stores.find((s) => s.subentry_id === storeId)?.title || "?";
        const items = this._overlayItemsByStore.get(storeId) || [];
        const tiles = products
          .map((product) => {
            const { isOn } = resolveTileState(items, product.name);
            return renderProductTileHtml({
              id: product.id,
              name: product.name,
              subtitle: null,
              isOn,
            });
          })
          .join("");
        return `
          <div class="store-heading">${_escape(title)}</div>
          <div class="tiles">${tiles}</div>`;
      })
      .join("");
  }

  async _onOverlayTileClick(event) {
    const tile = event.target.closest("[data-product-id]");
    if (!tile) {
      return;
    }
    const product = this._overlayProducts.find(
      (p) => p.id === tile.dataset.productId
    );
    const store = this._stores.find(
      (s) => s.subentry_id === product?.store_subentry_id
    );
    if (!product || !store?.todo_entity_id) {
      return;
    }
    const items = this._overlayItemsByStore.get(store.subentry_id) || [];
    const { isOn, currentItemUid } = resolveTileState(items, product.name);
    try {
      await toggleProductTile(this._hass, {
        todoEntityId: store.todo_entity_id,
        productName: product.name,
        isOn,
        currentItemUid,
      });
    } catch (err) {
      this._error = err?.message || String(err);
      this._renderGrid();
    }
  }
}

function _escape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function _escapeAttr(value) {
  return _escape(value).replaceAll('"', "&quot;");
}

if (!customElements.get("mag-mealplan-view")) {
  customElements.define("mag-mealplan-view", MealsAndGroceriesMealplanView);
}
