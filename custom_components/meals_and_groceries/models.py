from __future__ import annotations

from dataclasses import dataclass


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
