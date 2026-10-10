# GaragePay

Hackathon prototype for a remote-diagnosis garage in Shubra, Egypt (EGP). A driver sends symptoms and media, the mechanic quotes the job, and the customer pays a **40% deposit** then the **remaining balance** as two separate Paymob sandbox checkouts.

The product UI is Arabic and right-to-left. Two roles share one screen: **Karim** (the desk) and the **customer** (the driver).

## What you can demo

The desk opens with a ledger of Shubra jobs, not an empty form. A visitor can:

1. Open the desk and see mixed statuses immediately (waiting, diagnosis, deposit, in the shop, ready, collected).
2. Click any case and land in that stage.
3. Walk a live job: WhatsApp invite → symptoms and real file uploads → diagnosis → quote → **40% deposit** → shop updates → **balance on a new Paymob order**.

Deposit and balance are months apart in the story, so they are always **different Paymob orders**.

## Stack

| Piece | Where |
|---|---|
| UI | Vite + React, RTL, IBM Plex Sans Arabic |
| API | Express on port `3001` |
| Payments | Paymob Intention API (`POST /v1/intention/`) |
| Webhook tunnel | ngrok, started by `npm start` |
| Diagnosis | DeepSeek (text only), with saved cases as fallback |
| Case board | Browser `localStorage` |
| Payment jobs | `server/data/store.json` (not committed) |

## Run

You need Node.js 20+ and a Paymob **test** account.

```bash
cp .env.example .env
npm install
npm start
```

Fill `.env` from the table below, then start. One command runs the API, the UI, and an HTTPS tunnel for the Paymob webhook. It prints:

```text
UI:      http://127.0.0.1:5173
Webhook: https://xxxx.ngrok-free.app/api/paymob/webhook
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). For a clean ledger after a previous demo: [http://127.0.0.1:5173/?fresh=1](http://127.0.0.1:5173/?fresh=1).

`APP_URL` is set in memory by `npm start`. You do not paste the ngrok URL, and you do not run ngrok in a second terminal.

| Command | What it does |
|---|---|
| `npm start` | API + Vite + ngrok |
| `npm test` | Vitest |
| `npm run build` | Typecheck and production build |
| `npm run dev` | Vite only (payments will not complete) |
| `npm run dev:api` | Express only |

## Environment

Copy `.env.example` to `.env`. Never commit `.env`.

| Variable | Purpose |
|---|---|
| `PAYMOB_BASE_URL` | `https://accept.paymob.com` |
| `PAYMOB_SECRET_KEY` | Server only. Intention auth |
| `PAYMOB_PUBLIC_KEY` | `pk_*`. The only Paymob key the browser may see |
| `PAYMOB_HMAC_SECRET` | Webhook verification |
| `PAYMOB_API_KEY` | Transaction inquiry fallback |
| `PAYMOB_INTEGRATION_ID_CARD` | Numeric **Test** card integration id |
| `NGROK_AUTHTOKEN` | Required so `npm start` can open the webhook tunnel |
| `DEEPSEEK_API_KEY` | Server only. Text diagnosis |
| `PORT` | API port, default `3001` |
| `FRONTEND_URL` | Default `http://127.0.0.1:5173` |

If the first Intention returns **404**, the card integration id does not match this account or mode. In the Paymob dashboard: **Test** → **Settings → Payment Integrations** → Card row → copy the numeric id into `PAYMOB_INTEGRATION_ID_CARD`, then run `npm start` again.

### Sandbox cards

These are Paymob test cards. They do not move real money.

| Brand | Number |
|---|---|
| Mastercard | `5123456789012346` |
| Visa | `4111111111111111` |

Name `Test Account`, expiry `01/39`, CVV `123`.

## How a payment becomes “paid”

Paid is true only after the transaction webhook passes a SHA-512 HMAC check. The browser redirect is not payment proof.

```text
Browser  →  POST /api/payments/deposit|balance
Express  →  Paymob POST /v1/intention/
Browser  →  Unified Checkout (public key only)
Paymob   →  POST /api/paymob/webhook   (ngrok)
Express  →  verify HMAC, store Paymob obj.id once
Browser  →  polls GET /api/jobs/:id until deposit_paid or balance_paid
```

Each pay click creates a new job id and a new `special_reference`. Deposit and balance never share a merchant order id.

## Diagnosis

DeepSeek sees **text only**: symptom answers, free text, mileage, and the car. Photos and video stay in the browser so Karim can preview them. They are never sent to the model.

While the request is in flight the desk shows a loading state. Saved workshop cases appear only if DeepSeek fails or returns nothing.

## Project map

```text
scripts/start.mjs     API + ngrok + Vite
server/index.ts       payments, webhook, diagnose, health
server/store.ts       jobs, webhook idempotency, references
src/App.tsx           both roles and every screen
src/lib/paymob.ts     Intention client, checkout URL, HMAC
src/lib/payments.ts   browser calls to the API
src/lib/cases.ts      symptoms and saved diagnoses
src/lib/deepseek.ts   prompt and JSON parse
src/lib/garage-store.ts   ledger in localStorage
src/lib/workflow.ts   40% deposit, overage, balance
src/lib/report.ts     Arabic report shown to the driver
src/lib/media.ts      real uploads; videos are not persisted
```

`HANDOFF.txt` is the longer working note for anyone changing payments, diagnosis, or the desk.

## Reset a local demo

1. Stop `npm start`.
2. Delete `server/data/store.json`.
3. Start again.
4. Hard-refresh `http://127.0.0.1:5173/?fresh=1`.

## Paymob rules this repo follows

Integration follows the [Paymob AI Integration Skill](https://github.com/PaymobAccept/Paymob-AI-Integration-Skill/tree/main/skills/paymob-integration).

- Create payments with `POST /v1/intention/` only.
- Authorize with `Authorization: Token <secret>`, never `Bearer`.
- Amounts are piasters. 100 EGP is `10000`.
- Secret key, API key, and HMAC secret stay on the server.
- Duplicate webhooks are ignored using Paymob `obj.id`.
