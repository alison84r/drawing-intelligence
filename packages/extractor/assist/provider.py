"""The one interface every model runtime implements, and the OpenRouter implementation of it."""
from __future__ import annotations

import base64
from typing import Protocol

import httpx

from .config import AssistSettings


class AssistError(Exception):
    """The model could not be reached or did not answer. The message is safe to show."""


class VisionProvider(Protocol):
    name: str
    model: str

    def read(self, image_png: bytes, prompt: str) -> str:
        """Send one image and one instruction; return the model's raw text."""


class OpenRouterProvider:
    name = "openrouter"
    URL = "https://openrouter.ai/api/v1/chat/completions"

    def __init__(self, cfg: AssistSettings, timeout: float = 60.0) -> None:
        self.model = cfg.model
        self._key = cfg.api_key
        self._timeout = timeout

    def read(self, image_png: bytes, prompt: str) -> str:
        body = {
            "model": self.model,
            "temperature": 0,
            "max_tokens": 1200,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": "data:image/png;base64," + base64.b64encode(image_png).decode("ascii")}},
                ],
            }],
        }
        try:
            res = httpx.post(self.URL, json=body, headers={"Authorization": f"Bearer {self._key}", "X-Title": "Drawing Intelligence"}, timeout=self._timeout)
        except httpx.HTTPError as exc:
            raise AssistError("The model service could not be reached") from exc
        if res.status_code in (401, 403):
            raise AssistError("The OpenRouter key was refused")
        if res.status_code == 404:
            raise AssistError(f"OpenRouter does not know the model '{self.model}'")
        if res.status_code == 429:
            raise AssistError("The model service is busy or out of credit; try again shortly")
        if res.status_code >= 400:
            raise AssistError(f"The model service answered with an error ({res.status_code})")
        try:
            return str(res.json()["choices"][0]["message"]["content"] or "")
        except (KeyError, IndexError, ValueError, TypeError) as exc:
            raise AssistError("The model gave an answer that could not be read") from exc


def provider_for(cfg: AssistSettings) -> VisionProvider:
    if cfg.provider == "openrouter":
        return OpenRouterProvider(cfg)
    raise AssistError(cfg.reason or "Assist is switched off")
