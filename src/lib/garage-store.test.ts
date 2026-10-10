import { describe, expect, it } from "vitest";
import {
  deriveCaseStatus,
  filterBoardCases,
  karimStageForStatus,
  loadBoard,
  saveBoard,
  upsertBoardCase,
  type BoardCase,
} from "./garage-store";

describe("Karim case board", () => {
  it("maps progress to a single status Karim can filter", () => {
    expect(deriveCaseStatus({
      clientSubmitted: false,
      hasQuote: false,
      depositPaid: false,
      clientStage: "intake",
      balancePaid: false,
    })).toBe("waiting_client");
    expect(deriveCaseStatus({
      clientSubmitted: true,
      hasQuote: false,
      depositPaid: false,
      clientStage: "intake",
      balancePaid: false,
    })).toBe("needs_diagnosis");
    expect(deriveCaseStatus({
      clientSubmitted: true,
      hasQuote: true,
      depositPaid: false,
      clientStage: "deposit",
      balancePaid: false,
    })).toBe("awaiting_deposit");
    expect(deriveCaseStatus({
      clientSubmitted: true,
      hasQuote: true,
      depositPaid: true,
      clientStage: "deposit",
      balancePaid: false,
    })).toBe("in_shop");
    expect(deriveCaseStatus({
      clientSubmitted: true,
      hasQuote: true,
      depositPaid: true,
      clientStage: "ready",
      balancePaid: false,
    })).toBe("ready");
    expect(deriveCaseStatus({
      clientSubmitted: true,
      hasQuote: true,
      depositPaid: true,
      clientStage: "ready",
      balancePaid: true,
    })).toBe("collected");
  });

  it("filters the board by status", () => {
    const cases: BoardCase[] = [
      { id: "1", clientName: "Ahmed", car: "Elantra", status: "needs_diagnosis", updatedAt: 2, snapshot: {} },
      { id: "2", clientName: "Mona", car: "Sunny", status: "in_shop", updatedAt: 1, snapshot: {} },
    ];
    expect(filterBoardCases(cases, "in_shop").map((item) => item.clientName)).toEqual(["Mona"]);
    expect(filterBoardCases(cases, "all")).toHaveLength(2);
  });

  it("opens the matching Karim stage for a case status", () => {
    expect(karimStageForStatus("needs_diagnosis")).toBe("diagnose");
    expect(karimStageForStatus("in_shop")).toBe("shop");
    expect(karimStageForStatus("waiting_client")).toBe("desk");
  });

  it("persists cases in the provided storage", () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
      removeItem: (key: string) => {
        memory.delete(key);
      },
    };
    const board = upsertBoardCase(loadBoard(storage), {
      id: "case-1",
      clientName: "أحمد السيد",
      car: "هيونداي إلنترا 2017",
      status: "awaiting_deposit",
      updatedAt: 1,
      snapshot: { clientName: "أحمد السيد" },
    });
    saveBoard(board, storage);
    expect(loadBoard(storage).cases[0]?.clientName).toBe("أحمد السيد");
  });
});
