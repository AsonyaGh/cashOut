const STAKE_AMOUNT = 5;

const normalize = (value) => (typeof value === 'string' ? value.trim() : '');

const parseFormEncoded = (raw) => {
  const params = new URLSearchParams(raw || '');
  const data = {};
  for (const [k, v] of params.entries()) data[k] = v;
  return data;
};

const parseBody = (event) => {
  const raw = event.body || '';
  const contentType = (event.headers?.['content-type'] || event.headers?.['Content-Type'] || '').toLowerCase();

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(raw || '{}');
    } catch {
      return {};
    }
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    return parseFormEncoded(raw);
  }

  try {
    return JSON.parse(raw || '{}');
  } catch {
    return parseFormEncoded(raw);
  }
};

const pickField = (payload, keys) => {
  for (const key of keys) {
    const value = normalize(payload?.[key]);
    if (value) return value;
  }
  return '';
};

const ussdResponse = (text) => {
  const isContinue = text.startsWith('CON ');
  const message = text.replace(/^CON\s|^END\s/, '');

  return {
  statusCode: 200,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  },
    body: JSON.stringify({
      continueSession: isContinue,
      message
    })
  };
};

const getSteps = (text) =>
  normalize(text)
    .split('*')
    .map((s) => s.trim())
    .filter(Boolean);

const handleFlow = (steps) => {
  if (steps.length === 0) {
    return `CON Welcome to Home Radio Cash Out
1. Play & Win (GHS ${STAKE_AMOUNT})
2. Exit`;
  }

  const first = steps[0];

  if (first === '2') {
    return 'END Thank you for using Home Radio Cash Out.';
  }

  if (first !== '1') {
    return 'END Invalid choice. Please dial again and choose 1 or 2.';
  }

  if (steps.length === 1) {
    return `CON Confirm stake of GHS ${STAKE_AMOUNT}?
1. Confirm
2. Cancel`;
  }

  const second = steps[1];

  if (second === '2') {
    return 'END Transaction cancelled.';
  }

  if (second !== '1') {
    return 'END Invalid confirmation option. Please dial again.';
  }

  return `END Payment request for GHS ${STAKE_AMOUNT} submitted.
If successful, your ticket will be entered into the current draw.`;
};

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const payload = parseBody(event);
  const sessionId = pickField(payload, ['sessionId', 'session_id', 'SessionId']);
  const phone = pickField(payload, ['phoneNumber', 'phone', 'msisdn', 'MSISDN']);
  const text = pickField(payload, ['text', 'input', 'ussdString', 'message']);

  const responseText = handleFlow(getSteps(text));

  console.log('USSD request', {
    sessionId,
    phone,
    text,
    responseType: responseText.slice(0, 3)
  });

  return ussdResponse(responseText);
};
