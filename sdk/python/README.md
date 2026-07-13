# AgentPass Python SDK

```python
from agentpass import AgentPassClient

client = AgentPassClient()
result = client.run_guarded(
    {
        "subject": "did:web:my-agent",
        "action": {"type": "purchase", "resource": "order-42"},
        "constraints": {"cost_ceiling": 100, "quoted_cost": 79},
    },
    lambda: purchase_order("order-42"),
)
```

The standard-library transport covers free calls. For autonomous paid calls,
connect the same endpoint through an x402-capable HTTP client owned by the payer.
