# Paymob integration rules

GaragePay uses the official [Paymob AI Integration Skill](https://github.com/PaymobAccept/Paymob-AI-Integration-Skill/tree/main/skills/paymob-integration) as the source of truth.

- Create payments only with `POST /v1/intention/`; do not use the legacy three-step flow.
- Amounts are piasters. Create every payment server-side using `Authorization: Token <secret>`.
- The SHA-512, timing-safe, HMAC-verified webhook is the only source of truth for payment status. Persist Paymob `obj.id` uniquely for idempotency.
- Never expose Paymob Secret/API/HMAC credentials. The Public Key is the only frontend-safe credential.
- On ambiguous financial writes, use Transaction Inquiry before any retry.
- Cross-check live Paymob documentation for current endpoint details and webhook fields.
