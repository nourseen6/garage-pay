import type { SymptomAnswers } from "./cases";

export type DiagnosisReportInput = {
  diagnosis: string;
  partsSummary: string;
  laborHours: number;
  typicalPricePiasters: number;
  answers: SymptomAnswers;
  clientNote: string;
  carLabel: string;
  mileage: string;
  mechanicNote?: string;
};

export type DiagnosisReport = {
  title: string;
  plainExplanation: string;
  whyThisDiagnosis: string;
  whatWeWillDo: string[];
  included: string[];
  notIncluded: string[];
  ifDelayed: string;
  etaDays: number;
  confidenceLabel: string;
  symptomSummary: string;
};

const soundLabel: Record<NonNullable<SymptomAnswers["soundType"]>, string> = {
  squeal: "صفير / صرير",
  rattle: "رنة أو خبط خفيف",
  knock: "خبط تقيل",
  click: "طقطقة",
  hum: "طنين",
};

const whenLabel: Record<NonNullable<SymptomAnswers["whenHeard"]>, string> = {
  startup: "أول التشغيل",
  idle: "والعربية واقفة",
  driving: "أثناء السير",
  cranking: "وقت المارش",
};

function symptomSummary(answers: SymptomAnswers, clientNote: string) {
  const parts = [
    answers.soundType ? soundLabel[answers.soundType] : null,
    answers.whenHeard ? `يظهر ${whenLabel[answers.whenHeard]}` : null,
    answers.changesWithRpm ? "يزيد مع دوسة البنزين" : null,
    answers.checkEngineLight ? "لمبة التشيك إنجن ولّاعة" : null,
    answers.recentWork ? "في شغل سابق على الماتور" : null,
  ].filter(Boolean);

  return [clientNote.trim(), parts.join(" · ")].filter(Boolean).join(" — ");
}

function explanationFor(diagnosis: string) {
  if (diagnosis.includes("سير") || diagnosis.includes("شدّاد")) {
    return {
      plain:
        "السير اللي بيدور على الدينامو والطرمبة بقى ناشف أو متشقق. لما الماتور يلف، السير بيزحلق ويعمل صفير — خاصة أول الصبح أو مع دوسة البنزين.",
      why: "الصوت في الفيديو والاستبيان متوافقين مع حالات سير متكررة على نفس النوع: صفير عند التشغيل ويزيد مع الـ RPM، بدون لمبة تشيك.",
      delay:
        "لو اتأخرت، السير ممكن يقطع فجأة: العربية توقف، الدينامو يبطل يشحن، والطرمبة/التكييف يتأثروا. التصليح يبقى أغلَى وأطول.",
      steps: [
        "فحص السير وبكرة الشدّاد على العربية وهي واقفة",
        "تغيير السير (وبكرة الشدّاد لو لزم)",
        "تجربة صوت الماتور بعد التركيب والتأكد إن الصفير اختفى",
      ],
      included: ["قطع السير حسب الاتفاق", "مصنعية التركيب والفحص", "تجربة صوت بعد الشغل"],
      notIncluded: [
        "بكرة الشدّاد لو اتضح إنها تالفة بعد الفتح (هنبلغك قبل التركيب)",
        "أي عطل تاني مش ظاهر في الفيديو",
      ],
    };
  }

  if (diagnosis.includes("بطارية")) {
    return {
      plain:
        "البطارية ضعيفة ومش بتدي أمبير كفاية للمورّشة. ده بيظهر كطقطقة وقت التشغيل من غير ما الماتور يلف كويس.",
      why: "نمط الاستبيان (طقطقة وقت المارش) مطابق لحالات بطارية سابقة بعد استبعاد مشاكل أبسط ظاهرية.",
      delay: "كل ما البطارية ضعفت أكتر، هتحتاج مساعدة تشغيل أكتر، وممكن المارش يتعب من المحاولات المتكررة.",
      steps: ["قياس جهد البطارية والشحن", "تغيير البطارية بالمقاس المناسب", "فحص سريع لمخرج الدينامو"],
      included: ["بطارية حسب المقاس", "تركيب وفحص شحن أولي"],
      notIncluded: ["دينامو جديد لو طلع فيه عطل بعد القياس", "مارش لو طلع تالف"],
    };
  }

  if (diagnosis.includes("مارش")) {
    return {
      plain:
        "المارش (موتور التشغيل) مش بيلف الماتور صح. بتسمع طقطقة أو محاولة تشغيل ضعيفة حتى لو البطارية سليمة.",
      why: "الاستبيان يشير لوقت المارش مع طقطقة — وده أقرب لمارش بعد استبعاد بطارية ضعيفة في الحالات المشابهة.",
      delay: "المحاولات المتكررة ممكن تضر البطارية أو ترس المارش، والتوقيت العشوائي للتعطل هيضايقك في الطريق.",
      steps: ["فحص تيار التشغيل", "فك وتركيب مارش بديل/أصلي", "تجربة تشغيل متكررة"],
      included: ["مارش حسب الاتفاق", "مصنعية الفك والتركيب"],
      notIncluded: ["بطارية جديدة إن احتجنا بعد القياس", "أسلاك توصيل لو تالفة"],
    };
  }

  return {
    plain: `بناءً على وصفك والفيديو، أقرب تشخيص هو: ${diagnosis}. هنوضح السبب والشغل المتوقع قبل أي عربون.`,
    why: "الإجابات والوسائط اتقارنت بحالات سابقة مشابهة في الكراج، مع مراجعة كريم النهائية.",
    delay: "تأجيل الإصلاح ممكن يخلّي العطل يوسّع أو يزوّد تكلفة القطع لو الحالة ساءت.",
    steps: [
      "فحص عربيتك في الكراج لتأكيد التشخيص عن بُعد",
      `تنفيذ: ${diagnosis}`,
      "تجربة نهائية قبل التسليم",
    ],
    included: [diagnosis, "مصنعية حسب الساعات المتفق عليها", "تحديثات حالة على واتساب"],
    notIncluded: ["قطع إضافية تظهر بعد الفتح", "أي شغل خارج نطاق العرض ده"],
  };
}

export function buildDiagnosisReport(input: DiagnosisReportInput): DiagnosisReport {
  const pack = explanationFor(input.diagnosis);
  const etaDays = Math.max(1, Math.ceil(input.laborHours / 2));

  return {
    title: input.diagnosis,
    plainExplanation: input.mechanicNote?.trim() || pack.plain,
    whyThisDiagnosis: pack.why,
    whatWeWillDo: pack.steps,
    included: pack.included,
    notIncluded: pack.notIncluded,
    ifDelayed: pack.delay,
    etaDays,
    confidenceLabel: "تشخيص عن بُعد — يتأكد بعد دخول العربية",
    symptomSummary: symptomSummary(input.answers, input.clientNote),
  };
}
