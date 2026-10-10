import type { DiagnosisRecommendation, SymptomAnswers } from "./cases";

const WHEN: Record<string, string> = {
  startup: "أول ما يدير العربية",
  idle: "والعربية واقفة",
  driving: "وهو سايق",
  cranking: "وقت التشغيل / المارش",
};

const SOUND: Record<string, string> = {
  squeal: "صفير / صرير",
  rattle: "خبط خفيف / رنة",
  knock: "خبط تقيل",
  click: "طقطقة",
  hum: "طنين مستمر",
};

export function buildDiagnosisPrompt(input: {
  car: string;
  mileage: string;
  freeText: string;
  answers: SymptomAnswers;
}) {
  return [
    "اقترح 3 تشخيصات محتملة لكراج في مصر (شبرا) بناءً على وصف العميل.",
    "خلّي كل تشخيص مختلف عن التاني، ومتغيّر شوية في كل مرة، بس مربوط بالأعراض.",
    "الأسعار بالجنيه المصري لشغل كراج شعبي/متوسط.",
    `العربية: ${input.car || "غير محدد"}`,
    `العداد: ${input.mileage || "غير معروف"} كم`,
    `وصف العميل: ${input.freeText || "مفيش وصف"}`,
    `الصوت بيظهر: ${input.answers.whenHeard ? WHEN[input.answers.whenHeard] : "مش محدد"}`,
    `شكل الصوت: ${input.answers.soundType ? SOUND[input.answers.soundType] : "مش محدد"}`,
    `بيتغيّر مع البنزين: ${yesNo(input.answers.changesWithRpm)}`,
    `لمبة التشيك: ${yesNo(input.answers.checkEngineLight)}`,
    `شغل قريب في الماتور: ${yesNo(input.answers.recentWork)}`,
    "لا تستخدم صور أو فيديو. الأعراض النصية فقط.",
    'رجّع JSON فقط بالشكل: {"recommendations":[{"diagnosis":"...","partsSummary":"...","typicalPriceEgp":1200,"laborHours":2,"note":"..."}]}',
  ].join("\n");
}

function yesNo(value: boolean | null) {
  if (value === true) return "أيوه";
  if (value === false) return "لأ";
  return "مش محدد";
}

export function parseAiDiagnoses(raw: string, carLabel: string): DiagnosisRecommendation[] {
  const parsed = extractJson(raw) as { recommendations?: unknown[] } | unknown[];
  const items = Array.isArray(parsed) ? parsed : parsed.recommendations ?? [];
  return items.slice(0, 3).flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const rec = item as Record<string, unknown>;
    const diagnosis = String(rec.diagnosis ?? "").trim();
    if (!diagnosis) return [];
    const egp = Number(rec.typicalPriceEgp ?? rec.priceEgp ?? 0);
    const piasters = Number.isFinite(egp) && egp > 0
      ? Math.round(egp * 100)
      : Number(rec.typicalPricePiasters) || 125_000;
    return [{
      caseId: `deepseek-${index + 1}-${diagnosis.slice(0, 12)}`,
      diagnosis,
      partsSummary: String(rec.partsSummary ?? rec.parts ?? "فحص حسب التشخيص"),
      typicalPricePiasters: Math.max(100, piasters),
      laborHours: Math.max(1, Number(rec.laborHours) || 2),
      note: String(rec.note ?? "اقتراح من المساعد"),
      matchScore: Math.max(4, 9 - index),
      matchedSignals: ["DeepSeek", "أعراض العميل"],
      car: carLabel,
    }];
  });
}

function extractJson(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = (fenced?.[1] ?? raw).trim();
  const objectStart = text.indexOf("{");
  const arrayStart = text.indexOf("[");
  const start = objectStart === -1
    ? arrayStart
    : arrayStart === -1
      ? objectStart
      : Math.min(objectStart, arrayStart);
  if (start < 0) throw new Error("DeepSeek returned no JSON");
  const end = text[start] === "[" ? text.lastIndexOf("]") : text.lastIndexOf("}");
  return JSON.parse(text.slice(start, end + 1));
}

export async function recommendWithDeepSeek(
  input: {
    car: string;
    mileage: string;
    freeText: string;
    answers: SymptomAnswers;
  },
  env: { apiKey: string; model?: string } = { apiKey: process.env.DEEPSEEK_API_KEY ?? "" },
) {
  if (!env.apiKey) throw new Error("DEEPSEEK_API_KEY is missing");

  const models = env.model ? [env.model] : ["deepseek-v4-flash", "deepseek-chat"];
  let lastError = "DeepSeek request failed";

  for (const model of models) {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.95,
        messages: [
          {
            role: "system",
            content: "أنت ميكانيكي كراج مصري خبير. جاوب JSON فقط بدون شرح.",
          },
          { role: "user", content: buildDiagnosisPrompt(input) },
        ],
      }),
    });
    const body = await response.text();
    if (!response.ok) {
      lastError = `DeepSeek ${model} failed (${response.status})`;
      continue;
    }
    const data = JSON.parse(body) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? "";
    const recs = parseAiDiagnoses(content, input.car);
    if (recs.length > 0) return recs;
    lastError = "DeepSeek returned no diagnoses";
  }

  throw new Error(lastError);
}
