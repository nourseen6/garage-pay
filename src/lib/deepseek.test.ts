import { describe, expect, it } from "vitest";
import { parseAiDiagnoses } from "./deepseek";

describe("DeepSeek diagnosis parser", () => {
  it("turns model JSON into GaragePay recommendations in piasters", () => {
    const recs = parseAiDiagnoses(
      JSON.stringify({
        recommendations: [
          {
            diagnosis: "سير الدينامو",
            partsSummary: "سير + شدّاد",
            typicalPriceEgp: 1250,
            laborHours: 2,
            note: "صفير مع أول تشغيل",
          },
        ],
      }),
      "هيونداي إلنترا 2017",
    );

    expect(recs).toHaveLength(1);
    expect(recs[0]?.diagnosis).toBe("سير الدينامو");
    expect(recs[0]?.typicalPricePiasters).toBe(125_000);
    expect(recs[0]?.car).toBe("هيونداي إلنترا 2017");
  });

  it("reads JSON from a fenced model reply", () => {
    const recs = parseAiDiagnoses(
      "```json\n{\"recommendations\":[{\"diagnosis\":\"طرمبة الباور\",\"typicalPriceEgp\":2200}]}\n```",
      "كيا",
    );
    expect(recs[0]?.diagnosis).toBe("طرمبة الباور");
    expect(recs[0]?.typicalPricePiasters).toBe(220_000);
  });
});
