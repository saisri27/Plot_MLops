"""Shared pytest fixtures for the Plot test suite."""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import MagicMock

import pytest


@pytest.fixture
def make_fake_openai_client():
    """
    Build a MagicMock shaped like `openai.OpenAI()` for unit tests.

    Usage:
        def test_something(make_fake_openai_client):
            client = make_fake_openai_client(
                {"recommendations": [{"name": "Foo", "reason": "..."}]}
            )
            picks, meta = rerank_venues([...], {...}, group_size=2, client=client)

    The returned mock supports:
        client.chat.completions.create(...) -> completion
        completion.choices[0].message.content -> JSON string of `response_json`
        completion.usage.prompt_tokens / completion_tokens -> ints

    Pass `raises=SomeException(...)` to make the call raise instead of return.
    Pass `content_override` to bypass JSON encoding (for malformed-JSON tests).
    """

    def _make(
        response_json: dict[str, Any] | None = None,
        *,
        prompt_tokens: int = 100,
        completion_tokens: int = 50,
        raises: Exception | None = None,
        content_override: str | None = None,
    ) -> MagicMock:
        client = MagicMock()
        if raises is not None:
            client.chat.completions.create.side_effect = raises
            return client

        if content_override is not None:
            content = content_override
        else:
            content = json.dumps(response_json or {"recommendations": []})

        completion = MagicMock()
        message = MagicMock()
        message.content = content
        choice = MagicMock()
        choice.message = message
        completion.choices = [choice]

        usage = MagicMock()
        usage.prompt_tokens = prompt_tokens
        usage.completion_tokens = completion_tokens
        completion.usage = usage

        client.chat.completions.create.return_value = completion
        return client

    return _make
