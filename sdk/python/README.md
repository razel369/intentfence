# IntentFence Python SDK

Install the SDK from this repository:

```bash
git clone https://github.com/razel369/intentfence.git
python -m pip install ./intentfence/sdk/python
```

```python
from intentfence import IntentFenceClient

client = IntentFenceClient()
result = client.run_guarded(
    {
        "subject": "did:web:my-agent",
        "action": {"type": "purchase", "resource": "order-42"},
        "constraints": {"cost_ceiling": 100, "quoted_cost": 79},
    },
    lambda: purchase_order("order-42"),
)

assessment = client.assess_x402(
    {
        "subject": "agent:buyer-07",
        "target_url": "https://merchant.example/api/paid-resource",
        "method": "GET",
        "payment_required": base64_payment_required_from_target,
        "policy": {
            "max_price_usdc": "0.10",
            "allowed_payees": ["0x1111111111111111111111111111111111111111"],
        },
    },
    payment_signature=encoded_x402_payment,
)
```

The standard-library transport covers free calls. For autonomous paid calls,
connect the same endpoint through an x402-capable HTTP client owned by the payer.

The assessment accepts the exact base64 `PAYMENT-REQUIRED` header observed by
the caller, up to 16 KiB. `method` is optional and may be `GET`, `HEAD`, or
`POST`. A `safe_to_proceed` decision requires an explicit matching
`allowed_payees` entry; omitting the allowlist yields `needs_review`.
Every advertised payment option must pass every automatic check; mixed option
sets fail closed. IntentFence never fetches or pays the target. It validates and SHA-256-binds the
supplied challenge, returns assurance `caller-observed-x402-quote-assessment`
with verification tier `x402-quote-assessment+x402-settled`, and settles only
the 0.005 USDC IntentFence assessment fee.
