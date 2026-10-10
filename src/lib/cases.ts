export type WhenHeard = "startup" | "idle" | "driving" | "cranking";
export type SoundType = "squeal" | "rattle" | "knock" | "click" | "hum";

export type SymptomAnswers = {
  whenHeard: WhenHeard | null;
  soundType: SoundType | null;
  changesWithRpm: boolean | null;
  checkEngineLight: boolean | null;
  recentWork: boolean | null;
};

export type PastCase = {
  id: string;
  car: string;
  neighborhood: string;
  answers: SymptomAnswers;
  diagnosis: string;
  partsSummary: string;
  typicalPricePiasters: number;
  laborHours: number;
  note: string;
};

export type DiagnosisRecommendation = {
  caseId: string;
  diagnosis: string;
  partsSummary: string;
  typicalPricePiasters: number;
  laborHours: number;
  note: string;
  matchScore: number;
  matchedSignals: string[];
  car: string;
};

export const SYMPTOM_QUESTIONS = [
  {
    id: "whenHeard",
    label: "الصوت بيظهر امتى؟",
    options: [
      { value: "startup", label: "أول ما أدور" },
      { value: "idle", label: "والعربية واقفة" },
      { value: "driving", label: "وأنا سايق" },
      { value: "cranking", label: "وقت التشغيل / المارش" },
    ],
  },
  {
    id: "soundType",
    label: "الصوت شكله إيه؟",
    options: [
      { value: "squeal", label: "صفير / صرير" },
      { value: "rattle", label: "خبط خفيف / رنة" },
      { value: "knock", label: "خبط تقيل" },
      { value: "click", label: "طقطقة" },
      { value: "hum", label: "طنين مستمر" },
    ],
  },
] as const;

export const YES_NO_QUESTIONS = [
  {
    id: "changesWithRpm",
    label: "الصوت بيتغيّر مع دوسة البنزين؟",
  },
  {
    id: "checkEngineLight",
    label: "لمبة التشيك إنجن ولّاعة؟",
  },
  {
    id: "recentWork",
    label: "اتعمل شغل في الماتور قريب؟",
  },
] as const;

export const PAST_CASES: PastCase[] = [
  {
    id: "case-elentra-belt",
    car: "هيونداي إلنترا ٢٠١٦",
    neighborhood: "شبرا",
    answers: {
      whenHeard: "startup",
      soundType: "squeal",
      changesWithRpm: true,
      checkEngineLight: false,
      recentWork: false,
    },
    diagnosis: "سير الدينامو متشقق",
    partsSummary: "سير دينامو + فحص بكرة الشدّاد",
    typicalPricePiasters: 125_000,
    laborHours: 2,
    note: "صفير عند أول تشغيل ويزيد مع الـ RPM — نفس نمط إلنترا كتير في المنطقة.",
  },
  {
    id: "case-accent-tensioner",
    car: "هيونداي أكسنت ٢٠١٥",
    neighborhood: "روض الفرج",
    answers: {
      whenHeard: "startup",
      soundType: "squeal",
      changesWithRpm: true,
      checkEngineLight: false,
      recentWork: true,
    },
    diagnosis: "بكرة الشدّاد تالفة مع السير",
    partsSummary: "سير + بكرة شدّاد",
    typicalPricePiasters: 185_000,
    laborHours: 3,
    note: "بعد تغيير سير قديم، الشدّاد كان السبب الحقيقي للصفير.",
  },
  {
    id: "case-optra-battery",
    car: "شيفروليه أوبترا ٢٠١٢",
    neighborhood: "الساحل",
    answers: {
      whenHeard: "cranking",
      soundType: "click",
      changesWithRpm: false,
      checkEngineLight: false,
      recentWork: false,
    },
    diagnosis: "بطارية ضعيفة",
    partsSummary: "بطارية ٧٥ أمبير + فحص دينامو",
    typicalPricePiasters: 210_000,
    laborHours: 1,
    note: "طقطقة وقت المارش بدون دوران الماتور غالباً بطارية.",
  },
  {
    id: "case-lancer-starter",
    car: "ميتسوبيشي لانسر ٢٠٠٩",
    neighborhood: "شبرا",
    answers: {
      whenHeard: "cranking",
      soundType: "click",
      changesWithRpm: false,
      checkEngineLight: false,
      recentWork: false,
    },
    diagnosis: "مارش تالف",
    partsSummary: "مارش أصلي / توكيل",
    typicalPricePiasters: 320_000,
    laborHours: 2,
    note: "بطارية سليمة لكن الطقطقة مستمرة — المارش هو الأقرب.",
  },
  {
    id: "case-corolla-pulley",
    car: "تويوتا كورولا ٢٠١٤",
    neighborhood: "شبرا الخيمة",
    answers: {
      whenHeard: "idle",
      soundType: "rattle",
      changesWithRpm: true,
      checkEngineLight: false,
      recentWork: false,
    },
    diagnosis: "بكرة الدينامو مهترئة",
    partsSummary: "بكرة دينامو",
    typicalPricePiasters: 160_000,
    laborHours: 2,
    note: "رنة خفيفة على السلانسيه تزيد مع الدوسة.",
  },
  {
    id: "case-mazda-knock",
    car: "مازدا ٣ ٢٠١١",
    neighborhood: "العباسية",
    answers: {
      whenHeard: "driving",
      soundType: "knock",
      changesWithRpm: true,
      checkEngineLight: true,
      recentWork: false,
    },
    diagnosis: "شمعة / كويل يحتاج فحص",
    partsSummary: "فحص كويلات + شمعات",
    typicalPricePiasters: 145_000,
    laborHours: 2,
    note: "خبط مع لمبة التشيك غالباً احتراق غير منتظم.",
  },
];

function scoreCase(answers: SymptomAnswers, past: PastCase) {
  const matchedSignals: string[] = [];
  let score = 0;

  if (answers.whenHeard && answers.whenHeard === past.answers.whenHeard) {
    score += 3;
    matchedSignals.push("توقيت الصوت");
  }
  if (answers.soundType && answers.soundType === past.answers.soundType) {
    score += 3;
    matchedSignals.push("نوع الصوت");
  }
  if (
    answers.changesWithRpm !== null &&
    answers.changesWithRpm === past.answers.changesWithRpm
  ) {
    score += 2;
    matchedSignals.push("التغيّر مع البنزين");
  }
  if (
    answers.checkEngineLight !== null &&
    answers.checkEngineLight === past.answers.checkEngineLight
  ) {
    score += 1;
    matchedSignals.push("لمبة التشيك");
  }
  if (
    answers.recentWork !== null &&
    answers.recentWork === past.answers.recentWork
  ) {
    score += 1;
    matchedSignals.push("شغل سابق");
  }

  return { score, matchedSignals };
}

export function recommendDiagnoses(
  answers: SymptomAnswers,
  limit = 3,
  cases: PastCase[] = PAST_CASES,
): DiagnosisRecommendation[] {
  return cases.map((past) => {
    const { score, matchedSignals } = scoreCase(answers, past);
    return {
      caseId: past.id,
      diagnosis: past.diagnosis,
      partsSummary: past.partsSummary,
      typicalPricePiasters: past.typicalPricePiasters,
      laborHours: past.laborHours,
      note: past.note,
      matchScore: score,
      matchedSignals,
      car: past.car,
    };
  })
    .filter((item) => item.matchScore >= 3)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);
}

export function fallbackDiagnoses(
  answers: SymptomAnswers,
  limit = 3,
  cases: PastCase[] = PAST_CASES,
): DiagnosisRecommendation[] {
  const matched = recommendDiagnoses(answers, limit, cases);
  if (matched.length > 0) return matched;
  return cases.slice(0, limit).map((past, index) => ({
    caseId: past.id,
    diagnosis: past.diagnosis,
    partsSummary: past.partsSummary,
    typicalPricePiasters: past.typicalPricePiasters,
    laborHours: past.laborHours,
    note: past.note,
    matchScore: Math.max(1, 6 - index),
    matchedSignals: ["حالة محفوظة"],
    car: past.car,
  }));
}

export function addKarimCase(
  cases: PastCase[],
  input: Pick<
    PastCase,
    | "answers"
    | "diagnosis"
    | "partsSummary"
    | "typicalPricePiasters"
    | "laborHours"
  >,
): PastCase[] {
  return [
    ...cases,
    {
      id: `karim-${Date.now()}-${cases.length}`,
      car: "حالة أضافها كريم",
      neighborhood: "كراج كريم",
      note: "تشخيص أضافه كريم بعد مراجعة حالة فعلية.",
      ...input,
    },
  ];
}

export function symptomsComplete(answers: SymptomAnswers) {
  return (
    answers.whenHeard !== null &&
    answers.soundType !== null &&
    answers.changesWithRpm !== null &&
    answers.checkEngineLight !== null &&
    answers.recentWork !== null
  );
}
