"""
Unified LLM adapter.

Default provider: AI_PROVIDER env var ("deepseek" | "claude").
Per-call override: pass model_config dict to generate().
"""
import os
from typing import Optional

import anthropic
from openai import AsyncOpenAI


async def generate(
    system: str,
    user: str,
    model_config: Optional[dict] = None,
) -> str:
    if model_config:
        return await _generate_with_config(system, user, model_config)

    provider = os.getenv("AI_PROVIDER", "deepseek")
    if provider == "deepseek":
        return await _deepseek_generate(system, user)
    if provider == "claude":
        return await _claude_generate(system, user)
    raise ValueError(f"Unknown AI_PROVIDER: {provider!r}. Use 'deepseek' or 'claude'.")


async def _generate_with_config(system: str, user: str, cfg: dict) -> str:
    provider = cfg.get("provider", "deepseek")
    if provider == "claude":
        client = anthropic.AsyncAnthropic(api_key=cfg.get("api_key"))
        msg = await client.messages.create(
            model=cfg["model"],
            max_tokens=2000,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return msg.content[0].text
    else:
        # deepseek or any openai-compatible endpoint
        client = AsyncOpenAI(
            api_key=cfg.get("api_key"),
            base_url=cfg.get("base_url", "https://api.deepseek.com"),
        )
        resp = await client.chat.completions.create(
            model=cfg["model"],
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            max_tokens=2000,
        )
        return resp.choices[0].message.content


async def _deepseek_generate(system: str, user: str) -> str:
    client = AsyncOpenAI(
        api_key=os.getenv("DEEPSEEK_API_KEY"),
        base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
    )
    resp = await client.chat.completions.create(
        model=os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        max_tokens=2000,
    )
    return resp.choices[0].message.content


async def _claude_generate(system: str, user: str) -> str:
    client = anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    msg = await client.messages.create(
        model=os.getenv("CLAUDE_MODEL", "claude-sonnet-4-20250514"),
        max_tokens=2000,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return msg.content[0].text
