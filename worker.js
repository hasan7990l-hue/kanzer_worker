const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    // OAuth token exchange
    if (request.method === 'POST' && url.pathname === '/') {
      return handleOAuth(request);
    }

    // Groq AI proxy
    if (request.method === 'POST' && url.pathname === '/ai') {
      return handleAI(request, env);
    }

    // Deriv WebSocket proxy
    // Deriv REST — accounts list
if (url.pathname === '/deriv/accounts' && request.method === 'GET') {
  const auth = request.headers.get('Authorization');
  if (!auth) return new Response(JSON.stringify({error:'missing auth'}), {status:401, headers:{...CORS, 'Content-Type':'application/json'}});
  const r = await fetch('https://api.derivws.com/trading/v1/options/accounts', {
    headers: { 'Authorization': auth }
  });
  return new Response(await r.text(), {
    status: r.status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });
}

// Deriv REST — OTP
if (url.pathname === '/deriv/otp' && request.method === 'POST') {
  const auth = request.headers.get('Authorization');
  const accountId = url.searchParams.get('accountId');
  if (!auth || !accountId) return new Response(JSON.stringify({error:'missing params'}), {status:400, headers:{...CORS, 'Content-Type':'application/json'}});
  const r = await fetch('https://api.derivws.com/trading/v1/options/accounts/' + accountId + '/otp', {
    method: 'POST',
    headers: { 'Authorization': auth }
  });
  return new Response(await r.text(), {
    status: r.status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });
}

    if (url.searchParams.get('ws-proxy') === '1') {
      return handleWS(request, url);
    }

    return new Response('Kanzer API OK', { status: 200 });
  }
};

async function handleOAuth(request) {
  try {
    const body = await request.text();
    const r = await fetch('https://auth.deriv.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    const text = await r.text();
    return new Response(text, {
      status: r.status,
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }
}

async function handleAI(request, env) {
  if (!env.GROQ_API_KEY) {
    return new Response(JSON.stringify({ error: 'GROQ_API_KEY missing' }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }
  try {
    const { system, user } = await request.json();
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + env.GROQ_API_KEY
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    });
    const d = await r.json();
    if (d.error) {
      return new Response(JSON.stringify({ error: d.error.message }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }
    const reply = d.choices?.[0]?.message?.content || '';
    return new Response(JSON.stringify({ reply }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }
}

async function handleWS(request, url) {
  const appId = url.searchParams.get('a');
  const token = url.searchParams.get('t');
  if (!appId || !token) {
    return new Response('missing a/t', { status: 400 });
  }
  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('expected websocket', { status: 426 });
  }
  const upstream = `https://ws.derivws.com/websockets/v3?app_id=${appId}`;
  return fetch(upstream, request);
      }
