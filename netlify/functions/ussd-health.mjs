export const handler = async () => {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify({
      ok: true,
      service: 'ussd',
      timestamp: new Date().toISOString()
    })
  };
};
