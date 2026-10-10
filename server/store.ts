export type JobKind = "deposit" | "balance";
export type JobStatus =
  | "created"
  | "deposit_pending"
  | "deposit_paid"
  | "balance_pending"
  | "balance_paid";

export type JobRecord = {
  id: string;
  kind: JobKind;
  status: JobStatus;
  customerName: string;
  phone: string;
  car: string;
  depositPiasters: number;
  balancePiasters: number;
  paymobIntentionId?: string;
  paymobSpecialReference?: string;
  paymobObjIds: string[];
};

type StoreFile = {
  jobs: Record<string, JobRecord>;
  events: Record<string, string>;
  references: Record<string, string>;
};

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

function getStorePath() {
  return process.env.GARAGEPAY_STORE_PATH
    ?? join(dirname(fileURLToPath(import.meta.url)), "data", "store.json");
}

function emptyStore(): StoreFile {
  return { jobs: {}, events: {}, references: {} };
}

function readStore(): StoreFile {
  try {
    const data = JSON.parse(readFileSync(getStorePath(), "utf8")) as Partial<StoreFile>;
    return {
      jobs: data.jobs ?? {},
      events: data.events ?? {},
      references: data.references ?? {},
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(store: StoreFile) {
  const storePath = getStorePath();
  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(storePath, JSON.stringify(store, null, 2));
}

export function upsertJob(input: {
  id?: string;
  kind?: JobKind;
  customerName: string;
  phone: string;
  car: string;
  depositPiasters: number;
  balancePiasters?: number;
}): JobRecord {
  const store = readStore();
  const id = input.id || randomUUID();
  const existing = store.jobs[id];
  const job: JobRecord = {
    id,
    kind: input.kind ?? existing?.kind ?? "deposit",
    status: existing?.status ?? "created",
    customerName: input.customerName,
    phone: input.phone,
    car: input.car,
    depositPiasters: input.depositPiasters || existing?.depositPiasters || 0,
    balancePiasters: input.balancePiasters ?? existing?.balancePiasters ?? 0,
    paymobIntentionId: existing?.paymobIntentionId,
    paymobSpecialReference: existing?.paymobSpecialReference,
    paymobObjIds: existing?.paymobObjIds ?? [],
  };
  store.jobs[id] = job;
  writeStore(store);
  return job;
}

export function getJob(id: string) {
  return readStore().jobs[id] ?? null;
}

export function makePaymentReference(jobId: string, kind: JobKind) {
  return `${jobId}:${kind}:${randomUUID()}`;
}

export function jobIdFromPaymentReference(ref: string) {
  const [jobId, kind] = ref.split(":");
  if (kind === "deposit" || kind === "balance") return jobId;
  return ref;
}

export function kindFromPaymentReference(ref: string): JobKind | null {
  const parts = ref.split(":");
  if (parts[1] === "deposit" || parts[1] === "balance") return parts[1];
  return null;
}

export function registerPaymentReference(jobId: string, specialReference: string) {
  const store = readStore();
  store.references[specialReference] = jobId;
  const job = store.jobs[jobId];
  if (job) job.paymobSpecialReference = specialReference;
  writeStore(store);
  return specialReference;
}

export function setJobPending(id: string, kind: JobKind, intentionId: string) {
  const store = readStore();
  const job = store.jobs[id];
  if (!job) return null;
  job.status = kind === "deposit" ? "deposit_pending" : "balance_pending";
  job.paymobIntentionId = intentionId;
  writeStore(store);
  return job;
}

export function setJobBalanceDue(id: string, balancePiasters: number) {
  const store = readStore();
  const job = store.jobs[id];
  if (!job) return null;
  job.balancePiasters = balancePiasters;
  writeStore(store);
  return job;
}

/** Idempotent paid transition keyed by Paymob obj.id. Returns duplicate=true if already processed. */
export function recordSuccessfulPayment(input: {
  objId: string;
  merchantOrderId: string;
}): { ok: true; duplicate: boolean; job: JobRecord | null } {
  const store = readStore();
  if (store.events[input.objId]) {
    return { ok: true, duplicate: true, job: store.jobs[store.events[input.objId]] ?? null };
  }
  const jobId = store.references[input.merchantOrderId]
    ?? jobIdFromPaymentReference(input.merchantOrderId);
  const job = store.jobs[jobId];
  if (!job) {
    return { ok: true, duplicate: false, job: null };
  }
  store.events[input.objId] = job.id;
  job.paymobObjIds = [...new Set([...job.paymobObjIds, input.objId])];
  const kind = kindFromPaymentReference(input.merchantOrderId) ?? job.kind;
  job.status = kind === "balance" ? "balance_paid" : "deposit_paid";
  writeStore(store);
  return { ok: true, duplicate: false, job };
}
