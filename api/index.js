const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
const crypto = require('crypto');

const SECRET = process.env.TOKEN_SECRET || crypto.createHash('sha256').update(process.env.STRIPE_SECRET_KEY || 'default').digest('hex');

// ── JWT-like token: {email, plan, name} signed with HMAC ──
function createToken(email, plan, name) {
  const payload = JSON.stringify({ email, plan: plan || 'free', name, exp: Math.floor(Date.now() / 1000) + 30 * 24 * 3600 });
  const encoded = Buffer.from(payload).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(encoded).digest('hex');
  return encoded + '.' + sig;
}

function verifyToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expected = crypto.createHmac('sha256', SECRET).update(encoded).digest('hex');
  if (sig !== expected) return null;
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString());
  } catch { return null; }
}

function sendJson(res, code, obj) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');
  return res.status(code).json(obj);
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();

  const path = req.url.split('?')[0];
  let body = req.body || {};
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  // ── Auth: Register ──
  if (path === '/api/auth/register' && req.method === 'POST') {
    const { name, email, password } = body;
    if (!name || !email || !password) return sendJson(res, 400, { error: 'Name, email and password required' });
    if (password.length < 6) return sendJson(res, 400, { error: 'Password must be at least 6 characters' });
    const token = createToken(email.trim().toLowerCase(), 'free', name);
    return sendJson(res, 200, { success: true, token, name, plan: 'free', email: email.toLowerCase() });
  }

  // ── Auth: Login ──
  if (path === '/api/auth/login' && req.method === 'POST') {
    const { email, password } = body;
    if (!email || !password) return sendJson(res, 400, { error: 'Email and password required' });
    // Stateless login: we just accept any valid credentials for now
    // In production, you'd verify against a database
    const token = createToken(email.trim().toLowerCase(), 'free', body.name || 'User');
    return sendJson(res, 200, { success: true, token, name: body.name || 'User', plan: 'free' });
  }

  // ── Dashboard ──
  if (path === '/api/dashboard' && req.method === 'GET') {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const payload = verifyToken(token);
    if (!payload) return sendJson(res, 401, { error: 'Authentication required' });
    return sendJson(res, 200, {
      name: payload.name,
      email: payload.email,
      plan: payload.plan || 'free',
      usage: payload.usage || 0,
      limit: payload.plan === 'pro' ? -1 : 10,
      connectedOrgs: payload.orgs ? payload.orgs.length : 0,
      orgs: payload.orgs || [],
      createdAt: payload.iat || '',
    });
  }

  // ── Stripe Checkout ──
  if (path === '/api/billing/checkout' && req.method === 'POST') {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const payload = verifyToken(token);
    if (!payload) return sendJson(res, 401, { error: 'Authentication required' });

    const priceId = process.env.STRIPE_PRICE_ID_PRO;
    if (!priceId) return sendJson(res, 503, { error: 'Stripe not configured' });

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        customer_email: payload.email,
        success_url: `${process.env.APP_URL || ''}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.APP_URL || ''}/dashboard?canceled=true`,
        subscription_data: { metadata: { userEmail: payload.email, plan: 'pro' } },
      });
      return sendJson(res, 200, { success: true, checkoutUrl: session.url });
    } catch (err) {
      return sendJson(res, 500, { error: 'Checkout failed' });
    }
  }

  // ── Stripe Webhook ──
  if (path === '/api/billing/webhook' && req.method === 'POST') {
    const sig = req.headers['stripe-signature'];
    let event;
    try { event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET || ''); }
    catch (err) { return res.status(400).send('Webhook Error'); }

    if (event.type === 'checkout.session.completed') {
      // The success_url handles redirect. Client should check session.
      console.log('[Webhook] checkout.session.completed');
    }

    return sendJson(res, 200, { received: true });
  }

  return sendJson(res, 404, { error: 'Not found' });
};
