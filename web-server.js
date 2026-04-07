// ── Web Server for Zampolli AI (Auth + Landing + Dashboard)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ── Security ──
app.use(helmet({
  contentSecurityPolicy: undefined,
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:8080', 'http://localhost:3000'],
  credentials: true,
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'landing')));

// ── Rate limiting ──
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

// ── File-based data store ──
const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    }
  } catch (err) { console.error('[DB load error]', err); }
  return { users: {}, sessions: {}, connectedOrgs: {} };
}

let data = loadData();

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) { console.error('[DB save error]', err); }
}

// Password hashing with pbkdf2 (stdlib)
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

const TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ── Stripe plan config ──
const PRO_PRICE_ID = process.env.STRIPE_PRICE_ID_PRO || '';

// ── Landing ──
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'landing', 'index.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'landing', 'dashboard.html'));
});

// ── Auth: Register ──
app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (data.users[email]) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = hashPassword(password);
    const token = generateToken();

    data.users[email] = {
      name,
      email,
      passwordHash,
      plan: 'free',
      usage: 0,
      stripeCustomerId: null,
      createdAt: new Date().toISOString(),
    };

    data.sessions[token] = {
      userEmail: email,
      expiresAt: Date.now() + TOKEN_EXPIRY_MS,
    };

    saveData();
    res.json({ success: true, token, name, plan: 'free' });
  } catch (err) {
    console.error('[Register error]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Auth: Login ──
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = data.users[email];
    if (!user || !comparePassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Invalidate old sessions for this user
    for (const [tok, sess] of Object.entries(data.sessions)) {
      if (sess.userEmail === email) delete data.sessions[tok];
    }

    const token = generateToken();
    data.sessions[token] = { userEmail: email, expiresAt: Date.now() + TOKEN_EXPIRY_MS };
    saveData();

    res.json({ success: true, token, name: user.name, plan: user.plan, usage: user.usage });
  } catch (err) {
    console.error('[Login error]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Auth: Forgot password ──
app.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const user = data.users[email];
  if (!user) return res.json({ success: true, message: 'If email exists, reset link sent.' });

  const resetToken = generateToken();
  // In production, send email with reset link. For now, store token.
  const key = `reset:${email}:${resetToken}`;
  data.sessions[key] = { userEmail: email, expiresAt: Date.now() + 3600000 };
  saveData();

  res.json({ success: true, message: 'Reset link sent to email.' });
});

// ── Dashboard ──
app.get('/api/dashboard', authenticate, apiLimiter, (req, res) => {
  const user = data.users[req.userEmail];
  if (!user) return res.status(404).json({ error: 'User not found' });

  const orgCount = Object.values(data.connectedOrgs)
    .filter(o => o.userEmail === req.userEmail).length;

  res.json({
    name: user.name,
    email: user.email,
    plan: user.plan,
    usage: user.usage,
    limit: user.plan === 'pro' ? -1 : 10,
    connectedOrgs: orgCount,
    createdAt: user.createdAt,
  });
});

// ── Connect Salesforce org ──
app.post('/api/orgs/connect', authenticate, apiLimiter, (req, res) => {
  const { domain, username, password, orgLabel } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Salesforce credentials required' });
  }

  const id = `org_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  data.connectedOrgs[id] = {
    userEmail: req.userEmail,
    domain: domain || 'login',
    username,
    label: orgLabel || username,
    createdAt: new Date().toISOString(),
  };
  saveData();

  res.json({ success: true, message: 'Org connected successfully' });
});

// ── Get connected orgs ──
app.get('/api/orgs', authenticate, (req, res) => {
  const orgs = Object.entries(data.connectedOrgs)
    .filter(([_, o]) => o.userEmail === req.userEmail)
    .map(([id, o]) => ({ id, ...o }));
  res.json({ orgs });
});

// ── Disconnect org ──
app.delete('/api/orgs/:id', authenticate, (req, res) => {
  const org = data.connectedOrgs[req.params.id];
  if (!org || org.userEmail !== req.userEmail) {
    return res.status(404).json({ error: 'Org not found' });
  }
  delete data.connectedOrgs[req.params.id];
  saveData();
  res.json({ success: true });
});

// ── Checkout (Stripe) ──
app.post('/api/billing/checkout', authenticate, async (req, res) => {
  try {
    const user = data.users[req.userEmail];
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!PRO_PRICE_ID || PRO_PRICE_ID === '') {
      return res.status(503).json({ error: 'Stripe not configured', checkoutUrl: 'https://checkout.stripe.com/pay/demo-session' });
    }

    let customerId = user.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { userEmail: user.email },
      });
      customerId = customer.id;
      user.stripeCustomerId = customerId;
      saveData();
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: PRO_PRICE_ID, quantity: 1 }],
      success_url: `${process.env.APP_URL || 'http://localhost:8080'}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL || 'http://localhost:8080'}/dashboard?canceled=true`,
      metadata: { userEmail: user.email, plan: 'pro' },
    });

    res.json({ success: true, checkoutUrl: session.url });
  } catch (err) {
    console.error('[Stripe checkout error]', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ── Stripe Webhook ──
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET || '');
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const email = session.metadata?.userEmail;
        if (email && data.users[email]) {
          data.users[email].plan = 'pro';
          saveData();
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        // Find user by Stripe customer ID
        for (const [email, user] of Object.entries(data.users)) {
          if (user.stripeCustomerId === sub.customer) {
            user.plan = 'free';
            saveData();
            break;
          }
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        console.log('[Stripe] Payment failed for customer:', invoice.customer);
        break;
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error('[Webhook handler error]', err);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// ── Middleware ──
function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  const session = data.sessions[token];
  if (!session || session.expiresAt < Date.now()) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  req.userEmail = session.userEmail;
  return next();
}

// ── Start ──
app.listen(PORT, () => {
  console.log(`Zampolli AI Web Server running on port ${PORT}`);
  console.log(`  Environment: ${NODE_ENV}`);
  console.log(`  Landing: http://localhost:${PORT}`);
  console.log(`  API: http://localhost:${PORT}/api`);
});

process.on('SIGINT', () => { saveData(); process.exit(); });
process.on('SIGTERM', () => { saveData(); process.exit(); });
