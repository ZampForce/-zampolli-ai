require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
const crypto = require('crypto');

const DATA_FILE = '/tmp/data.json';
let data;

function loadData() {
  try {
    const fs = require('fs');
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    }
  } catch (err) { /* ignore */ }
  return { users: {}, sessions: {}, connectedOrgs: {} };
}

function saveData() {
  try {
    const fs = require('fs');
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) { /* ignore in serverless */ }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function comparePassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const testHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return testHash === hash;
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

const TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
const PRO_PRICE_ID = process.env.STRIPE_PRICE_ID_PRO || '';

function sendJson(res, code, obj) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (res.statusCode !== 200 && res.statusCode !== 204) {
    res.status(code);
  }
  res.status(code).json(obj);
}

function authenticate(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const session = data.sessions[token];
  if (!session || session.expiresAt < Date.now()) return null;
  return session.userEmail;
}

module.exports = async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }

  data = loadData();
  const path = req.url.split('?')[0];

  // ── Auth: Register ──
  if (path === '/api/auth/register' && req.method === 'POST') {
    try {
      const { name, email, password } = req.body;
      if (!name || !email || !password) return sendJson(res, 400, { error: 'Name, email and password are required' });
      if (password.length < 6) return sendJson(res, 400, { error: 'Password must be at least 6 characters' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJson(res, 400, { error: 'Invalid email format' });
      if (data.users[email]) return sendJson(res, 409, { error: 'Email already registered' });

      const passwordHash = hashPassword(password);
      const token = generateToken();
      data.users[email] = { name, email, passwordHash, plan: 'free', usage: 0, stripeCustomerId: null, createdAt: new Date().toISOString() };
      data.sessions[token] = { userEmail: email, expiresAt: Date.now() + TOKEN_EXPIRY_MS };
      saveData();
      return sendJson(res, 200, { success: true, token, name, plan: 'free' });
    } catch (err) {
      return sendJson(res, 500, { error: 'Internal server error' });
    }
  }

  // ── Auth: Login ──
  if (path === '/api/auth/login' && req.method === 'POST') {
    try {
      const { email, password } = req.body;
      if (!email || !password) return sendJson(res, 400, { error: 'Email and password are required' });
      const user = data.users[email];
      if (!user || !comparePassword(password, user.passwordHash)) return sendJson(res, 401, { error: 'Invalid email or password' });
      for (const [tok, sess] of Object.entries(data.sessions)) {
        if (sess.userEmail === email) delete data.sessions[tok];
      }
      const token = generateToken();
      data.sessions[token] = { userEmail: email, expiresAt: Date.now() + TOKEN_EXPIRY_MS };
      saveData();
      return sendJson(res, 200, { success: true, token, name: user.name, plan: user.plan, usage: user.usage });
    } catch (err) {
      return sendJson(res, 500, { error: 'Internal server error' });
    }
  }

  // ── Dashboard ──
  if (path === '/api/dashboard' && req.method === 'GET') {
    const userEmail = authenticate(req);
    if (!userEmail) return sendJson(res, 401, { error: 'Authentication required' });
    const user = data.users[userEmail];
    if (!user) return sendJson(res, 404, { error: 'User not found' });
    const orgCount = Object.values(data.connectedOrgs).filter(o => o.userEmail === userEmail).length;
    return sendJson(res, 200, { name: user.name, email: user.email, plan: user.plan, usage: user.usage, limit: user.plan === 'pro' ? -1 : 10, connectedOrgs: orgCount, createdAt: user.createdAt });
  }

  // ── Connect Org ──
  if (path === '/api/orgs/connect' && req.method === 'POST') {
    const userEmail = authenticate(req);
    if (!userEmail) return sendJson(res, 401, { error: 'Authentication required' });
    const { domain, username, orgLabel } = req.body;
    if (!username || !username.includes('@')) return sendJson(res, 400, { error: 'Valid username is required' });
    const id = `org_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    data.connectedOrgs[id] = { userEmail, domain: domain || 'login', username, label: orgLabel || username, createdAt: new Date().toISOString() };
    saveData();
    return sendJson(res, 200, { success: true, message: 'Org connected successfully' });
  }

  // ── Get Orgs ──
  if (path === '/api/orgs' && req.method === 'GET') {
    const userEmail = authenticate(req);
    if (!userEmail) return sendJson(res, 401, { error: 'Authentication required' });
    const orgs = Object.entries(data.connectedOrgs).filter(([_, o]) => o.userEmail === userEmail).map(([id, o]) => ({ id, ...o }));
    return sendJson(res, 200, { orgs });
  }

  // ── Disconnect Org ──
  if (path.match(/^\/api\/orgs\//) && req.method === 'DELETE') {
    const userEmail = authenticate(req);
    if (!userEmail) return sendJson(res, 401, { error: 'Authentication required' });
    const orgId = path.split('/').pop();
    const org = data.connectedOrgs[orgId];
    if (!org || org.userEmail !== userEmail) return sendJson(res, 404, { error: 'Org not found' });
    delete data.connectedOrgs[orgId];
    saveData();
    return sendJson(res, 200, { success: true });
  }

  // ── Stripe Checkout ──
  if (path === '/api/billing/checkout' && req.method === 'POST') {
    const userEmail = authenticate(req);
    if (!userEmail) return sendJson(res, 401, { error: 'Authentication required' });
    const user = data.users[userEmail];
    if (!user) return sendJson(res, 404, { error: 'User not found' });

    if (!PRO_PRICE_ID) return sendJson(res, 503, { error: 'Stripe not configured', checkoutUrl: null });

    try {
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({ email: user.email, name: user.name, metadata: { userEmail } });
        customerId = customer.id;
        user.stripeCustomerId = customerId;
        saveData();
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: PRO_PRICE_ID, quantity: 1 }],
        success_url: `${process.env.APP_URL || ''}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.APP_URL || ''}/dashboard?canceled=true`,
        metadata: { userEmail, plan: 'pro' },
      });
      return sendJson(res, 200, { success: true, checkoutUrl: session.url });
    } catch (err) {
      return sendJson(res, 500, { error: 'Failed to create checkout session' });
    }
  }

  // ── Stripe Webhook ──
  if (path === '/api/billing/webhook' && req.method === 'POST') {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET || '');
    } catch (err) {
      return res.status(400).send('Webhook Error');
    }
    try {
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const email = session.metadata?.userEmail;
        const emailMatch = session.customer_details?.email;
        const targetEmail = email || emailMatch;
        if (targetEmail && data.users[targetEmail]) {
          data.users[targetEmail].plan = 'pro';
          saveData();
        }
      }
      if (event.type === 'customer.subscription.deleted') {
        const sub = event.data.object;
        for (const [e, user] of Object.entries(data.users)) {
          if (user.stripeCustomerId === sub.customer) { user.plan = 'free'; saveData(); break; }
        }
      }
      return sendJson(res, 200, { received: true });
    } catch (err) {
      return sendJson(res, 500, { error: 'Webhook handler failed' });
    }
  }

  // ── 404 ──
  return sendJson(res, 404, { error: 'Not found' });
};
