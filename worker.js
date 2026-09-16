const ALLOWED_ORIGIN = 'https://hasan7990l-hue.github.io';

function corsHeaders(origin) {
  const allow = (origin && (origin === ALLOWED_ORIGIN || origin.startsWith('http://localhost')))
    ? origin
    : ALLOWED_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin'
  };
}

function json(data, status = 200, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
  });
}

async function fetchWithTimeout(url, options = {}, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    // OAuth token exchange — supports both `/` and `/oauth` for compatibility
    if (request.method === 'POST' && (url.pathname === '/' || url.pathname === '/oauth')) {
      return handleOAuth(request, origin);
    }

    // Groq AI proxy
    if (request.method === 'POST' && url.pathname === '/ai') {
      return handleAI(request, env, origin);
    }

    // Deriv REST — accounts list
    if (url.pathname === '/deriv/accounts' && request.method === 'GET') {
      return handleDerivAccounts(request, origin);
    }

    // Deriv REST — OTP
    if (url.pathname === '/deriv/otp' && request.method === 'POST') {
      return handleDerivOtp(request, url, origin);
    }

    return new Response('Kanzer API OK', { status: 200, headers: corsHeaders(origin) });
  }
};

async function handleOAuth(request, origin) {
  try {
    const body = await request.text();
    const r = await fetchWithTimeout('https://auth.deriv.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    }, 15000);
    const text = await r.text();
    return new Response(text, {
      status: r.status,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return json({ error: e.message }, 500, origin);
  }
}

async function handleAI(request, env, origin) {
  if (!env.GROQ_API_KEY) return json({ error: 'GROQ_API_KEY missing' }, 500, origin);

  // Origin gate — blocks random scripts and curl from other origins
  if (origin && origin !== ALLOWED_ORIGIN && !origin.startsWith('http://localhost')) {
    return json({ error: 'forbidden origin' }, 403, origin);
  }

  try {
    const payload = await request.json();
    const system = typeof payload.system === 'string' ? payload.system : '';
    const user = typeof payload.user === 'string' ? payload.user : '';
    if (!user) return json({ error: 'missing user' }, 400, origin);
    if (user.length > 4000 || system.length > 2000) {
      return json({ error: 'payload too large' }, 400, origin);
    }

    const r = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + env.GROQ_API_KEY
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    }, 20000);

    const d = await r.json();
    if (d.error) return json({ error: d.error.message }, 400, origin);
    const reply = d.choices?.[0]?.message?.content || '';
    return json({ reply }, 200, origin);
  } catch (e) {
    return json({ error: e.message }, 500, origin);
  }
}

async function handleDerivAccounts(request, origin) {
  const auth = request.headers.get('Authorization');
  if (!auth) return json({ error: 'missing auth' }, 401, origin);
  try {
    const r = await fetchWithTimeout('https://api.derivws.com/trading/v1/options/accounts', {
      headers: { 'Authorization': auth }
    });
    return new Response(await r.text(), {
      status: r.status,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return json({ error: e.message }, 500, origin);
  }
}

async function handleDerivOtp(request, url, origin) {
  const auth = request.headers.get('Authorization');
  const accountId = url.searchParams.get('accountId');
  if (!auth || !accountId) return json({ error: 'missing params' }, 400, origin);
  if (!/^[A-Za-z0-9]+$/.test(accountId)) return json({ error: 'bad accountId' }, 400, origin);
  try {
    const r = await fetchWithTimeout(
      'https://api.derivws.com/trading/v1/options/accounts/' + accountId + '/otp',
      { method: 'POST', headers: { 'Authorization': auth } }
    );
    return new Response(await r.text(), {
      status: r.status,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return json({ error: e.message }, 500, origin);
  }
}
