import "dotenv/config";
import express from "express";
import cors from "cors";
import {
  checkoutUrl,
  createIntention,
  inquireByMerchantOrderId,
  isValidTransactionHmac,
  type TransactionObject,
} from "../src/lib/paymob.ts";
import { fallbackDiagnoses, type SymptomAnswers } from "../src/lib/cases.ts";
import { recommendWithDeepSeek } from "../src/lib/deepseek.ts";
import {
  getJob,
  makePaymentReference,
  recordSuccessfulPayment,
  registerPaymentReference,
  setJobBalanceDue,
  setJobPending,
  upsertJob,
} from "./store.ts";

const PORT = Number(process.env.PORT ?? 3001);
let appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
const frontendUrl = (process.env.FRONTEND_URL ?? "http://127.0.0.1:5173").replace(/\/$/, "");
const baseUrl = (process.env.PAYMOB_BASE_URL ?? "https://accept.paymob.com").replace(/\/$/, "");
const secretKey = process.env.PAYMOB_SECRET_KEY ?? "";
const publicKey = process.env.PAYMOB_PUBLIC_KEY ?? "";
const hmacSecret = process.env.PAYMOB_HMAC_SECRET ?? "";
const apiKey = process.env.PAYMOB_API_KEY ?? "";
const cardIntegrationId = Number(process.env.PAYMOB_INTEGRATION_ID_CARD ?? 0);

const app = express();
app.use(cors());
app.use(express.json());

app.post("/internal/app-url", (req, res) => {
  const url = String(req.body?.url ?? "").replace(/\/$/, "");
  if (!url.startsWith("https://")) {
    return res.status(400).json({ error: "https APP_URL required" });
  }
  appUrl = url;
  res.json({ appUrl });
});

function splitName(full: string) {
  const parts = full.trim().split(/\s+/);
  return { firstName: parts[0] || "Client", lastName: parts.slice(1).join(" ") || "GaragePay" };
}

function phoneForPaymob(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("20")) return `+${digits}`;
  if (digits.startsWith("0")) return `+2${digits}`;
  return `+20${digits}`;
}

function paymobEnv() {
  if (!secretKey || !publicKey || !cardIntegrationId) {
    throw new Error("Paymob sandbox env is incomplete");
  }
  if (!appUrl) {
    throw new Error("APP_URL is not ready yet — wait for ngrok in npm start");
  }
  return { baseUrl, secretKey };
}

async function startPayment(
  kind: "deposit" | "balance",
  body: {
    jobId?: string;
    amountPiasters: number;
    customerName: string;
    phone: string;
    car: string;
    balancePiasters?: number;
  },
) {
  const job = upsertJob({
    kind,
    customerName: body.customerName,
    phone: body.phone,
    car: body.car,
    depositPiasters: kind === "deposit" ? body.amountPiasters : 0,
    balancePiasters: kind === "balance" ? body.amountPiasters : body.balancePiasters,
  });
  if (kind === "balance") setJobBalanceDue(job.id, body.amountPiasters);

  const { firstName, lastName } = splitName(body.customerName);
  const itemName = kind === "deposit" ? "GaragePay deposit" : "GaragePay balance";
  const specialReference = makePaymentReference(job.id, kind);
  registerPaymentReference(job.id, specialReference);
  const { id: intentionId, clientSecret } = await createIntention(
    {
      amountPiasters: body.amountPiasters,
      currency: "EGP",
      paymentMethods: [cardIntegrationId],
      specialReference,
      customer: {
        firstName,
        lastName,
        email: "garagepay@example.com",
        phone: phoneForPaymob(body.phone),
      },
      items: [{ name: itemName, amount: body.amountPiasters, quantity: 1, description: job.car }],
      extras: {
        kind,
        ...(body.jobId ? { repair_case_id: body.jobId } : {}),
      },
      notificationUrl: `${appUrl}/api/paymob/webhook`,
      redirectionUrl: `${appUrl}/api/paymob/return?job=${encodeURIComponent(job.id)}&kind=${kind}`,
    },
    paymobEnv(),
  );

  setJobPending(job.id, kind, intentionId);
  return {
    jobId: job.id,
    checkoutUrl: checkoutUrl(baseUrl, publicKey, clientSecret),
  };
}

app.post("/api/payments/deposit", async (req, res) => {
  try {
    const amountPiasters = Number(req.body?.amountPiasters);
    if (!Number.isFinite(amountPiasters) || amountPiasters < 100) {
      return res.status(400).json({ error: "amountPiasters required" });
    }
    const result = await startPayment("deposit", {
      jobId: req.body?.jobId,
      amountPiasters,
      customerName: String(req.body?.customerName ?? "Client"),
      phone: String(req.body?.phone ?? "01000000000"),
      car: String(req.body?.car ?? "car"),
      balancePiasters: Number(req.body?.balancePiasters ?? 0),
    });
    res.json(result);
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "deposit failed" });
  }
});

app.post("/api/payments/balance", async (req, res) => {
  try {
    const amountPiasters = Number(req.body?.amountPiasters);
    if (!Number.isFinite(amountPiasters) || amountPiasters < 100) {
      return res.status(400).json({ error: "amountPiasters required" });
    }
    const result = await startPayment("balance", {
      jobId: req.body?.jobId,
      amountPiasters,
      customerName: String(req.body?.customerName ?? "Client"),
      phone: String(req.body?.phone ?? "01000000000"),
      car: String(req.body?.car ?? "car"),
    });
    res.json(result);
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "balance failed" });
  }
});

app.post("/api/paymob/webhook", async (req, res) => {
  const obj = req.body?.obj as TransactionObject | undefined;
  const hmac = String(req.query.hmac ?? "");
  if (!obj || !isValidTransactionHmac(obj, hmacSecret, hmac)) {
    return res.status(401).json({ error: "Invalid HMAC" });
  }
  if (obj.success === true && obj.pending === false) {
    const merchantOrderId = String(obj.order?.merchant_order_id ?? "");
    recordSuccessfulPayment({
      objId: String(obj.id),
      merchantOrderId,
    });
  }
  res.status(200).json({ received: true });
});

app.get("/api/paymob/return", (req, res) => {
  const job = String(req.query.job ?? "");
  const kind = String(req.query.kind ?? "deposit");
  res.redirect(`${frontendUrl}/?paymob=return&job=${encodeURIComponent(job)}&kind=${encodeURIComponent(kind)}`);
});

app.get("/api/jobs/:id", async (req, res) => {
  const job = getJob(String(req.params.id));
  if (!job) return res.status(404).json({ error: "job not found" });

  if (
    (job.status === "deposit_pending" || job.status === "balance_pending") &&
    apiKey &&
    req.query.inquire === "1"
  ) {
    try {
      await inquireByMerchantOrderId(job.paymobSpecialReference ?? job.id, { baseUrl, apiKey });
    } catch {
      // Inquiry is a fallback; webhook remains source of truth.
    }
  }

  res.json(job);
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, appUrl: appUrl || null });
});

app.post("/api/diagnose", async (req, res) => {
  const answers = (req.body?.answers ?? {}) as SymptomAnswers;
  const car = String(req.body?.car ?? "");
  const mileage = String(req.body?.mileage ?? "");
  const freeText = String(req.body?.freeText ?? "");
  const fallback = fallbackDiagnoses(answers, 3);
  // Media stays on-device for Karim. Never send photos/video to DeepSeek.
  try {
    const recommendations = await recommendWithDeepSeek({ car, mileage, freeText, answers });
    if (recommendations.length > 0) {
      return res.json({ recommendations, source: "deepseek" });
    }
    res.json({ recommendations: fallback, source: "cases" });
  } catch (error) {
    res.json({
      recommendations: fallback,
      source: "cases",
      error: error instanceof Error ? error.message : "DeepSeek failed",
    });
  }
});

app.listen(PORT, () => {
  console.log(`GaragePay API http://127.0.0.1:${PORT}`);
});
