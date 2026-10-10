import { useEffect, useMemo, useRef, useState } from "react";
import {
  addKarimCase,
  PAST_CASES,
  fallbackDiagnoses,
  symptomsComplete,
  SYMPTOM_QUESTIONS,
  YES_NO_QUESTIONS,
  type DiagnosisRecommendation,
  type PastCase,
  type SoundType,
  type SymptomAnswers,
  type WhenHeard,
} from "./lib/cases";
import { createPayment, fetchJob, type PaymentKind } from "./lib/payments";
import {
  deriveCaseStatus,
  filterBoardCases,
  karimStageForStatus,
  loadBoard,
  resetPersistedBoard,
  saveBoard,
  STATUS_FILTERS,
  STATUS_LABEL,
  upsertBoardCase,
  type BoardCase,
  type CaseBoardStatus,
} from "./lib/garage-store";
import { isMediaComplete, persistableMedia, previewFromFile, type ClientMedia } from "./lib/media";
import {
  calculateBalance,
  createTentativeInvoice,
  needsOverageApproval,
} from "./lib/workflow";
import { buildDiagnosisReport } from "./lib/report";

type Role = "karim" | "client";
type KarimStage = "desk" | "diagnose" | "shop";
type ClientStage = "intake" | "symptoms" | "media" | "quote" | "deposit" | "ready";

const emptyAnswers: SymptomAnswers = {
  whenHeard: null,
  soundType: null,
  changesWithRpm: null,
  checkEngineLight: null,
  recentWork: null,
};

type DemoSnapshot = {
  caseId: string;
  role: Role;
  karimStage: KarimStage;
  clientStage: ClientStage;
  inviteSent: boolean;
  clientSubmitted: boolean;
  clientName: string;
  clientPhone: string;
  carMake: string;
  carModel: string;
  carYear: string;
  mileage: string;
  freeText: string;
  answers: SymptomAnswers;
  videoMedia: ClientMedia | null;
  engineMedia: ClientMedia | null;
  odometerMedia: ClientMedia | null;
  selectedRec: DiagnosisRecommendation | null;
  learnedCases: PastCase[];
  customDiagnosis: string;
  customPrice: string;
  counter: boolean;
  counterApproved: boolean | null;
  depositPaid: boolean;
  finalTotal: number;
  balancePaid: boolean;
  clientFacingNote: string;
  jobId: string;
  awaitingPayment: PaymentKind | null;
};

function loadSnapshot(): DemoSnapshot | null {
  const board = loadBoard<DemoSnapshot>();
  const active = board.cases.find((item) => item.id === board.activeCaseId) ?? board.cases[0];
  return active?.snapshot ?? null;
}

function blankSnapshot(caseId: string): DemoSnapshot {
  return {
    caseId,
    role: "karim",
    karimStage: "desk",
    clientStage: "intake",
    inviteSent: false,
    clientSubmitted: false,
    clientName: "",
    clientPhone: "",
    carMake: "",
    carModel: "",
    carYear: "",
    mileage: "",
    freeText: "",
    answers: emptyAnswers,
    videoMedia: null,
    engineMedia: null,
    odometerMedia: null,
    selectedRec: null,
    learnedCases: PAST_CASES,
    customDiagnosis: "",
    customPrice: "1250",
    counter: false,
    counterApproved: null,
    depositPaid: false,
    finalTotal: 125_000,
    balancePaid: false,
    clientFacingNote: "",
    jobId: "",
    awaitingPayment: null,
  };
}

const formatMoney = (piasters: number) =>
  new Intl.NumberFormat("ar-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  }).format(piasters / 100);

function App() {
  const [role, setRole] = useState<Role>("karim");
  const [karimStage, setKarimStage] = useState<KarimStage>("desk");
  const [clientStage, setClientStage] = useState<ClientStage>("intake");
  const [inviteSent, setInviteSent] = useState(false);
  const [clientSubmitted, setClientSubmitted] = useState(false);

  const [clientName, setClientName] = useState("أحمد السيد");
  const [clientPhone, setClientPhone] = useState("01001234567");
  const [carMake, setCarMake] = useState("هيونداي");
  const [carModel, setCarModel] = useState("إلنترا");
  const [carYear, setCarYear] = useState("2017");
  const [mileage, setMileage] = useState("148000");
  const [freeText, setFreeText] = useState("صوت صفير أول ما أدور، خصوصاً الصبح.");

  const [answers, setAnswers] = useState<SymptomAnswers>(emptyAnswers);
  const [videoMedia, setVideoMedia] = useState<ClientMedia | null>(null);
  const [engineMedia, setEngineMedia] = useState<ClientMedia | null>(null);
  const [odometerMedia, setOdometerMedia] = useState<ClientMedia | null>(null);
  const [selectedRec, setSelectedRec] = useState<DiagnosisRecommendation | null>(null);
  const [learnedCases, setLearnedCases] = useState(PAST_CASES);
  const [customDiagnosis, setCustomDiagnosis] = useState("");
  const [customPrice, setCustomPrice] = useState("1250");
  const [counter, setCounter] = useState(false);
  const [counterApproved, setCounterApproved] = useState<boolean | null>(null);
  const [depositPaid, setDepositPaid] = useState(false);
  const [finalTotal, setFinalTotal] = useState(125_000);
  const [balancePaid, setBalancePaid] = useState(false);
  const [clientFacingNote, setClientFacingNote] = useState("");
  const [jobId, setJobId] = useState("");
  const [caseId, setCaseId] = useState("");
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");
  const [awaitingWebhook, setAwaitingWebhook] = useState<PaymentKind | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [boardCases, setBoardCases] = useState<BoardCase<DemoSnapshot>[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | CaseBoardStatus>("all");
  const skipPersist = useRef(true);
  const [aiRecommendations, setAiRecommendations] = useState<DiagnosisRecommendation[] | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnoseError, setDiagnoseError] = useState("");

  const caseRecommendations = useMemo(
    () => fallbackDiagnoses(answers, 3, learnedCases),
    [answers, learnedCases],
  );
  const recommendations = diagnosing
    ? []
    : aiRecommendations && aiRecommendations.length > 0
      ? aiRecommendations
      : caseRecommendations;

  const report = useMemo(() => {
    if (!selectedRec) return null;
    return buildDiagnosisReport({
      diagnosis: selectedRec.diagnosis,
      partsSummary: selectedRec.partsSummary,
      laborHours: selectedRec.laborHours,
      typicalPricePiasters: selectedRec.typicalPricePiasters,
      answers,
      clientNote: freeText,
      carLabel: `${carMake} ${carModel} ${carYear}`,
      mileage,
      mechanicNote: clientFacingNote,
    });
  }, [selectedRec, answers, freeText, carMake, carModel, carYear, mileage, clientFacingNote]);

  const quoteTotal = selectedRec?.typicalPricePiasters ?? 125_000;
  const agreedTotal = counterApproved ? Math.round(quoteTotal * 0.94) : quoteTotal;
  const invoice = createTentativeInvoice(agreedTotal);
  const balance = calculateBalance(finalTotal, invoice.depositDuePiasters);
  const overage = needsOverageApproval(agreedTotal, finalTotal);
  const mediaComplete = isMediaComplete(engineMedia, odometerMedia, videoMedia);
  const checklistDone = symptomsComplete(answers);
  const intakeDone =
    clientName.trim() &&
    clientPhone.trim() &&
    carMake.trim() &&
    carModel.trim() &&
    carYear.trim() &&
    mileage.trim() &&
    freeText.trim();

  function currentSnapshot(overrides: Partial<DemoSnapshot> = {}): DemoSnapshot {
    return {
      caseId,
      role,
      karimStage,
      clientStage,
      inviteSent,
      clientSubmitted,
      clientName,
      clientPhone,
      carMake,
      carModel,
      carYear,
      mileage,
      freeText,
      answers,
      videoMedia: persistableMedia(videoMedia, "video"),
      engineMedia: persistableMedia(engineMedia, "image"),
      odometerMedia: persistableMedia(odometerMedia, "image"),
      selectedRec,
      learnedCases,
      customDiagnosis,
      customPrice,
      counter,
      counterApproved,
      depositPaid,
      finalTotal,
      balancePaid,
      clientFacingNote,
      jobId,
      awaitingPayment: awaitingWebhook,
      ...overrides,
    };
  }

  function applySnapshot(snap: DemoSnapshot) {
    setRole(snap.role);
    setKarimStage(snap.karimStage);
    setClientStage(snap.clientStage);
    setInviteSent(snap.inviteSent);
    setClientSubmitted(snap.clientSubmitted);
    setClientName(snap.clientName);
    setClientPhone(snap.clientPhone);
    setCarMake(snap.carMake);
    setCarModel(snap.carModel);
    setCarYear(snap.carYear);
    setMileage(snap.mileage);
    setFreeText(snap.freeText);
    setAnswers(snap.answers);
    setVideoMedia(snap.videoMedia ?? null);
    setEngineMedia(snap.engineMedia ?? null);
    setOdometerMedia(snap.odometerMedia ?? null);
    setSelectedRec(snap.selectedRec);
    setLearnedCases(snap.learnedCases);
    setCustomDiagnosis(snap.customDiagnosis);
    setCustomPrice(snap.customPrice);
    setCounter(snap.counter);
    setCounterApproved(snap.counterApproved);
    setDepositPaid(snap.depositPaid);
    setFinalTotal(snap.finalTotal);
    setBalancePaid(snap.balancePaid);
    setClientFacingNote(snap.clientFacingNote);
    setJobId(snap.jobId);
    setCaseId(snap.caseId || crypto.randomUUID());
    setAwaitingWebhook(snap.awaitingPayment);
  }

  function persistNow(overrides: Partial<DemoSnapshot> = {}) {
    const snap = currentSnapshot(overrides);
    const id = snap.caseId || crypto.randomUUID();
    snap.caseId = id;
    if (!caseId) setCaseId(id);
    if (!snap.clientName.trim() && !snap.inviteSent && !snap.clientSubmitted) {
      return snap;
    }
    const next = upsertBoardCase(loadBoard<DemoSnapshot>(), {
      id,
      clientName: snap.clientName.trim() || "عميل جديد",
      car: `${snap.carMake} ${snap.carModel} ${snap.carYear}`.trim() || "عربيه",
      status: deriveCaseStatus({
        clientSubmitted: snap.clientSubmitted,
        hasQuote: Boolean(snap.selectedRec),
        depositPaid: snap.depositPaid,
        clientStage: snap.clientStage,
        balancePaid: snap.balancePaid,
      }),
      updatedAt: Date.now(),
      snapshot: snap,
    });
    saveBoard(next);
    setBoardCases(next.cases);
    return snap;
  }

  function patchSnapshot(overrides: Partial<DemoSnapshot>) {
    persistNow(overrides);
  }

  function startNewCase() {
    persistNow();
    const next = blankSnapshot(crypto.randomUUID());
    applySnapshot(next);
    setKarimStage("desk");
    setRole("karim");
    setPayError("");
    setPaying(false);
  }

  function openDiagnose() {
    if (karimStage !== "diagnose") {
      setAiRecommendations(null);
      setDiagnoseError("");
      setDiagnosing(true);
    }
    setKarimStage("diagnose");
  }

  async function pollUntilPaid(id: string, kind: PaymentKind) {
    setAwaitingWebhook(kind);
    setPayError("");
    for (let attempt = 0; attempt < 45; attempt += 1) {
      try {
        const job = await fetchJob(id, attempt >= 8);
        if (kind === "deposit" && job.status === "deposit_paid") {
          setDepositPaid(true);
          setAwaitingWebhook(null);
          setRole("karim");
          setKarimStage("shop");
          patchSnapshot({
            depositPaid: true,
            awaitingPayment: null,
            role: "karim",
            karimStage: "shop",
            jobId: id,
          });
          return;
        }
        if (kind === "balance" && job.status === "balance_paid") {
          setBalancePaid(true);
          setAwaitingWebhook(null);
          patchSnapshot({
            balancePaid: true,
            awaitingPayment: null,
            jobId: id,
          });
          return;
        }
      } catch {
        // Keep polling; webhook is the source of truth.
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    setAwaitingWebhook(null);
    setPayError("لم يصل تأكيد الدفع من Paymob بعد. استنى شوية أو حاول تاني.");
  }

  async function startPay(kind: PaymentKind) {
    setPaying(true);
    setPayError("");
    try {
      const result = await createPayment(kind, {
        amountPiasters: kind === "deposit" ? invoice.depositDuePiasters : balance,
        customerName: clientName,
        phone: clientPhone,
        car: `${carMake} ${carModel} ${carYear}`,
        balancePiasters: kind === "deposit"
          ? invoice.tentativeTotalPiasters - invoice.depositDuePiasters
          : undefined,
      });
      setJobId(result.jobId);
      persistNow({
        jobId: result.jobId,
        awaitingPayment: kind,
        role: "client",
        clientStage: kind === "deposit" ? "deposit" : "ready",
      });
      window.location.assign(result.checkoutUrl);
    } catch (error) {
      setPaying(false);
      setPayError(error instanceof Error ? error.message : "فشل إنشاء الدفع");
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("fresh")) {
      resetPersistedBoard();
      window.history.replaceState({}, "", "/");
    }
    const board = loadBoard<DemoSnapshot>();
    setBoardCases(board.cases);
    const snap = loadSnapshot();
    if (snap) applySnapshot(snap);
    else setCaseId(crypto.randomUUID());
    setHydrated(true);
    const returnedJob = params.get("job") || snap?.jobId || "";
    const kind: PaymentKind = params.get("kind") === "balance" || snap?.awaitingPayment === "balance"
      ? "balance"
      : "deposit";
    const shouldPoll = params.get("paymob") === "return" || Boolean(snap?.awaitingPayment);

    if (params.get("paymob") === "return") {
      window.history.replaceState({}, "", "/");
    }

    if (shouldPoll && returnedJob) {
      setJobId(returnedJob);
      setRole("client");
      setClientStage(kind === "deposit" ? "deposit" : "ready");
      void pollUntilPaid(returnedJob, kind);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (skipPersist.current) {
      skipPersist.current = false;
      return;
    }
    persistNow();
  }, [
    hydrated,
    role,
    karimStage,
    clientStage,
    inviteSent,
    clientSubmitted,
    clientName,
    clientPhone,
    carMake,
    carModel,
    carYear,
    mileage,
    freeText,
    answers,
    videoMedia,
    engineMedia,
    odometerMedia,
    selectedRec,
    customDiagnosis,
    customPrice,
    counter,
    counterApproved,
    depositPaid,
    finalTotal,
    balancePaid,
    clientFacingNote,
    jobId,
    caseId,
    awaitingWebhook,
  ]);

  useEffect(() => {
    if (role !== "karim" || karimStage !== "diagnose") return;
    const controller = new AbortController();
    let cancelled = false;
    setDiagnosing(true);
    setAiRecommendations(null);
    setDiagnoseError("");
    void fetch("/api/diagnose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        answers,
        freeText,
        mileage,
        car: `${carMake} ${carModel} ${carYear}`.trim(),
      }),
    })
      .then(async (response) => {
        if (cancelled) return;
        const data = (await response.json()) as {
          recommendations?: DiagnosisRecommendation[];
          source?: string;
          error?: string;
        };
        if (data.source === "deepseek" && data.recommendations?.length) {
          setAiRecommendations(data.recommendations);
          setDiagnoseError("");
          return;
        }
        setAiRecommendations(null);
        setDiagnoseError("المساعد مش متاح — عرضنا التشخيصات المحفوظة.");
      })
      .catch((error: { name?: string }) => {
        if (cancelled || error.name === "AbortError") return;
        setAiRecommendations(null);
        setDiagnoseError("المساعد مش متاح — عرضنا التشخيصات المحفوظة.");
      })
      .finally(() => {
        if (!cancelled) setDiagnosing(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [role, karimStage, answers, freeText, mileage, carMake, carModel, carYear]);

  const visibleCases = filterBoardCases(boardCases, statusFilter);
  const activeStatus = deriveCaseStatus({
    clientSubmitted,
    hasQuote: Boolean(selectedRec),
    depositPaid,
    clientStage,
    balancePaid,
  });

  const pageTitle =
    role === "karim"
      ? karimStage === "desk"
        ? "مكتب كريم"
        : karimStage === "diagnose"
          ? "تشخيص"
          : "الكراج"
      : clientStage === "intake"
        ? "بيانات العربية"
        : clientStage === "symptoms"
          ? "الاستبيان"
          : clientStage === "media"
            ? "الفيديو والصور"
            : clientStage === "quote"
              ? "تقرير كريم"
              : clientStage === "deposit"
                ? "العربون"
                : "جاهزة للاستلام";

  function setChoice<K extends keyof SymptomAnswers>(key: K, value: SymptomAnswers[K]) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  async function pickMedia(
    file: File | undefined,
    kind: "engine" | "odometer" | "video",
  ) {
    if (!file) return;
    const media = await previewFromFile(file, kind === "video" ? "video" : "image");
    if (kind === "engine") setEngineMedia(media);
    if (kind === "odometer") setOdometerMedia(media);
    if (kind === "video") setVideoMedia(media);
  }

  function sendWhatsAppInvite() {
    setInviteSent(true);
  }

  function openClient() {
    setRole("client");
    setClientStage("intake");
  }

  function submitClientPackage() {
    setClientSubmitted(true);
    setRole("karim");
    openDiagnose();
  }

  function openBoardCase(item: BoardCase<DemoSnapshot>) {
    persistNow();
    applySnapshot({ ...item.snapshot, role: "karim", caseId: item.id });
    const stage = karimStageForStatus(item.status);
    if (stage === "diagnose") {
      setAiRecommendations(null);
      setDiagnoseError("");
      setDiagnosing(true);
    }
    setKarimStage(stage);
    setPayError("");
  }

  function confirmDiagnosis(rec: DiagnosisRecommendation) {
    if (!clientFacingNote.trim()) {
      setClientFacingNote(`المشكلة: ${rec.diagnosis}. ${rec.note}`);
    }
    setSelectedRec(rec);
    setFinalTotal(rec.typicalPricePiasters);
    setRole("client");
    setClientStage("quote");
  }

  function saveKarimDiagnosis() {
    const diagnosis = customDiagnosis.trim();
    if (!diagnosis) return;
    const pricePiasters = Math.max(100, Math.round(Number(customPrice || "0") * 100));
    const updatedCases = addKarimCase(learnedCases, {
      answers,
      diagnosis,
      partsSummary: "حسب تشخيص كريم",
      typicalPricePiasters: pricePiasters,
      laborHours: 2,
    });
    const learnedCase = updatedCases.at(-1)!;
    setLearnedCases(updatedCases);
    setSelectedRec({
      caseId: learnedCase.id,
      diagnosis: learnedCase.diagnosis,
      partsSummary: learnedCase.partsSummary,
      typicalPricePiasters: learnedCase.typicalPricePiasters,
      laborHours: learnedCase.laborHours,
      note: "تشخيص كريم",
      matchScore: 10,
      matchedSignals: ["قرار كريم"],
      car: `${carMake} ${carModel} ${carYear}`,
    });
    setFinalTotal(pricePiasters);
    setRole("client");
    setClientStage("quote");
  }

  return (
    <main className="app-shell simple">
      <header className="topbar">
        <a className="brand" href="#">
          <span className="brand-mark">G</span>
          <span>GaragePay</span>
        </a>
        <div className="role-switch">
          <button
            className={role === "karim" ? "active" : ""}
            onClick={() => setRole("karim")}
          >
            كريم
          </button>
          <button className={role === "client" ? "active" : ""} onClick={openClient}>
            العميل
          </button>
        </div>
      </header>

      <div className="simple-head">
        <h1>{pageTitle}</h1>
        <p>
          {clientName || "عميل جديد"} · {STATUS_LABEL[activeStatus]}
        </p>
      </div>

      {role === "karim" && (
        <div className="karim-nav">
          <button className={karimStage === "desk" ? "active" : ""} onClick={() => setKarimStage("desk")}>
            المكتب
          </button>
          <button
            className={karimStage === "diagnose" ? "active" : ""}
            disabled={!clientSubmitted}
            onClick={openDiagnose}
          >
            التشخيص
          </button>
          <button
            className={karimStage === "shop" ? "active" : ""}
            disabled={!depositPaid}
            onClick={() => setKarimStage("shop")}
          >
            الكراج
          </button>
        </div>
      )}

      {role === "client" && ["intake", "symptoms", "media"].includes(clientStage) && (
        <div className="client-steps">
          <span
            className={
              clientStage === "intake" ? "active" : "done"
            }
          >
            ١ بيانات
          </span>
          <span
            className={
              clientStage === "symptoms" ? "active" : clientStage === "media" ? "done" : ""
            }
          >
            ٢ استبيان
          </span>
          <span className={clientStage === "media" ? "active" : ""}>٣ فيديو</span>
        </div>
      )}

      <section className="surface">
        {role === "karim" && karimStage === "desk" && (
          <>
            <div className="board-head">
              <h2>الحالات</h2>
              <button className="secondary" onClick={startNewCase}>
                حالة جديدة
              </button>
            </div>
            <div className="board-filters">
              {STATUS_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  className={statusFilter === filter.id ? "active" : ""}
                  onClick={() => setStatusFilter(filter.id)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="queue-list">
              {visibleCases.length === 0 && (
                <p className="muted compact">مفيش حالات بالفلتر ده — ابعت دعوة لعميل.</p>
              )}
              {visibleCases.map((item) => (
                <button
                  key={item.id}
                  className={`queue-item case-row ${item.id === caseId ? "active" : ""}`}
                  onClick={() => openBoardCase(item)}
                >
                  <span>
                    <b>{item.clientName}</b>
                    <span>{item.car}</span>
                  </span>
                  <em className={`status-badge ${item.status}`}>{STATUS_LABEL[item.status]}</em>
                </button>
              ))}
            </div>

            <h2>ابعت رابط للعميل</h2>
            <div className="form-grid">
              <label>
                الاسم
                <input value={clientName} onChange={(e) => setClientName(e.target.value)} />
              </label>
              <label>
                واتساب
                <input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
              </label>
            </div>
            <div className="whatsapp-preview">
              <span>WhatsApp</span>
              <p>
                أهلاً {clientName.split(" ")[0] || "عميلنا"}، ابعت التفاصيل من هنا: garagepay.app/j/GP-0248
              </p>
            </div>
            <div className="action-row">
              <button className="primary" onClick={sendWhatsAppInvite} disabled={!clientName.trim()}>
                إرسال واتساب
              </button>
              <button className="secondary" disabled={!inviteSent} onClick={openClient}>
                فتح استبيان العميل
              </button>
              {clientSubmitted && (
                <button className="secondary" onClick={openDiagnose}>
                  افتح التشخيص
                </button>
              )}
            </div>
            {inviteSent && <p className="good-note">تم الإرسال — الحالة ظاهرة في القائمة فوق.</p>}
          </>
        )}

        {role === "karim" && karimStage === "diagnose" && (
          <>
            <h2>اقتراحات التشخيص</h2>
            <p className="muted compact">
              {freeText} · {answers.soundType}/{answers.whenHeard}
            </p>
            <div className="media-review">
              {engineMedia?.previewUrl && <img src={engineMedia.previewUrl} alt="صورة الماتور" />}
              {odometerMedia?.previewUrl && <img src={odometerMedia.previewUrl} alt="صورة العداد" />}
              {videoMedia?.previewUrl && <video src={videoMedia.previewUrl} controls playsInline />}
            </div>
            <p className="small-note">الصور والفيديو لكريم بس. المساعد بيستخدم الأعراض المكتوبة فقط.</p>
            {diagnosing && (
              <div className="diagnose-loading">
                <span />
                المساعد بيقرأ الأعراض…
              </div>
            )}
            {diagnoseError && !diagnosing && <p className="warning">{diagnoseError}</p>}

            {!diagnosing && (
            <div className="rec-list">
              {recommendations.length === 0 && (
                <p className="warning">مفيش اقتراح واضح — اكتب تشخيصك.</p>
              )}
              {recommendations.map((rec) => (
                <article key={rec.caseId} className="rec-card compact">
                  <div className="rec-body">
                    <b>{rec.diagnosis}</b>
                    <small>
                      {formatMoney(rec.typicalPricePiasters)}
                      {rec.matchedSignals.includes("DeepSeek") ? " · مساعد كراج" : ` · تطابق ${rec.matchScore}/10`}
                    </small>
                    {rec.note && <em>{rec.note}</em>}
                  </div>
                  <button className="primary" onClick={() => confirmDiagnosis(rec)}>
                    اعتماد
                  </button>
                </article>
              ))}
            </div>
            )}

            <div className="custom-diagnosis">
              <b>أو تشخيصك</b>
              <div className="form-grid">
                <label>
                  التشخيص
                  <input
                    value={customDiagnosis}
                    onChange={(e) => setCustomDiagnosis(e.target.value)}
                    placeholder="طرمبة الباور…"
                  />
                </label>
                <label>
                  السعر (جنيه)
                  <input
                    value={customPrice}
                    onChange={(e) => setCustomPrice(e.target.value)}
                    inputMode="numeric"
                  />
                </label>
              </div>
              <label className="block-label">
                شرح قصير للعميل
                <textarea
                  value={clientFacingNote}
                  onChange={(e) => setClientFacingNote(e.target.value)}
                  rows={2}
                  placeholder="إيه المشكلة باختصار…"
                />
              </label>
              <button
                className="secondary"
                disabled={!customDiagnosis.trim()}
                onClick={saveKarimDiagnosis}
              >
                حفظ وإرسال التقرير
              </button>
            </div>
          </>
        )}

        {role === "karim" && karimStage === "shop" && (
          <>
            <h2>تحديث الكراج</h2>
            <div className="action-row">
              <button
                className="secondary"
                onClick={() => setFinalTotal(Math.round(agreedTotal * 1.18))}
              >
                قطعة زيادة (+١٨٪)
              </button>
              <button
                className="primary"
                onClick={() => {
                  setRole("client");
                  setClientStage("ready");
                }}
              >
                العربية جاهزة
              </button>
            </div>
            {finalTotal !== quoteTotal && (
              <p className={overage ? "warning" : "good-note"}>
                {overage ? "زيادة فوق ١٥٪" : "الزيادة ضمن الحد"}
              </p>
            )}
          </>
        )}

        {role === "client" && clientStage === "intake" && (
          <>
            <h2>بياناتك والعربية</h2>
            <div className="form-grid">
              <label>
                الاسم
                <input value={clientName} onChange={(e) => setClientName(e.target.value)} />
              </label>
              <label>
                الموبايل
                <input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
              </label>
              <label>
                الماركة
                <input value={carMake} onChange={(e) => setCarMake(e.target.value)} />
              </label>
              <label>
                الموديل
                <input value={carModel} onChange={(e) => setCarModel(e.target.value)} />
              </label>
              <label>
                السنة
                <input value={carYear} onChange={(e) => setCarYear(e.target.value)} />
              </label>
              <label>
                العداد (كم)
                <input value={mileage} onChange={(e) => setMileage(e.target.value)} />
              </label>
            </div>
            <label className="block-label">
              وصف المشكلة
              <textarea
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                rows={2}
                placeholder="إيه اللي بيحصل؟"
              />
            </label>
            <button
              className="primary wide"
              disabled={!intakeDone}
              onClick={() => setClientStage("symptoms")}
            >
              التالي: الاستبيان
            </button>
          </>
        )}

        {role === "client" && clientStage === "symptoms" && (
          <>
            <h2>أسئلة عن الصوت</h2>
            {SYMPTOM_QUESTIONS.map((question) => (
              <div className="question-block" key={question.id}>
                <p className="question-label">{question.label}</p>
                <div className="option-grid">
                  {question.options.map((option) => (
                    <button
                      key={option.value}
                      className={`option-chip ${
                        answers[question.id as "whenHeard" | "soundType"] === option.value
                          ? "selected"
                          : ""
                      }`}
                      onClick={() =>
                        setChoice(
                          question.id as "whenHeard" | "soundType",
                          option.value as WhenHeard | SoundType,
                        )
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {YES_NO_QUESTIONS.map((question) => (
              <div className="question-block" key={question.id}>
                <p className="question-label">{question.label}</p>
                <div className="option-grid yes-no">
                  {[true, false].map((value) => (
                    <button
                      key={String(value)}
                      className={`option-chip ${answers[question.id] === value ? "selected" : ""}`}
                      onClick={() => setChoice(question.id, value)}
                    >
                      {value ? "أيوه" : "لأ"}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button
              className="primary wide"
              disabled={!checklistDone}
              onClick={() => setClientStage("media")}
            >
              التالي: الفيديو
            </button>
          </>
        )}

        {role === "client" && clientStage === "media" && (
          <>
            <h2>ارفع ٣ حاجات</h2>
            <div className="check-grid">
              <MediaUpload
                title="صورة الماتور"
                accept="image/*"
                file={engineMedia}
                onFile={(file) => void pickMedia(file, "engine")}
              />
              <MediaUpload
                title="صورة العداد"
                accept="image/*"
                file={odometerMedia}
                onFile={(file) => void pickMedia(file, "odometer")}
              />
              <MediaUpload
                title="فيديو الصوت"
                accept="video/*"
                file={videoMedia}
                onFile={(file) => void pickMedia(file, "video")}
              />
            </div>
            <p className="small-note">ارفع ملفات حقيقية من الموبايل. مش هتتبعت للذكاء الاصطناعي.</p>
            <button
              className="primary wide"
              disabled={!mediaComplete}
              onClick={submitClientPackage}
            >
              إرسال لكريم
            </button>
          </>
        )}

        {role === "client" && clientStage === "quote" && selectedRec && report && (
          <>
            <h2>{report.title}</h2>
            <article className="report-block">
              <h3>إيه المشكلة؟</h3>
              <p>{report.plainExplanation}</p>
            </article>
            <article className="report-block">
              <h3>هنعمل إيه؟</h3>
              <ul className="report-steps plain">
                {report.whatWeWillDo.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
              <p className="report-eta">حوالي {report.etaDays} يوم · {formatMoney(quoteTotal)}</p>
            </article>
            <div className="report-split">
              <article className="report-block included">
                <h3>داخل السعر</h3>
                <ul>
                  {report.included.slice(0, 2).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
              <article className="report-block excluded">
                <h3>مش داخل</h3>
                <ul>
                  {report.notIncluded.slice(0, 2).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            </div>

            {counter ? (
              <div className="counter-box">
                <p>
                  طلبت <b>{formatMoney(Math.round(quoteTotal * 0.94))}</b>
                </p>
                <div className="action-row">
                  <button
                    className="primary"
                    onClick={() => {
                      setCounterApproved(true);
                      setClientStage("deposit");
                    }}
                  >
                    موافقة كريم
                  </button>
                  <button className="secondary" onClick={() => setCounterApproved(false)}>
                    رفض
                  </button>
                </div>
              </div>
            ) : (
              <div className="action-row">
                <button className="primary" onClick={() => setClientStage("deposit")}>
                  أوافق وأدفع العربون
                </button>
                <button className="secondary" onClick={() => setCounter(true)}>
                  تفاوض
                </button>
              </div>
            )}
          </>
        )}

        {role === "client" && clientStage === "deposit" && (
          <>
            <h2>{formatMoney(agreedTotal)}</h2>
            <div className="payment-box">
              <div>
                <span>عربون ٤٠٪ · Paymob</span>
                <b>{formatMoney(invoice.depositDuePiasters)}</b>
              </div>
            </div>
            <button
              className="primary wide"
              disabled={paying || awaitingWebhook === "deposit" || depositPaid}
              onClick={() => void startPay("deposit")}
            >
              {depositPaid
                ? "تم دفع العربون"
                : awaitingWebhook === "deposit"
                  ? "جاري تأكيد الدفع…"
                  : paying
                    ? "جاري التحويل لـ Paymob…"
                    : "ادفع العربون"}
            </button>
            {awaitingWebhook === "deposit" && (
              <p className="good-note">بنستنى تأكيد Paymob على الويبهوك — مش بنصدّق صفحة الرجوع لوحدها.</p>
            )}
            {payError && <p className="warning">{payError}</p>}
          </>
        )}

        {role === "client" && clientStage === "ready" && (
          <>
            <h2>جاهزة للاستلام</h2>
            <div className="quote-summary">
              <div>
                <span>المتفق عليه</span>
                <b>{formatMoney(agreedTotal)}</b>
              </div>
              <div>
                <span>الفعلي</span>
                <b>{formatMoney(finalTotal)}</b>
              </div>
              <div className="total">
                <span>المتبقي</span>
                <b>{formatMoney(balance)}</b>
              </div>
            </div>
            <button
              className="primary wide"
              disabled={balancePaid || paying || awaitingWebhook === "balance"}
              onClick={() => void startPay("balance")}
            >
              {balancePaid
                ? "تم السداد"
                : awaitingWebhook === "balance"
                  ? "جاري تأكيد الدفع…"
                  : paying
                    ? "جاري التحويل لـ Paymob…"
                    : "ادفع المتبقي"}
            </button>
            {awaitingWebhook === "balance" && (
              <p className="good-note">بنستنى تأكيد Paymob على الويبهوك.</p>
            )}
            {payError && <p className="warning">{payError}</p>}
          </>
        )}
      </section>
    </main>
  );
}

function MediaUpload({
  title,
  accept,
  file,
  onFile,
}: {
  title: string;
  accept: string;
  file: ClientMedia | null;
  onFile: (file: File | undefined) => void;
}) {
  const isVideo = file?.type.startsWith("video/");
  return (
    <label className={`upload-tile ${file ? "checked" : ""}`}>
      <input
        type="file"
        accept={accept}
        hidden
        onChange={(event) => {
          onFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {file?.previewUrl && !isVideo && <img src={file.previewUrl} alt="" />}
      {file?.previewUrl && isVideo && <video src={file.previewUrl} muted playsInline />}
      {!file?.previewUrl && <span className="tile-icon">{file ? "✓" : "+"}</span>}
      <b>{title}</b>
      <em>{file ? file.name : "ارفع من الجهاز"}</em>
    </label>
  );
}

export default App;
