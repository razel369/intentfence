from __future__ import annotations

import json
import hashlib
from dataclasses import dataclass
from typing import Any, Callable, Literal, Mapping, TypeVar, TypedDict, cast
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

T = TypeVar("T")


class _X402AssessmentPolicyOptional(TypedDict, total=False):
    allowed_payees: list[str]


class X402AssessmentPolicy(_X402AssessmentPolicyOptional):
    max_price_usdc: str


class _X402AssessmentInputOptional(TypedDict, total=False):
    method: Literal["GET", "HEAD", "POST"]


class X402AssessmentInput(_X402AssessmentInputOptional):
    subject: str
    target_url: str
    payment_required: str
    policy: X402AssessmentPolicy


class X402AcceptedPaymentExtra(TypedDict):
    name: str | None
    version: str | None
    asset_transfer_method: str | None
    keys: list[str]


class X402AcceptedPayment(TypedDict):
    scheme: str
    network: str
    amount: str
    asset: str
    pay_to: str
    max_timeout_seconds: int
    extra: X402AcceptedPaymentExtra


class X402AssessmentTarget(TypedDict):
    origin: str
    pathname: str
    has_query: bool
    method: Literal["GET", "HEAD", "POST"]
    url_sha256: str


class X402AssessmentObserved(TypedDict):
    challenge_source: Literal["caller-supplied-payment-required"]
    x402_version: Literal[2]
    payment_requirements_sha256: str
    accepts: list[X402AcceptedPayment]


class X402AssessmentReceipt(TypedDict):
    id: str
    issued_at: str
    subject: str
    action: dict[str, str]
    signed: Literal[True]
    assurance: Literal["caller-observed-x402-quote-assessment"]
    expires_at: str
    payment_assurance: Literal["x402-settled"]
    payment_network: str
    payment_asset: str
    payment_amount_atomic: str
    pay_to: str
    signature: dict[str, str]
    note: str


class X402AssessmentDecision(TypedDict):
    intentfence: Literal["0.6"]
    request_id: str
    status: Literal["safe_to_proceed", "needs_review", "denied"]
    assessed_at: str
    verification_tier: Literal["x402-quote-assessment+x402-settled"]
    target: X402AssessmentTarget
    observed: X402AssessmentObserved
    checks: list[dict[str, str]]
    receipt: X402AssessmentReceipt


class WalletRiskDecision(TypedDict):
    intentfence: Literal["0.7"]
    request_id: str
    status: Literal["safe_to_proceed", "needs_review", "denied"]
    risk_level: Literal["low", "medium", "critical"]
    risk_score: int
    assessed_at: str
    verification_tier: Literal["live-base-wallet-risk+x402-settled"]
    subject: dict[str, str]
    observed: dict[str, Any]
    checks: list[dict[str, str]]
    receipt: dict[str, Any]


class UsCpiDecision(TypedDict):
    intentfence: Literal["0.8"]
    request_id: str
    status: Literal["verified"]
    source: dict[str, Any]
    period: dict[str, str]
    cpi: dict[str, float]
    summary: str
    checks: list[dict[str, str]]
    receipt: dict[str, Any]


class PolicyPackDecision(TypedDict):
    intentfence: Literal["policy-pack-1.0"]
    pack_id: str
    project_name: str
    runtime: Literal["cloudflare-agents", "coinbase-agentkit", "mcp-gateway"]
    generated_at: str
    verification_tier: Literal["production-policy-pack+x402-settled"]
    decision: dict[str, Any]
    integration: dict[str, Any]
    tests: dict[str, Any]
    deployment_checklist: list[str]


@dataclass
class IntentFenceError(RuntimeError):
    message: str
    status: int | None = None
    body: dict[str, Any] | None = None

    def __str__(self) -> str:
        return self.message


class IntentFenceClient:
    def __init__(
        self,
        base_url: str = "https://agentpass-protocol.rmalka06.chatgpt.site",
        opener: Callable[..., Any] = urlopen,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.opener = opener

    def _post(
        self,
        path: str,
        payload: Mapping[str, Any],
        *,
        payment_signature: str | None = None,
    ) -> dict[str, Any]:
        headers = {"Content-Type": "application/json"}
        if payment_signature:
            headers["PAYMENT-SIGNATURE"] = payment_signature
        request = Request(
            f"{self.base_url}{path}",
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
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
            raise IntentFenceError(
                f"IntentFence returned HTTP {error.code}.",
                status=error.code,
                body=body,
            ) from error

    def _get(
        self,
        path: str,
        query: Mapping[str, str],
        *,
        payment_signature: str | None = None,
    ) -> dict[str, Any]:
        headers = {}
        if payment_signature:
            headers["PAYMENT-SIGNATURE"] = payment_signature
        request = Request(
            f"{self.base_url}{path}?{urlencode(query)}",
            headers=headers,
            method="GET",
        )
        try:
            with self.opener(request, timeout=30) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            try:
                body = json.loads(error.read().decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError):
                body = None
            raise IntentFenceError(
                f"IntentFence returned HTTP {error.code}.",
                status=error.code,
                body=body,
            ) from error

    def preflight(self, payload: dict[str, Any], *, paid: bool = False) -> dict[str, Any]:
        path = "/api/preflight/verified" if paid else "/api/preflight"
        return self._post(path, payload)

    def verify_receipt(self, jws: str) -> dict[str, Any]:
        return self._post("/api/receipts/verify", {"jws": jws})

    def authorize_action(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._post("/api/actions/authorize", payload)

    def scan_agent_risk(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._post("/api/agent-risk/scan", payload)

    def assess_x402(
        self,
        payload: X402AssessmentInput,
        *,
        payment_signature: str | None = None,
    ) -> X402AssessmentDecision:
        return cast(
            X402AssessmentDecision,
            self._post(
                "/api/x402-assessments",
                payload,
                payment_signature=payment_signature,
            ),
        )

    def create_policy_pack(
        self,
        payload: Mapping[str, Any],
        *,
        payment_signature: str | None = None,
    ) -> PolicyPackDecision:
        return cast(
            PolicyPackDecision,
            self._post(
                "/api/policy-packs",
                payload,
                payment_signature=payment_signature,
            ),
        )

    def assess_wallet_risk(
        self,
        address: str,
        *,
        payment_signature: str | None = None,
    ) -> WalletRiskDecision:
        return cast(
            WalletRiskDecision,
            self._get(
                "/api/wallet-risk",
                {"address": address},
                payment_signature=payment_signature,
            ),
        )

    def get_us_cpi(
        self,
        month: str | None = None,
        *,
        payment_signature: str | None = None,
    ) -> UsCpiDecision:
        return cast(
            UsCpiDecision,
            self._get(
                "/api/us-cpi",
                {"month": month} if month else {},
                payment_signature=payment_signature,
            ),
        )

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
            raise IntentFenceError(
                f"IntentFence blocked the tool call: {decision.get('status')}.",
                body=decision,
            )
        return tool_call()

    def run_authorized(
        self,
        payload: dict[str, Any],
        tool_call: Callable[[], T],
    ) -> T:
        """Verify an action-bound receipt and fail closed before execution."""
        decision = self.authorize_action(payload)
        receipt = decision.get("receipt")
        if decision.get("status") != "safe_to_proceed" or not isinstance(receipt, dict):
            raise IntentFenceError(
                f"IntentFence blocked the tool call: {decision.get('status')}.",
                body=decision,
            )
        action = payload.get("action")
        canonical = json.dumps(
            action,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode("utf-8")
        action_digest = hashlib.sha256(canonical).hexdigest()
        signature = receipt.get("signature")
        jws = signature.get("jws") if isinstance(signature, dict) else None
        if (
            action_digest != decision.get("action_digest")
            or action_digest != receipt.get("action_digest")
            or not isinstance(jws, str)
        ):
            raise IntentFenceError("IntentFence action binding failed; tool call blocked.", body=decision)
        verified = self.verify_receipt(jws)
        claims = verified.get("claims")
        evidence = claims.get("evidence") if isinstance(claims, dict) else None
        if (
            verified.get("valid") is not True
            or not isinstance(claims, dict)
            or not isinstance(evidence, dict)
            or claims.get("decision") != "safe_to_proceed"
            or claims.get("assurance") != "action-bound-policy-authorization"
            or evidence.get("action_digest") != action_digest
        ):
            raise IntentFenceError("IntentFence receipt verification failed; tool call blocked.", body=decision)
        return tool_call()


__all__ = [
    "IntentFenceClient",
    "IntentFenceError",
    "PolicyPackDecision",
    "UsCpiDecision",
    "X402AcceptedPayment",
    "X402AcceptedPaymentExtra",
    "X402AssessmentDecision",
    "X402AssessmentInput",
    "X402AssessmentObserved",
    "X402AssessmentPolicy",
    "X402AssessmentReceipt",
    "X402AssessmentTarget",
    "WalletRiskDecision",
]
