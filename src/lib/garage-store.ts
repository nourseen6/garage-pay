export type CaseBoardStatus =
  | "waiting_client"
  | "needs_diagnosis"
  | "awaiting_deposit"
  | "in_shop"
  | "ready"
  | "collected";

export const STATUS_LABEL: Record<CaseBoardStatus, string> = {
  waiting_client: "في انتظار العميل",
  needs_diagnosis: "محتاج تشخيص",
  awaiting_deposit: "في انتظار العربون",
  in_shop: "في الكراج",
  ready: "جاهزة للاستلام",
  collected: "تم التسليم",
};

export const STATUS_FILTERS: { id: "all" | CaseBoardStatus; label: string }[] = [
  { id: "all", label: "الكل" },
  { id: "waiting_client", label: "انتظار" },
  { id: "needs_diagnosis", label: "تشخيص" },
  { id: "awaiting_deposit", label: "عربون" },
  { id: "in_shop", label: "كراج" },
  { id: "ready", label: "جاهزة" },
  { id: "collected", label: "تم" },
];

export type CaseProgress = {
  clientSubmitted: boolean;
  hasQuote: boolean;
  depositPaid: boolean;
  clientStage: string;
  balancePaid: boolean;
};

export function deriveCaseStatus(progress: CaseProgress): CaseBoardStatus {
  if (progress.balancePaid) return "collected";
  if (progress.clientStage === "ready") return "ready";
  if (progress.depositPaid) return "in_shop";
  if (progress.hasQuote) return "awaiting_deposit";
  if (progress.clientSubmitted) return "needs_diagnosis";
  return "waiting_client";
}

export type BoardCase<TSnapshot = unknown> = {
  id: string;
  clientName: string;
  car: string;
  status: CaseBoardStatus;
  updatedAt: number;
  snapshot: TSnapshot;
};

export type CaseBoard<TSnapshot = unknown> = {
  activeCaseId: string;
  cases: BoardCase<TSnapshot>[];
};

export const BOARD_KEY = "garagepay-board";
export const LEGACY_SNAPSHOT_KEY = "garagepay-demo";
export const BOARD_GENERATION = "e2e-fresh-2026-08-15";
const GENERATION_KEY = "garagepay-board-generation";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function memoryStorage(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

export function getDefaultStorage(): StorageLike {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // Ignore unavailable browser storage (private mode / SSR).
  }
  return memoryStorage();
}

export function emptyBoard<TSnapshot>(): CaseBoard<TSnapshot> {
  return { activeCaseId: "", cases: [] };
}

export function resetPersistedBoard(storage: StorageLike = getDefaultStorage()) {
  storage.removeItem(BOARD_KEY);
  storage.removeItem(LEGACY_SNAPSHOT_KEY);
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(LEGACY_SNAPSHOT_KEY);
    }
  } catch {
    // Ignore unavailable sessionStorage.
  }
}

export function loadBoard<TSnapshot>(storage: StorageLike = getDefaultStorage()): CaseBoard<TSnapshot> {
  try {
    if (storage.getItem(GENERATION_KEY) !== BOARD_GENERATION) {
      resetPersistedBoard(storage);
      storage.setItem(GENERATION_KEY, BOARD_GENERATION);
      return emptyBoard();
    }
  } catch {
    // Fall through to normal load if storage is restricted.
  }

  try {
    const raw = storage.getItem(BOARD_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CaseBoard<TSnapshot>;
      if (Array.isArray(parsed.cases)) return parsed;
    }
  } catch {
    // Fall through to legacy snapshot.
  }

  try {
    const legacy = storage.getItem(LEGACY_SNAPSHOT_KEY)
      ?? (typeof sessionStorage !== "undefined" ? sessionStorage.getItem(LEGACY_SNAPSHOT_KEY) : null);
    if (!legacy) return emptyBoard();
    const snapshot = JSON.parse(legacy) as TSnapshot & {
      clientName?: string;
      carMake?: string;
      carModel?: string;
      carYear?: string;
      caseId?: string;
      clientSubmitted?: boolean;
      selectedRec?: unknown;
      depositPaid?: boolean;
      clientStage?: string;
      balancePaid?: boolean;
    };
    const id = snapshot.caseId || "legacy-case";
    const board: CaseBoard<TSnapshot> = {
      activeCaseId: id,
      cases: [{
        id,
        clientName: snapshot.clientName || "عميل",
        car: `${snapshot.carMake ?? ""} ${snapshot.carModel ?? ""} ${snapshot.carYear ?? ""}`.trim(),
        status: deriveCaseStatus({
          clientSubmitted: Boolean(snapshot.clientSubmitted),
          hasQuote: Boolean(snapshot.selectedRec),
          depositPaid: Boolean(snapshot.depositPaid),
          clientStage: snapshot.clientStage || "intake",
          balancePaid: Boolean(snapshot.balancePaid),
        }),
        updatedAt: Date.now(),
        snapshot: snapshot as TSnapshot,
      }],
    };
    storage.setItem(BOARD_KEY, JSON.stringify(board));
    return board;
  } catch {
    return emptyBoard();
  }
}

export function saveBoard<TSnapshot>(board: CaseBoard<TSnapshot>, storage: StorageLike = getDefaultStorage()) {
  storage.setItem(BOARD_KEY, JSON.stringify(board));
}

export function upsertBoardCase<TSnapshot>(
  board: CaseBoard<TSnapshot>,
  next: BoardCase<TSnapshot>,
): CaseBoard<TSnapshot> {
  const others = board.cases.filter((item) => item.id !== next.id);
  return {
    activeCaseId: next.id,
    cases: [next, ...others].sort((a, b) => b.updatedAt - a.updatedAt),
  };
}

export function filterBoardCases<TSnapshot>(
  cases: BoardCase<TSnapshot>[],
  filter: "all" | CaseBoardStatus,
) {
  if (filter === "all") return cases;
  return cases.filter((item) => item.status === filter);
}

export function karimStageForStatus(status: CaseBoardStatus): "desk" | "diagnose" | "shop" {
  if (status === "needs_diagnosis") return "diagnose";
  if (status === "in_shop" || status === "ready" || status === "collected") return "shop";
  return "desk";
}
