"""
Small sample: call Google Places API (New) — Text Search and inspect response shape/types.

Enable "Places API (New)" in Google Cloud Console for your project and ensure billing is active if required.
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any

import requests
from dotenv import load_dotenv

# Project-local .env next to this script
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"

# Restrict results to San Francisco, CA (~8 km radius from city center)
SF_LOCATION_BIAS = {
    "circle": {
        "center": {"latitude": 37.7749, "longitude": -122.4194},
        "radius": 8000.0,
    }
}

# Adjust fields as needed: https://developers.google.com/maps/documentation/places/web-service/text-search
FIELD_MASK = ",".join(
    [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.location",
        "places.types",
        "places.rating",
        "places.userRatingCount",
        "places.businessStatus",
    ]
)


def value_type_label(value: Any) -> str:
    if value is None:
        return "NoneType"
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, dict):
        return "dict"
    if isinstance(value, list):
        return "list"
    return type(value).__name__


def print_type_tree(obj: Any, prefix: str = "", max_list: int = 5) -> None:
    """Pretty-print JSON-like structure with Python types (for exploration)."""
    vt = value_type_label(obj)
    if obj is None or isinstance(obj, (str, int, float, bool)):
        print(f"{prefix}{vt}: {obj!r}")
        return
    if isinstance(obj, list):
        print(f"{prefix}list (len={len(obj)})")
        for i, item in enumerate(obj[:max_list]):
            print(f"{prefix}  [{i}]")
            print_type_tree(item, prefix=prefix + "    ", max_list=max_list)
        if len(obj) > max_list:
            print(f"{prefix}  ... ({len(obj) - max_list} more items)")
        return
    if isinstance(obj, dict):
        print(f"{prefix}dict (keys={len(obj)})")
        for k, v in sorted(obj.items(), key=lambda kv: str(kv[0])):
            kt = value_type_label(k)
            print(f"{prefix}  {kt} {k!r}:")
            print_type_tree(v, prefix=prefix + "    ", max_list=max_list)
        return
    print(f"{prefix}{vt}: {obj!r}")


def exit_with_api_error(resp: requests.Response) -> None:
    """Print a readable error; exit 1 without a requests traceback."""
    try:
        payload = resp.json()
    except json.JSONDecodeError:
        print(resp.status_code, resp.text, file=sys.stderr)
        sys.exit(1)

    err = payload.get("error") or {}
    message = err.get("message", resp.text)
    reason = None
    activation_url = None
    for d in err.get("details") or []:
        if isinstance(d, dict) and d.get("@type") == "type.googleapis.com/google.rpc.ErrorInfo":
            reason = d.get("reason")
            meta = d.get("metadata") or {}
            activation_url = meta.get("activationUrl")
    print(f"API error {resp.status_code}: {message}", file=sys.stderr)
    if reason == "SERVICE_DISABLED" and activation_url:
        print(
            "\nEnable the API for this Cloud project, wait a minute, then retry:\n"
            f"  {activation_url}\n",
            file=sys.stderr,
        )
    elif reason:
        print(f"(reason: {reason})", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    api_key = os.environ.get("GOOGLE_PLACES_API_KEY", "").strip()
    if not api_key:
        print("Set GOOGLE_PLACES_API_KEY in google_places/.env", file=sys.stderr)
        sys.exit(1)

    # Change this query to whatever you want to explore
    text_query = "coffee near University of San Francisco"

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": FIELD_MASK,
    }
    body = {"textQuery": text_query, "locationBias": SF_LOCATION_BIAS}

    resp = requests.post(
        PLACES_TEXT_SEARCH_URL,
        headers=headers,
        json=body,
        timeout=30,
    )

    if not resp.ok:
        exit_with_api_error(resp)

    data: dict[str, Any] = resp.json()

    print("=== Raw JSON (pretty) ===")
    print(json.dumps(data, indent=2, ensure_ascii=False)[:8000])
    if len(json.dumps(data)) > 8000:
        print("\n... (truncated in console; full object used below for type tree)\n")

    print("\n=== Type / shape summary ===")
    print_type_tree(data)

    places = data.get("places")
    if isinstance(places, list) and places:
        print("\n=== First place — field types ===")
        first = places[0]
        if isinstance(first, dict):
            for key in sorted(first.keys()):
                print(f"  {key}: {value_type_label(first[key])}")


if __name__ == "__main__":
    main()
