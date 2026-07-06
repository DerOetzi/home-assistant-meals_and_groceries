import { t } from "../translations.js";
import { callWS } from "../ha-ws.js";

const WEEKDAY_IDS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const KIND_IDS = ["dish", "restaurant", "away"];

class MealsAndGroceriesMealplanView extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._dishes = [];
    this._days = [];
    this._error = null;
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this._buildShell();
    }
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
        .day-controls { display: flex; align-items: center; gap: 8px; flex: 1; flex-wrap: wrap; }
        .day-controls select { flex: 1; min-width: 160px; }
        .day-controls input { flex: 1; min-width: 160px; }
      </style>
      <div id="error"></div>
      <div id="grid"></div>
    `;
  }

  async _loadAll() {
    try {
      const [{ dishes }, { days }] = await Promise.all([
        callWS(this._hass, "meals_and_groceries/dishes/list"),
        callWS(this._hass, "meals_and_groceries/mealplan/get"),
      ]);
      this._dishes = dishes;
      this._days = days;
      this._error = null;
    } catch (err) {
      this._error = err?.message || String(err);
    }
    this._renderGrid();
  }

  _dishOptionsHtml(selectedId) {
    const hass = this._hass;
    const groupOptions = (kind) => {
      const items = this._dishes.filter((d) => d.kind === kind);
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

  _renderGrid() {
    const hass = this._hass;
    const errorEl = this.shadowRoot.getElementById("error");
    errorEl.textContent = this._error
      ? `${t(hass, "error_prefix")}: ${this._error}`
      : "";

    const gridEl = this.shadowRoot.getElementById("grid");
    const byIndex = new Map(this._days.map((day) => [day.weekday_index, day]));

    gridEl.innerHTML = WEEKDAY_IDS.map((weekdayId, index) => {
      const day = byIndex.get(index) || {};
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
            <button class="secondary" data-role="clear">${t(hass, "clear")}</button>
          </div>
        </div>`;
    }).join("");

    gridEl.querySelectorAll(".day-row").forEach((row) => {
      const index = Number(row.dataset.index);
      const select = row.querySelector('[data-role="dish"]');
      const textInput = row.querySelector('[data-role="free-text"]');
      const clearButton = row.querySelector('[data-role="clear"]');

      select.addEventListener("change", () => {
        const dishId = select.value || null;
        textInput.value = "";
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
        this._setDay(index, { dish_id: null, free_text: value });
      });
      clearButton.addEventListener("click", () => {
        select.value = "";
        textInput.value = "";
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
