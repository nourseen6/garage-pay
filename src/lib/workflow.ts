export type JobStatus =
  | "contacted"
  | "awaiting_media"
  | "media_received"
  | "quoted"
  | "counter_pending"
  | "agreed"
  | "tentative_invoiced"
  | "deposit_pending"
  | "deposit_paid"
  | "car_received"
  | "in_progress"
  | "waiting_parts"
  | "awaiting_overage_approval"
  | "ready"
  | "final_invoiced"
  | "balance_pending"
  | "balance_paid"
  | "collected"
  | "cancelled";

const transitions: Partial<Record<JobStatus, readonly JobStatus[]>> = {
  contacted: ["awaiting_media"],
  awaiting_media: ["media_received", "cancelled"],
  media_received: ["quoted"],
  quoted: ["agreed", "counter_pending", "cancelled"],
  counter_pending: ["agreed", "quoted", "cancelled"],
  agreed: ["tentative_invoiced"],
  tentative_invoiced: ["deposit_pending"],
  deposit_pending: ["deposit_paid", "cancelled"],
  deposit_paid: ["car_received"],
  car_received: ["in_progress"],
  in_progress: ["waiting_parts", "awaiting_overage_approval", "ready"],
  waiting_parts: ["in_progress", "awaiting_overage_approval", "ready"],
  awaiting_overage_approval: ["in_progress", "cancelled"],
  ready: ["final_invoiced"],
  final_invoiced: ["balance_pending"],
  balance_pending: ["balance_paid"],
  balance_paid: ["collected"],
};

export function canMoveTo(from: JobStatus, to: JobStatus) {
  return transitions[from]?.includes(to) ?? false;
}

export function createTentativeInvoice(agreedTotalPiasters: number) {
  return {
    tentativeTotalPiasters: agreedTotalPiasters,
    depositDuePiasters: Math.round(agreedTotalPiasters * 0.4),
  };
}

export function needsOverageApproval(
  tentativeTotalPiasters: number,
  finalTotalPiasters: number,
) {
  return finalTotalPiasters - tentativeTotalPiasters > tentativeTotalPiasters * 0.15;
}

export function calculateBalance(
  finalTotalPiasters: number,
  paidDepositPiasters: number,
) {
  return Math.max(0, finalTotalPiasters - paidDepositPiasters);
}
