import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getJob,
  jobIdFromPaymentReference,
  makePaymentReference,
  recordSuccessfulPayment,
  registerPaymentReference,
  setJobPending,
  upsertJob,
} from "./store.ts";

const dirs: string[] = [];

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), "garagepay-store-"));
  dirs.push(dir);
  process.env.GARAGEPAY_STORE_PATH = join(dir, "store.json");
});

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  delete process.env.GARAGEPAY_STORE_PATH;
});

describe("job payment store", () => {
  it("keeps a provided job id and does not wipe the deposit on a later balance upsert", () => {
    const first = upsertJob({
      id: "job-fixed",
      customerName: "Ahmed",
      phone: "01001234567",
      car: "Elantra",
      depositPiasters: 50000,
    });
    expect(first.id).toBe("job-fixed");

    const second = upsertJob({
      id: "job-fixed",
      customerName: "Ahmed",
      phone: "01001234567",
      car: "Elantra",
      depositPiasters: 0,
      balancePiasters: 75000,
    });
    expect(second.id).toBe("job-fixed");
    expect(second.depositPiasters).toBe(50000);
    expect(second.balancePiasters).toBe(75000);
  });

  it("uses a unique Paymob special_reference per deposit and balance attempt", () => {
    const deposit = makePaymentReference("job-fixed", "deposit");
    const balance = makePaymentReference("job-fixed", "balance");
    const depositRetry = makePaymentReference("job-fixed", "deposit");

    expect(deposit).not.toBe(balance);
    expect(deposit).not.toBe(depositRetry);
    expect(jobIdFromPaymentReference(deposit)).toBe("job-fixed");
    expect(jobIdFromPaymentReference(balance)).toBe("job-fixed");
  });

  it("marks deposit then balance paid when Paymob refs are unique per attempt", () => {
    upsertJob({
      id: "job-fixed",
      customerName: "Ahmed",
      phone: "01001234567",
      car: "Elantra",
      depositPiasters: 50000,
    });
    setJobPending("job-fixed", "deposit", "int_1");
    registerPaymentReference("job-fixed", "job-fixed:deposit:attempt-1");

    const deposit = recordSuccessfulPayment({
      objId: "txn-dep",
      merchantOrderId: "job-fixed:deposit:attempt-1",
    });
    expect(deposit.job?.id).toBe("job-fixed");
    expect(deposit.job?.status).toBe("deposit_paid");

    setJobPending("job-fixed", "balance", "int_2");
    registerPaymentReference("job-fixed", "job-fixed:balance:attempt-1");
    const balance = recordSuccessfulPayment({
      objId: "txn-bal",
      merchantOrderId: "job-fixed:balance:attempt-1",
    });
    expect(balance.job?.id).toBe("job-fixed");
    expect(balance.job?.status).toBe("balance_paid");
  });

  it("treats a months-later balance as its own job and marks balance_paid", () => {
    const deposit = upsertJob({
      id: "job-deposit",
      kind: "deposit",
      customerName: "Ahmed",
      phone: "01001234567",
      car: "Elantra",
      depositPiasters: 50000,
    });
    setJobPending(deposit.id, "deposit", "int_1");
    registerPaymentReference(deposit.id, `${deposit.id}:deposit:attempt-1`);
    recordSuccessfulPayment({
      objId: "txn-dep",
      merchantOrderId: `${deposit.id}:deposit:attempt-1`,
    });

    const balance = upsertJob({
      id: "job-balance",
      kind: "balance",
      customerName: "Ahmed",
      phone: "01001234567",
      car: "Elantra",
      depositPiasters: 0,
      balancePiasters: 75000,
    });
    expect(balance.id).not.toBe(deposit.id);
    registerPaymentReference(balance.id, `${balance.id}:balance:attempt-1`);

    const paid = recordSuccessfulPayment({
      objId: "txn-bal",
      merchantOrderId: `${balance.id}:balance:attempt-1`,
    });
    expect(paid.job?.id).toBe("job-balance");
    expect(paid.job?.status).toBe("balance_paid");
    expect(getJob("job-deposit")?.status).toBe("deposit_paid");
  });

  it("marks a job paid once per Paymob obj.id", () => {
    upsertJob({
      id: "job-paid",
      customerName: "Ahmed",
      phone: "01001234567",
      car: "Elantra",
      depositPiasters: 50000,
    });
    setJobPending("job-paid", "deposit", "int_1");

    const first = recordSuccessfulPayment({ objId: "txn-1", merchantOrderId: "job-paid" });
    const duplicate = recordSuccessfulPayment({ objId: "txn-1", merchantOrderId: "job-paid" });

    expect(first.duplicate).toBe(false);
    expect(first.job?.status).toBe("deposit_paid");
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.job?.status).toBe("deposit_paid");
  });
});
