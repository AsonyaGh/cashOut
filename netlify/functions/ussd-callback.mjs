import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment
} from "firebase/firestore";

const STAKE_AMOUNT = 5;
const SESSION_TTL_MS = 10 * 60 * 1000;

const normalize = (value) => (typeof value === "string" ? value.trim() : "");

const parseFormEncoded = (raw) => {
  const params = new URLSearchParams(raw || "");
  const data = {};
  for (const [k, v] of params.entries()) data[k] = v;
  return data;
};

const parseBody = (event) => {
  const raw = event.body || "";
  const contentType = (event.headers?.["content-type"] || event.headers?.["Content-Type"] || "").toLowerCase();

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(raw || "{}");
    } catch {
      return {};
    }
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    return parseFormEncoded(raw);
  }

  try {
    return JSON.parse(raw || "{}");
  } catch {
    return parseFormEncoded(raw);
  }
};

const parseQuery = (event) => {
  const qs = event.queryStringParameters || {};
  return typeof qs === "object" && qs !== null ? qs : {};
};

const pickField = (payload, keys) => {
  for (const key of keys) {
    const value = normalize(payload?.[key]);
    if (value) return value;
  }
  return "";
};

const normalizeUssdText = (text) => {
  let t = normalize(text)
    .replace(/[＃]/g, "#")
    .replace(/[＊]/g, "*")
    .replace(/\s+/g, "");

  // Arkesel may send full dial string (e.g. *928*301#*1*1)
  if (t.includes("#")) {
    t = t.slice(t.lastIndexOf("#") + 1);
  }

  return t;
};

const getSteps = (text) =>
  normalizeUssdText(text)
    .split("*")
    .map((s) => s.trim())
    .filter(Boolean);

const ussdResponse = (text, meta) => {
  const isContinue = text.startsWith("CON ");
  const message = text.replace(/^CON\s|^END\s/, "");

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify({
      sessionID: meta.sessionID || "",
      UserID: meta.userID || meta.msisdn || "",
      userID: meta.userID || meta.msisdn || "",
      msisdn: meta.msisdn || "",
      message,
      continueSession: isContinue ? "true" : "false"
    })
  };
};

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.VITE_FIREBASE_APP_ID || "",
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || ""
};

const getDb = () => {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  return getFirestore(app);
};

const nowMs = () => Date.now();

const newSessionState = ({ sessionID, userID, msisdn, rawText, parsedSteps }) => ({
  sessionID,
  userID,
  msisdn,
  rawText: rawText || "",
  parsedSteps,
  step: "WELCOME",
  stakeAmount: STAKE_AMOUNT,
  status: "ACTIVE",
  paymentStatus: "NOT_STARTED",
  ticketStatus: "NOT_CREATED",
  paymentRef: null,
  ticketId: null,
  createdAt: nowMs(),
  updatedAt: nowMs(),
  expiresAt: nowMs() + SESSION_TTL_MS,
  userInputHistory: parsedSteps
});

const upsertSession = async (db, sessionID, partial) => {
  await setDoc(doc(db, "ussdSessions", sessionID), partial, { merge: true });
};

const createPaymentRecord = async (db, paymentRef, data) => {
  await setDoc(doc(db, "payments", paymentRef), data, { merge: true });
};

const ensureTicketAndFinalize = async (db, session, meta) => {
  const sessionRef = doc(db, "ussdSessions", meta.sessionID);
  const existingTicketId = session.ticketId || `USSD-${meta.sessionID}`;
  const paymentRef = session.paymentRef || `PAY-${meta.sessionID}`;
  const ticketRef = doc(db, "tickets", existingTicketId);
  const configRef = doc(db, "system", "config");

  // Idempotency: if ticket already marked complete for this session, reuse final response
  if (session.ticketStatus === "SUCCESS" && session.paymentStatus === "SUCCESS") {
    return {
      paymentRef,
      ticketId: existingTicketId,
      alreadyProcessed: true
    };
  }

  const paymentMode = (process.env.USSD_PAYMENT_MODE || "mock_success").toLowerCase();
  const paymentSuccess = paymentMode !== "mock_fail";
  const currentTime = nowMs();

  await createPaymentRecord(db, paymentRef, {
    paymentRef,
    sessionId: meta.sessionID,
    ticketId: existingTicketId,
    phone: meta.msisdn,
    amount: STAKE_AMOUNT,
    provider: "ARKESEL",
    status: paymentSuccess ? "SUCCESS" : "FAILED",
    providerResponse: {
      mode: paymentMode,
      simulated: true
    },
    createdAt: session.paymentRef ? (session.paymentCreatedAt || currentTime) : currentTime,
    updatedAt: currentTime
  });

  if (!paymentSuccess) {
    await updateDoc(sessionRef, {
      updatedAt: currentTime,
      expiresAt: currentTime + SESSION_TTL_MS,
      step: "PAYMENT_FAILED",
      status: "FAILED",
      paymentRef,
      paymentStatus: "FAILED",
      ticketId: existingTicketId,
      ticketStatus: "NOT_CREATED"
    });

    return { paymentRef, ticketId: existingTicketId, paymentSuccess: false };
  }

  // Create or overwrite deterministic ticket doc for idempotency.
  await setDoc(ticketRef, {
    phone: meta.msisdn,
    stake: STAKE_AMOUNT,
    drawId: "current",
    timestamp: currentTime,
    status: "SUCCESS",
    source: "USSD",
    sessionId: meta.sessionID,
    paymentRef,
    isWinner: false,
    prizeAmount: 0
  }, { merge: true });

  // Keep UI jackpot moving similar to current app behavior.
  await setDoc(configRef, { currentJackpot: increment(STAKE_AMOUNT) }, { merge: true });

  await updateDoc(sessionRef, {
    updatedAt: currentTime,
    expiresAt: currentTime + SESSION_TTL_MS,
    step: "COMPLETED",
    status: "COMPLETED",
    paymentRef,
    paymentStatus: "SUCCESS",
    ticketId: existingTicketId,
    ticketStatus: "SUCCESS"
  });

  return { paymentRef, ticketId: existingTicketId, paymentSuccess: true };
};

const handleMenuFlow = async (db, session, meta) => {
  const steps = meta.parsedSteps;
  const first = steps[0];
  const second = steps[1];

  // Initial menu
  if (steps.length === 0) {
    await upsertSession(db, meta.sessionID, {
      ...session,
      step: "WELCOME",
      status: "ACTIVE",
      updatedAt: nowMs(),
      expiresAt: nowMs() + SESSION_TTL_MS,
      rawText: meta.rawText,
      parsedSteps: steps,
      userInputHistory: steps
    });

    return `CON Welcome to Home Radio Cash Out
1. Play & Win (GHS ${STAKE_AMOUNT})
2. Exit`;
  }

  // If already completed and simulator retries, return same final response.
  if (session.status === "COMPLETED" && session.ticketId) {
    return `END Payment confirmed. Ticket ID: ${session.ticketId}`;
  }

  if (first === "2") {
    await upsertSession(db, meta.sessionID, {
      ...session,
      step: "CANCELLED",
      status: "CANCELLED",
      updatedAt: nowMs(),
      expiresAt: nowMs() + SESSION_TTL_MS,
      rawText: meta.rawText,
      parsedSteps: steps,
      userInputHistory: steps
    });
    return "END Thank you for using Home Radio Cash Out.";
  }

  if (first !== "1") {
    await upsertSession(db, meta.sessionID, {
      ...session,
      step: "INVALID",
      status: "FAILED",
      updatedAt: nowMs(),
      expiresAt: nowMs() + SESSION_TTL_MS,
      rawText: meta.rawText,
      parsedSteps: steps,
      userInputHistory: steps
    });
    return "END Invalid choice. Please dial again and choose 1 or 2.";
  }

  if (steps.length === 1) {
    await upsertSession(db, meta.sessionID, {
      ...session,
      step: "CONFIRM",
      status: "ACTIVE",
      updatedAt: nowMs(),
      expiresAt: nowMs() + SESSION_TTL_MS,
      rawText: meta.rawText,
      parsedSteps: steps,
      userInputHistory: steps
    });

    return `CON Confirm stake of GHS ${STAKE_AMOUNT}?
1. Confirm
2. Cancel`;
  }

  if (second === "2") {
    await upsertSession(db, meta.sessionID, {
      ...session,
      step: "CANCELLED",
      status: "CANCELLED",
      updatedAt: nowMs(),
      expiresAt: nowMs() + SESSION_TTL_MS,
      rawText: meta.rawText,
      parsedSteps: steps,
      userInputHistory: steps
    });
    return "END Transaction cancelled.";
  }

  if (second !== "1") {
    await upsertSession(db, meta.sessionID, {
      ...session,
      step: "INVALID_CONFIRM",
      status: "FAILED",
      updatedAt: nowMs(),
      expiresAt: nowMs() + SESSION_TTL_MS,
      rawText: meta.rawText,
      parsedSteps: steps,
      userInputHistory: steps
    });
    return "END Invalid confirmation option. Please dial again.";
  }

  // Confirm path: real workflow structure with mockable payment adapter.
  await upsertSession(db, meta.sessionID, {
    ...session,
    step: "PROCESSING_PAYMENT",
    status: "ACTIVE",
    paymentStatus: "INITIATED",
    updatedAt: nowMs(),
    expiresAt: nowMs() + SESSION_TTL_MS,
    rawText: meta.rawText,
    parsedSteps: steps,
    userInputHistory: steps
  });

  const result = await ensureTicketAndFinalize(db, session, meta);
  if (result.paymentSuccess === false) {
    return "END Payment failed. Please try again later.";
  }

  return `END Payment confirmed. Ticket ID: ${result.ticketId}`;
};

export const handler = async (event) => {
  if (!["POST", "GET"].includes(event.httpMethod || "")) {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const payload = { ...parseQuery(event), ...parseBody(event) };
  const sessionID = pickField(payload, ["sessionID", "SESSIONID", "sessionId", "session_id", "SessionId"]);
  const msisdn = pickField(payload, ["msisdn", "MSISDN", "phoneNumber", "phone"]);
  const userID = pickField(payload, ["UserID", "USERID", "userID", "userId", "userid"]) || msisdn;
  const rawText = pickField(payload, ["userData", "USERDATA", "text", "input", "ussdString", "message", "INPUT"]);
  const parsedSteps = getSteps(rawText);

  const meta = { sessionID, msisdn, userID, rawText, parsedSteps };

  try {
    if (!sessionID || !msisdn) {
      return ussdResponse("END Missing required session parameters.", meta);
    }

    const db = getDb();
    const sessionRef = doc(db, "ussdSessions", sessionID);
    const sessionSnap = await getDoc(sessionRef);
    const session = sessionSnap.exists()
      ? { ...sessionSnap.data() }
      : newSessionState(meta);

    const responseText = await handleMenuFlow(db, session, meta);

    console.log("USSD request", {
      sessionId: sessionID,
      phone: msisdn,
      text: rawText,
      parsedSteps,
      responseType: responseText.slice(0, 3)
    });

    return ussdResponse(responseText, meta);
  } catch (error) {
    console.error("USSD callback error", {
      sessionID,
      msisdn,
      error: error?.message || String(error)
    });
    return ussdResponse("END System busy. Please try again shortly.", meta);
  }
};
