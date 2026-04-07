const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
const crypto = require('crypto');

const SECRET = process.env.TOKEN_SECRET || crypto.createHash('sha256').update(process.env.STRIPE_SECRET_KEY || 'default').digest('hex');

// ── JWT-like token: {email, plan, expires} signed with HMAC ──
function createToken(email, plan) {
  const payload = JSON.stringify({ email, plan, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 });
  const encoded = Buffer.from(payload).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(encoded).digest('hex');
  return encoded + '.' + sig;
}

function verifyToken(token) {
  if (!token) return null;
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(encoded).digest('hex');
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

function sendJson(res, code, obj) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return res.status(code).json(obj);
}

// ── Store verified users on server (for webhook → user mapping) ──
// Uses a simple in-memory map + file fallback for Vercel persistence
const path = require('path');
const fs = require('fs');
const DATA_FILE = path.join(__dirname, '..', '.user-data.json');

function loadUsers() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {}
  return {};
}

function saveUsers(users) {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2)); } catch {}
}

module.exports = async (req, res) => {
  // CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }

  const { url, method } = req;
  const p = url.split('?')[0];

  // Parse body
  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  // ── Auth: Register ──
  if (p === '/api/auth/register' && method === 'POST') {
    const { name, email, password } = body;
    if (!name || !email || !password) return sendJson(res, 400, { error: 'Name, email and password are required' });
    if (password.length < 6) return sendJson(res, 400, { error: 'Password must be at least 6 characters' });

    const users = loadUsers();
    if (users[email]) return sendJson(res, 409, { error: 'Email already registered' });

    const hash = crypto.createHash('sha512').update(password + SECRET.substring(0, 32)).digest('hex');
    users[email] = { name, email, hash, plan: 'free', createdAt: new Date().toISOString() };
    saveUsers(users);

    const token = createToken(email, 'free');
    return sendJson(res, 200, { success: true, token, name, plan: 'free' });
  }

  // ── Auth: Login ──
  if (p === '/api/auth/login' && method === 'POST') {
    const { email, password } = body;
    if (!email || !password) return sendJson(res, 400, { error: 'Email and password are required' });

    const users = loadUsers();
    const user = users[email];
    const hash = crypto.createHash('sha512').update(password + SECRET.substring(0, 32)).digest('hex');

    if (!user || user.hash !== hash) return sendJson(res, 401, { error: 'Invalid email or password' });

    const token = createToken(email, user.plan);
    return sendJson(res, 200, { success: true, token, name: user.name, plan: user.plan, usage: 0 });
  }

  // ── Dashboard ──
  if (p === '/api/dashboard' && method === 'GET') {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const payload = verifyToken(token);
    if (!payload) return sendJson(res, 401, { error: 'Authentication required' });

    const users = loadUsers();
    const user = users[payload.email];
    if (!user) return sendJson(res, 404, { error: 'User not found' });

    return sendJson(res, 200, {
      name: user.name, email: user.email, plan: user.plan, usage: 0,
      limit: user.plan === 'pro' ? -1 : 10, createdAt: user.createdAt,
    });
  }

  // ── Connect Org ──
  if (p === '/api/orgs/connect' && method === 'POST') {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const payload = verifyToken(token);
    if (!payload) return sendJson(res, 401, { error: 'Authentication required' });

    const { domain, username, orgLabel } = body;
    if (!username) return sendJson(res, 400, { error: 'Username required' });

    const users = loadUsers();
    const orgs = users[payload.email]?.orgs || [];
    orgs.push({ id: Date.now().toString(), domain: domain || 'login', username, label: orgLabel || username, createdAt: new Date().toISOString() });
    if (users[payload.email]) users[payload.email].orgs = orgs;
    saveUsers(users);
    return sendJson(res, 200, { success: true, message: 'Org connected' });
  }

  // ── Get Orgs ──
  if (p === '/api/orgs' && method === 'GET') {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const payload = verifyToken(token);
    if (!payload) return sendJson(res, 401, { error: 'Authentication required' });
    const users = loadUsers();
    const orgs = users[payload.email]?.orgs || [];
    return sendJson(res, 200, { orgs });
  }

  // ── Disconnect Org ──
  if (p.startsWith('/api/orgs/') && method === 'DELETE') {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const payload = verifyToken(token);
    if (!payload) return sendJson(res, 401, { error: 'Authentication required' });

    const orgId = path.split('/').pop();
    const users = loadUsers();
    const orgs = users[payload.email]?.orgs || [];
    users[payload.email].orgs = orgs.filter(o => o.id !== orgId);
    saveUsers(users);
    return sendJson(res, 200, { success: true });
  }

  // ── Stripe: Checkout (needs user email from body for stateless) ──
  if (p === '/api/billing/checkout' && method === 'POST') {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const payload = verifyToken(token);
    if (!payload) return sendJson(res, 401, { error: 'Authentication required' });

    const users = loadUsers();
    const user = users[payload.email];
    if (!user) return sendJson(res, 404, { error: 'User not found' });

    const PRO_PRICE_ID = process.env.STRIPE_PRICE_ID_PRO || '';
    if (!PRO_PRICE_ID) return sendJson(res, 503, { error: 'Stripe not configured' });

    try {
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({ email: user.email, name: user.name, metadata: { userEmail: user.email } });
        customerId = customer.id;
        user.stripeCustomerId = customerId;
        saveUsers(users);
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: PRO_PRICE_ID, quantity: 1 }],
        success_url: `${process.env.APP_URL || ''}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.APP_URL || ''}/dashboard?canceled=true`,
        metadata: { userEmail: user.email, plan: 'pro' },
      });
      return sendJson(res, 200, { success: true, checkoutUrl: session.url });
    } catch (err) {
      return sendJson(res, 500, { error: 'Checkout failed: ' + err.message });
    }
  }

  // ── Stripe Webhook ──
  if (p === '/api/billing/webhook' && method === 'POST') {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET || '');
    } catch (err) {
      return res.status(400).send('Webhook Error: ' + err.message);
    }

    const users = loadUsers();

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const email = session.metadata?.userEmail || session.customer_details?.email;
      if (email && users[email]) {
        users[email].plan = 'pro';
        users[email].stripeCustomerId = session.customer;
        saveUsers(users);
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      for (const [email, user] of Object.entries(users)) {
        if (user.stripeCustomerId === sub.customer) {
          user.plan = 'free';
          saveUsers(users);
          break;
        }
      }
    }

    return sendJson(res, 200, { received: true });
  }

  return sendJson(res, 404, { error: 'Not found' });
};
