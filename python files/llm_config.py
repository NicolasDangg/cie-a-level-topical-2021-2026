"""OpenRouter settings for the extraction pipeline.

Values come from the environment, or from a git-ignored .env file at the repo
root (see .env.example). Real environment variables win over .env.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"


@dataclass(frozen=True)
class LLMConfig:
    api_key: str
    model: str
    base_url: str


def _read_dotenv(path: Path) -> dict[str, str]:
    values = {}
    if not path.is_file():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip("'\"")
    return values


def load_config() -> LLMConfig:
    dotenv = _read_dotenv(ROOT / ".env")

    def get(name: str) -> str:
        return (os.environ.get(name) or dotenv.get(name) or "").strip()

    missing = [name for name in ("OPENROUTER_API_KEY", "OPENROUTER_MODEL") if not get(name)]
    if missing:
        raise SystemExit(
            f"Missing {', '.join(missing)}. Set them in the environment or in .env "
            "(copy .env.example)."
        )
    return LLMConfig(
        api_key=get("OPENROUTER_API_KEY"),
        model=get("OPENROUTER_MODEL"),
        base_url=get("OPENROUTER_BASE_URL") or DEFAULT_BASE_URL,
    )
