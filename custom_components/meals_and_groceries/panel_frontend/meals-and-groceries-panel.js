class MealsAndGroceriesPanel extends HTMLElement {
  connectedCallback() {
    if (this._rendered) {
      return;
    }
    this._rendered = true;
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; padding: 16px; }
      </style>
      <p>Meals &amp; Groceries panel placeholder — navigation and views land in Phase 4.2+.</p>
    `;
  }

  set hass(hass) {
    this._hass = hass;
  }
}

customElements.define("meals-and-groceries-panel", MealsAndGroceriesPanel);
