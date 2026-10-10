import { describe, expect, it } from "vitest";
import { buildDiagnosisReport } from "./report";
import type { SymptomAnswers } from "./cases";

describe("client diagnosis report", () => {
  it("explains the issue in plain language before payment", () => {
    const answers: SymptomAnswers = {
      whenHeard: "startup",
      soundType: "squeal",
      changesWithRpm: true,
      checkEngineLight: false,
      recentWork: false,
    };

    const report = buildDiagnosisReport({
      diagnosis: "سير الدينامو متشقق",
      partsSummary: "سير دينامو + فحص بكرة الشدّاد",
      laborHours: 2,
      typicalPricePiasters: 125_000,
      answers,
      clientNote: "صوت صفير أول ما أدور، خصوصاً الصبح.",
      carLabel: "هيونداي إلنترا ٢٠١٧",
      mileage: "148000",
    });

    expect(report.title).toContain("سير الدينامو");
    expect(report.plainExplanation.length).toBeGreaterThan(40);
    expect(report.whyThisDiagnosis.length).toBeGreaterThan(20);
    expect(report.whatWeWillDo.length).toBeGreaterThan(0);
    expect(report.included.length).toBeGreaterThan(0);
    expect(report.notIncluded.length).toBeGreaterThan(0);
    expect(report.ifDelayed.length).toBeGreaterThan(10);
    expect(report.etaDays).toBeGreaterThan(0);
  });
});
