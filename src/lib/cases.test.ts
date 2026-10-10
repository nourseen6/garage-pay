import { describe, expect, it } from "vitest";
import {
  addKarimCase,
  fallbackDiagnoses,
  PAST_CASES,
  recommendDiagnoses,
  type SymptomAnswers,
} from "./cases";

describe("case-based diagnosis recommendations", () => {
  it("ranks past cases that share the same symptom pattern", () => {
    const answers: SymptomAnswers = {
      whenHeard: "startup",
      soundType: "squeal",
      changesWithRpm: true,
      checkEngineLight: false,
      recentWork: false,
    };

    const recommendations = recommendDiagnoses(answers);

    expect(recommendations[0].diagnosis).toBe("سير الدينامو متشقق");
    expect(recommendations[0].matchScore).toBeGreaterThan(
      recommendations[1].matchScore,
    );
    expect(recommendations.every((item) => item.caseId)).toBe(true);
  });

  it("suggests battery or starter patterns for cranking issues", () => {
    const recommendations = recommendDiagnoses({
      whenHeard: "cranking",
      soundType: "click",
      changesWithRpm: false,
      checkEngineLight: false,
      recentWork: false,
    });

    expect(recommendations[0].diagnosis).toMatch(/بطارية|مارش/);
  });

  it("always returns hardcoded cases when nothing matches", () => {
    expect(
      fallbackDiagnoses({
        whenHeard: null,
        soundType: null,
        changesWithRpm: null,
        checkEngineLight: null,
        recentWork: null,
      }).length,
    ).toBeGreaterThan(0);
    expect(fallbackDiagnoses({
      whenHeard: null,
      soundType: null,
      changesWithRpm: null,
      checkEngineLight: null,
      recentWork: null,
    })[0]?.diagnosis).toBeTruthy();
  });

  it("learns Karim's manual diagnosis as a new case for future matching", () => {
    const answers: SymptomAnswers = {
      whenHeard: "startup",
      soundType: "hum",
      changesWithRpm: true,
      checkEngineLight: false,
      recentWork: false,
    };
    const learnedCases = addKarimCase(PAST_CASES, {
      answers,
      diagnosis: "طرمبة الباور تحتاج فحص",
      partsSummary: "فحص طرمبة الباور والزيت",
      typicalPricePiasters: 95_000,
      laborHours: 2,
    });

    expect(recommendDiagnoses(answers, 3, learnedCases)[0].diagnosis).toBe(
      "طرمبة الباور تحتاج فحص",
    );
  });
});
