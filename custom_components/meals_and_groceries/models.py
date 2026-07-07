from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Product:
    """A product master record, shared across all shopping lists."""

    id: str
    name: str
    store_subentry_id: str
    category_id: str | None = None
    barcodes: list[str] = field(default_factory=list)
    group_ids: list[str] = field(default_factory=list)


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


@dataclass
class Dish:
    """A dish or restaurant that can be referenced from the weekly meal plan."""

    id: str
    name: str
    kind: str  # "dish" | "restaurant"
    notes: str | None = None
    ingredients: list[str] = field(default_factory=list)  # Product ids


@dataclass
class Group:
    """A global, store-independent product group (e.g. "Lebensmittel")."""

    id: str
    name: str
    sort_index: int


@dataclass
class Tab:
    """A configured extra daily-use panel tab, showing an ordered set of groups."""

    id: str
    name: str
    sort_index: int
    group_ids: list[str] = field(default_factory=list)  # ordered


@dataclass
class MealPlanDay:
    """One weekday slot of the weekly meal plan."""

    weekday_index: int  # 0=Monday .. 6=Sunday
    dish_id: str | None = None
    free_text: str | None = None
