export type PaymentKind = "deposit" | "balance";

export type PaymentStartResponse = {
  jobId: string;
  checkoutUrl: string;
};

export type JobStatusResponse = {
  id: string;
  status: string;
};

export async function createPayment(
  kind: PaymentKind,
  body: {
    jobId?: string;
    amountPiasters: number;
    customerName: string;
    phone: string;
    car: string;
    balancePiasters?: number;
  },
): Promise<PaymentStartResponse> {
  const response = await fetch(`/api/payments/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as PaymentStartResponse & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "تعذر إنشاء الدفع");
  }
  return data;
}

export async function fetchJob(jobId: string, inquire = false): Promise<JobStatusResponse> {
  const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}${inquire ? "?inquire=1" : ""}`);
  const data = (await response.json()) as JobStatusResponse & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "job not found");
  }
  return data;
}
