from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Callable, TypeVar
from urllib.error import HTTPError
from urllib.request import Request, urlopen

T = TypeVar("T")


@dataclass
class AgentPassError(RuntimeError):
    message: str
    status: int | None = None
    body: dict[str, Any] | None = None

    def __str__(self) -> str:
        return self.message


class AgentPassClient:
    def __init__(
        self,
        base_url: str = "https://agentpass-protocol.rmalka06.chatgpt.site",
        opener: Callable[..., Any] = urlopen,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.opener = opener

    def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        request = Request(
            f"{self.base_url}{path}",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with self.opener(request, timeout=30) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            try:
                body = json.loads(error.read().decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError):
                body = None
            raise AgentPassError(
                f"AgentPass returned HTTP {error.code}.",
                status=error.code,
                body=body,
            ) from error

    def preflight(self, payload: dict[str, Any], *, paid: bool = False) -> dict[str, Any]:
        path = "/api/preflight/verified" if paid else "/api/preflight"
        return self._post(path, payload)

    def verify_receipt(self, jws: str) -> dict[str, Any]:
        return self._post("/api/receipts/verify", {"jws": jws})

    def run_guarded(
        self,
        payload: dict[str, Any],
        tool_call: Callable[[], T],
        *,
        paid: bool = False,
        block_on_review: bool = True,
    ) -> T:
        decision = self.preflight(payload, paid=paid)
        if decision.get("status") == "denied" or (
            block_on_review and decision.get("status") == "needs_review"
        ):
            raise AgentPassError(f"AgentPass blocked the tool call: {decision.get('status')}.", body=decision)
        return tool_call()


__all__ = ["AgentPassClient", "AgentPassError"]
