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

const parseQuery = (event) => {
  const qs = event.queryStringParameters || {};
  return typeof qs === 'object' && qs !== null ? qs : {};
};

const pickField = (payload, keys) => {
  for (const key of keys) {
    const value = normalize(payload?.[key]);
    if (value) return value;
  }
  return '';
};

const ussdResponse = (text, meta) => {
  const isContinue = text.startsWith('CON ');
  const message = text.replace(/^CON\s|^END\s/, '');

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify({
      sessionID: meta.sessionID,
      UserID: meta.userID,
      userID: meta.userID,
      msisdn: meta.msisdn,
      continueSession: isContinue,
      message
    })
  };
};

const normalizeUssdText = (text) => {
  let t = normalize(text)
    .replace(/[＃]/g, '#')
    .replace(/[＊]/g, '*')
    .replace(/\s+/g, '');

  // Arkesel can send the full dial string (e.g. *928*301# or *928*301#*1).
  // Only parse user selections after the trailing "#".
  if (t.includes('#')) {
    t = t.slice(t.lastIndexOf('#') + 1);
  }

  return t;
};

const getSteps = (text) =>
  normalizeUssdText(text)
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
  if (!['POST', 'GET'].includes(event.httpMethod || '')) {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const payload = { ...parseQuery(event), ...parseBody(event) };
  const sessionId = pickField(payload, ['sessionID', 'SESSIONID', 'sessionId', 'session_id', 'SessionId']);
  const phone = pickField(payload, ['msisdn', 'MSISDN', 'phoneNumber', 'phone']);
  const userId = pickField(payload, ['UserID', 'USERID', 'userID', 'userId', 'userid']) || phone;
  const text = pickField(payload, ['userData', 'USERDATA', 'text', 'input', 'ussdString', 'message', 'INPUT']);

  const responseText = handleFlow(getSteps(text));

  console.log('USSD request', {
    sessionId,
    phone,
    text,
    responseType: responseText.slice(0, 3)
  });

  return ussdResponse(responseText, {
    sessionID: sessionId,
    userID: userId,
    msisdn: phone
  });
};
