import { t } from "../translations.js";
import { callWS } from "../ha-ws.js";
import { setIconButton, iconButtonMarkup } from "../cards/icon-button.js";

// Config page for the extra daily-use panel tabs. Groups are managed inside
// the tab form (tab -> 1:n -> ordered groups): new groups are created on
// save, renames are applied on save, deletions of existing groups happen
// immediately (with cascade cleanup server-side). The tab list itself is
// drag&drop-sortable (order in the daily navigation).
class MealsAndGroceriesTabsView extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._tabs = [];
    this._groups = [];
    this._error = null;
    this._draggingId = null;
    this._editingTabId = null;
    this._formName = "";
    // Ordered form entries: { id: string|null, name: string } — id === null
    // means "create this group on save".
    this._formGroups = [];
    this._formDraggingIndex = null;
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

  refresh() {
    if (this._hass) {
      this._loadAll();
    }
  }

  _buildShell() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        input, select {
          font: inherit;
          padding: 8px;
          border: 1px solid var(--divider-color, #ccc);
          border-radius: 4px;
          background: var(--card-background-color, #fff);
          color: var(--primary-text-color, inherit);
        }
        button {
          font: inherit;
          padding: 8px 16px;
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
        button.danger { background: var(--error-color, #db4437); }
        button.icon-only {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          padding: 0;
          flex-shrink: 0;
        }
        .toolbar { display: flex; justify-content: flex-end; margin-bottom: 16px; }
        #error { color: var(--error-color, #db4437); }
        ul { list-style: none; margin: 0; padding: 0; }
        li {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px;
          margin-bottom: 4px;
          border: 1px solid var(--divider-color, #eee);
          border-radius: 4px;
          background: var(--card-background-color, transparent);
          cursor: grab;
        }
        li.dragover { border-color: var(--primary-color, #03a9f4); }
        li .drag-handle {
          flex-shrink: 0;
          color: var(--secondary-text-color, inherit);
          opacity: 0.6;
          cursor: grab;
        }
        li .name { flex: 1; }
        li .meta { color: var(--secondary-text-color, inherit); font-size: 12px; }
        li .actions { display: flex; gap: 4px; }
        #form-container:empty { display: none; }
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
        .form {
          width: 100%;
          max-width: 480px;
          padding: 16px;
          border-radius: 8px;
          background: var(--card-background-color, #fff);
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
        }
        .form-row { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
        .form-row label { font-size: 12px; color: var(--secondary-text-color, inherit); }
        .form-actions { display: flex; gap: 8px; justify-content: flex-end; }
        .group-add-row { display: flex; gap: 8px; margin-top: 8px; }
        .group-add-row input { flex: 1; }
      </style>
      <div class="toolbar">
        <button id="add-btn" class="icon-only"></button>
      </div>
      <div id="error"></div>
      <ul id="list"></ul>
      <div id="form-container"></div>
    `;

    this.shadowRoot
      .getElementById("add-btn")
      .addEventListener("click", () => this._openForm(null));
  }

  _applyLabels() {
    setIconButton(this.shadowRoot.getElementById("add-btn"), this._hass, "add_tab", "mdi:plus");
  }

  async _loadAll() {
    try {
      const [{ tabs }, { groups }] = await Promise.all([
        callWS(this._hass, "meals_and_groceries/tabs/list"),
        callWS(this._hass, "meals_and_groceries/groups/list"),
      ]);
      this._tabs = [...tabs].sort((a, b) => a.sort_index - b.sort_index);
      this._groups = groups;
      this._error = null;
    } catch (err) {
      this._error = err?.message || String(err);
    }
    this._applyLabels();
    this._renderList();
  }

  _groupName(groupId) {
    return this._groups.find((g) => g.id === groupId)?.name || "?";
  }

  _renderList() {
    const hass = this._hass;
    const listEl = this.shadowRoot.getElementById("list");
    const errorEl = this.shadowRoot.getElementById("error");
    errorEl.textContent = this._error
      ? `${t(hass, "error_prefix")}: ${this._error}`
      : "";

    if (this._tabs.length === 0) {
      listEl.innerHTML = `<li>${t(hass, "no_tabs")}</li>`;
      return;
    }

    listEl.innerHTML = this._tabs
      .map((tab) => {
        const groupNames = (tab.group_ids || [])
          .map((groupId) => this._groupName(groupId))
          .join(", ");
        return `
        <li draggable="true" data-id="${tab.id}">
          <ha-icon class="drag-handle" icon="mdi:drag"></ha-icon>
          <span class="name">${_escape(tab.name)}
            <div class="meta">${_escape(groupNames)}</div>
          </span>
          <span class="actions">
            <button class="secondary icon-only" ${
              iconButtonMarkup(hass, "edit", "mdi:pencil").attrs
            } data-action="edit" data-id="${tab.id}">${
          iconButtonMarkup(hass, "edit", "mdi:pencil").content
        }</button>
            <button class="danger icon-only" ${
              iconButtonMarkup(hass, "delete", "mdi:delete-outline").attrs
            } data-action="delete" data-id="${tab.id}">${
          iconButtonMarkup(hass, "delete", "mdi:delete-outline").content
        }</button>
          </span>
        </li>`;
      })
      .join("");

    listEl.querySelectorAll("li[draggable]").forEach((li) => {
      li.addEventListener("dragstart", (event) => {
        this._draggingId = li.dataset.id;
        event.dataTransfer.effectAllowed = "move";
      });
      li.addEventListener("dragover", (event) => {
        event.preventDefault();
        li.classList.add("dragover");
      });
      li.addEventListener("dragleave", () => li.classList.remove("dragover"));
      li.addEventListener("drop", (event) => {
        event.preventDefault();
        li.classList.remove("dragover");
        this._reorder(this._draggingId, li.dataset.id);
      });
    });

    listEl.querySelectorAll("[data-action='edit']").forEach((button) => {
      button.addEventListener("click", () => this._openForm(button.dataset.id));
    });
    listEl.querySelectorAll("[data-action='delete']").forEach((button) => {
      button.addEventListener("click", () => this._deleteTab(button.dataset.id));
    });
  }

  async _openForm(tabId) {
    this._editingTabId = tabId;
    // Groups may have changed elsewhere — refresh before showing.
    try {
      const { groups } = await callWS(this._hass, "meals_and_groceries/groups/list");
      this._groups = groups;
    } catch (err) {
      this._error = err?.message || String(err);
    }
    const tab = tabId ? this._tabs.find((tb) => tb.id === tabId) : null;
    this._formName = tab?.name || "";
    this._formGroups = (tab?.group_ids || [])
      .map((groupId) => {
        const group = this._groups.find((g) => g.id === groupId);
        return group ? { id: group.id, name: group.name } : null;
      })
      .filter(Boolean);
    this._renderForm();
  }

  _closeForm() {
    this._editingTabId = null;
    this.shadowRoot.getElementById("form-container").innerHTML = "";
  }

  _renderForm() {
    const hass = this._hass;
    const container = this.shadowRoot.getElementById("form-container");
    const isEdit = this._editingTabId !== null;

    container.innerHTML = `
      <div class="overlay" id="overlay">
        <div class="form">
          <h3>${t(hass, isEdit ? "edit" : "add_tab")}</h3>
          <div class="form-row">
            <label>${t(hass, "product_name")}</label>
            <input id="f-name" type="text" value="${_escapeAttr(this._formName)}"
              placeholder="${t(hass, "tab_name_placeholder")}" />
          </div>
          <div class="form-row">
            <label>${t(hass, "tab_groups_label")}</label>
            <ul id="form-groups"></ul>
            <div class="group-add-row">
              <input id="f-group-name" type="text"
                placeholder="${t(hass, "group_name_placeholder")}" />
              <button class="secondary icon-only" id="f-group-add" ${
                iconButtonMarkup(hass, "add_group_button", "mdi:plus").attrs
              }>${iconButtonMarkup(hass, "add_group_button", "mdi:plus").content}</button>
            </div>
          </div>
          <div class="form-actions">
            <button class="secondary icon-only" id="f-cancel" ${
              iconButtonMarkup(hass, "cancel", "mdi:close").attrs
            }>${iconButtonMarkup(hass, "cancel", "mdi:close").content}</button>
            <button class="icon-only" id="f-save" ${
              iconButtonMarkup(hass, "save", "mdi:content-save").attrs
            }>${iconButtonMarkup(hass, "save", "mdi:content-save").content}</button>
          </div>
        </div>
      </div>
    `;

    container.querySelector("#overlay").addEventListener("click", (event) => {
      if (event.target.id === "overlay") {
        this._closeForm();
      }
    });
    container.querySelector("#f-name").addEventListener("input", (event) => {
      this._formName = event.target.value;
    });
    const groupInput = container.querySelector("#f-group-name");
    const addGroup = () => {
      const name = groupInput.value.trim();
      if (!name) {
        return;
      }
      this._formGroups.push({ id: null, name });
      groupInput.value = "";
      this._renderFormGroups();
    };
    groupInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addGroup();
      }
    });
    container.querySelector("#f-group-add").addEventListener("click", addGroup);
    container
      .querySelector("#f-cancel")
      .addEventListener("click", () => this._closeForm());
    container.querySelector("#f-save").addEventListener("click", () => this._save());

    this._renderFormGroups();
  }

  _renderFormGroups() {
    const hass = this._hass;
    const listEl = this.shadowRoot.getElementById("form-groups");
    if (!listEl) {
      return;
    }

    listEl.innerHTML = this._formGroups
      .map(
        (entry, index) => `
        <li draggable="true" data-index="${index}">
          <ha-icon class="drag-handle" icon="mdi:drag"></ha-icon>
          <span class="name" data-name>${_escape(entry.name)}</span>
          <span class="actions">
            <button class="secondary icon-only" ${
              iconButtonMarkup(hass, "edit", "mdi:pencil").attrs
            } data-rename="${index}">${
          iconButtonMarkup(hass, "edit", "mdi:pencil").content
        }</button>
            <button class="danger icon-only" ${
              iconButtonMarkup(hass, "delete", "mdi:delete-outline").attrs
            } data-remove="${index}">${
          iconButtonMarkup(hass, "delete", "mdi:delete-outline").content
        }</button>
          </span>
        </li>`
      )
      .join("");

    listEl.querySelectorAll("li[draggable]").forEach((li) => {
      li.addEventListener("dragstart", (event) => {
        this._formDraggingIndex = Number(li.dataset.index);
        event.dataTransfer.effectAllowed = "move";
      });
      li.addEventListener("dragover", (event) => {
        event.preventDefault();
        li.classList.add("dragover");
      });
      li.addEventListener("dragleave", () => li.classList.remove("dragover"));
      li.addEventListener("drop", (event) => {
        event.preventDefault();
        li.classList.remove("dragover");
        const from = this._formDraggingIndex;
        const to = Number(li.dataset.index);
        if (from === null || from === to) {
          return;
        }
        const [moved] = this._formGroups.splice(from, 1);
        this._formGroups.splice(to, 0, moved);
        this._renderFormGroups();
      });
    });

    listEl.querySelectorAll("[data-rename]").forEach((button) => {
      button.addEventListener("click", () =>
        this._startRenameGroup(Number(button.dataset.rename))
      );
    });
    listEl.querySelectorAll("[data-remove]").forEach((button) => {
      button.addEventListener("click", () =>
        this._removeGroup(Number(button.dataset.remove))
      );
    });
  }

  _startRenameGroup(index) {
    const li = this.shadowRoot.querySelector(`#form-groups li[data-index="${index}"]`);
    const nameSpan = li.querySelector("[data-name]");
    const entry = this._formGroups[index];
    nameSpan.innerHTML = `<input type="text" value="${_escapeAttr(entry.name)}" />`;
    const input = nameSpan.querySelector("input");
    input.focus();
    input.select();
    const commit = () => {
      const newName = input.value.trim();
      if (newName) {
        entry.name = newName;
      }
      this._renderFormGroups();
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
      } else if (event.key === "Escape") {
        this._renderFormGroups();
      }
    });
    input.addEventListener("blur", commit);
  }

  async _removeGroup(index) {
    const entry = this._formGroups[index];
    if (entry.id) {
      // Existing group: deleting it also drops product assignments — confirm
      // and apply immediately (server cleans references).
      if (!window.confirm(t(this._hass, "confirm_delete_group"))) {
        return;
      }
      try {
        await callWS(this._hass, "meals_and_groceries/groups/delete", {
          group_id: entry.id,
        });
      } catch (err) {
        window.alert(`${t(this._hass, "error_prefix")}: ${err?.message || err}`);
        return;
      }
    }
    this._formGroups.splice(index, 1);
    this._renderFormGroups();
  }

  async _save() {
    const hass = this._hass;
    const name = this._formName.trim();
    if (!name) {
      window.alert(t(hass, "name_required"));
      return;
    }
    try {
      const groupIds = [];
      for (const entry of this._formGroups) {
        if (entry.id === null) {
          const { group } = await callWS(hass, "meals_and_groceries/groups/add", {
            name: entry.name,
          });
          groupIds.push(group.id);
          continue;
        }
        const original = this._groups.find((g) => g.id === entry.id);
        if (original && original.name !== entry.name) {
          await callWS(hass, "meals_and_groceries/groups/update", {
            group_id: entry.id,
            name: entry.name,
          });
        }
        groupIds.push(entry.id);
      }

      if (this._editingTabId) {
        await callWS(hass, "meals_and_groceries/tabs/update", {
          tab_id: this._editingTabId,
          name,
          group_ids: groupIds,
        });
      } else {
        await callWS(hass, "meals_and_groceries/tabs/add", {
          name,
          group_ids: groupIds,
        });
      }
      this._closeForm();
      await this._loadAll();
    } catch (err) {
      window.alert(`${t(hass, "error_prefix")}: ${err?.message || err}`);
    }
  }

  async _deleteTab(tabId) {
    if (!window.confirm(t(this._hass, "confirm_delete_tab"))) {
      return;
    }
    try {
      await callWS(this._hass, "meals_and_groceries/tabs/delete", {
        tab_id: tabId,
      });
      await this._loadAll();
    } catch (err) {
      this._error = err?.message || String(err);
      this._renderList();
    }
  }

  async _reorder(draggedId, targetId) {
    if (!draggedId || draggedId === targetId) {
      return;
    }
    const ids = this._tabs.map((tab) => tab.id);
    const fromIndex = ids.indexOf(draggedId);
    const toIndex = ids.indexOf(targetId);
    if (fromIndex === -1 || toIndex === -1) {
      return;
    }
    ids.splice(fromIndex, 1);
    ids.splice(toIndex, 0, draggedId);

    try {
      await callWS(this._hass, "meals_and_groceries/tabs/reorder", {
        tab_ids: ids,
      });
      await this._loadAll();
    } catch (err) {
      this._error = err?.message || String(err);
      this._renderList();
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

if (!customElements.get("mag-tabs-view")) {
  customElements.define("mag-tabs-view", MealsAndGroceriesTabsView);
}
