"""
Plot's canonical category taxonomy — the single source of truth.

Until this file existed, the same 11-string list lived in five places:
    llm_intent.ALLOWED_CATEGORIES
    recommendation_bigquery.SEGMENT_TO_CATEGORY (target side)
    demo/demo.html (chip array)
    UI/tokens.js (chip definitions)
    UI/api.js (chip-id translator)

Adding a new category like "Music & Live Shows" required editing all five
in lockstep and missing one was an actual bug. Python files now import
from here. The frontend stays separate (different language) but a small
runtime invariant in `recommendation_bigquery` catches any drift between
its segment mapping and this list.
"""

from __future__ import annotations

from typing import Literal

ALLOWED_CATEGORIES: tuple[str, ...] = (
    "Food & Drink",
    "Outdoors",
    "Entertainment",
    "Arts & Workshops",
    "Nightlife",
    "Sports & Recreation",
    "Wellness & Beauty",
    "Shopping",
    "Pets & Animals",
    "Music & Live Shows",
)

# Same set, as a Pydantic-friendly Literal type. Use this in request models
# (e.g. UserPreference.categories) when you want FastAPI to reject unknown
# categories at validation time rather than silently filtering them later.
Category = Literal[
    "Food & Drink",
    "Outdoors",
    "Entertainment",
    "Arts & Workshops",
    "Nightlife",
    "Sports & Recreation",
    "Wellness & Beauty",
    "Shopping",
    "Pets & Animals",
    "Music & Live Shows",
]

ALLOWED_SET: frozenset[str] = frozenset(ALLOWED_CATEGORIES)


def is_allowed(category: str | None) -> bool:
    """True if the given string is one of the canonical categories."""
    return bool(category) and category in ALLOWED_SET
