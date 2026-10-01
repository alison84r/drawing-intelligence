"""Assist configuration: environment first, then the project's .env file. The key is never logged or returned."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


def _env_file() -> dict[str, str]:
    values: dict[str, str] = {}
    try:
        for raw in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            values[key.strip()] = value.strip().strip('"').strip("'")
    except OSError:
        pass
    return values


@dataclass(frozen=True)
class AssistSettings:
    provider: str  # 'off' | 'openrouter'
    model: str
    api_key: str
    reason: str  # why it is off, in plain words

    @property
    def enabled(self) -> bool:
        return self.provider != "off"

    def public(self) -> dict[str, object]:
        """What the screen may know: never the key."""
        return {"enabled": self.enabled, "provider": self.provider, "model": self.model if self.enabled else "", "reason": self.reason,
                "leavesMachine": self.provider == "openrouter"}


def settings() -> AssistSettings:
    file = _env_file()

    def get(name: str) -> str:
        return (os.environ.get(name) or file.get(name) or "").strip()

    provider = get("DI_ASSIST_PROVIDER").lower() or "openrouter"
    key, model = get("OPENROUTER_API_KEY"), get("DI_ASSIST_MODEL")
    if provider == "off":
        return AssistSettings("off", "", "", "Switched off in the configuration")
    if provider != "openrouter":
        return AssistSettings("off", "", "", f"Unknown provider '{provider}'")
    if not key:
        return AssistSettings("off", "", "", "No OpenRouter key in the .env file")
    if not model:
        return AssistSettings("off", "", "", "No model named in the .env file (DI_ASSIST_MODEL)")
    return AssistSettings("openrouter", model, key, "")
