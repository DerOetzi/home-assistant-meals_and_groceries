from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Product:
    """A product master record, shared across all shopping lists."""

    id: str
    name: str
    store_config_entry_id: str
    category_id: str | None = None
    barcodes: list[str] = field(default_factory=list)


@dataclass
class ShoppingCategory:
    """A category within one shopping list, ordered by physical store layout."""

    id: str
    name: str
    sort_index: int


@dataclass
class TodoItemRecord:
    """A shopping list item, backing a todo.TodoItem."""

    uid: str
    summary: str
    status: str  # "needs_action" | "completed"
    product_id: str | None = None
    category_id: str | None = None
    description: str | None = None
