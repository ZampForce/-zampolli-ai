const crypto = require('crypto');

const SECRET = process.env.TOKEN_SECRET || crypto.createHash('sha256').update(process.env.STRIPE_SECRET_KEY || 'default').digest('hex');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const SECRET_KEY = SECRET.substring(0, 32);

  if (req.method === 'POST') {
    const { name, email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    if (req.url.includes('/register')) {
      if (!name) return res.status(400).json({ error: 'Name required' });
      if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Create a self-contained JWT token
    // In serverless, we can't persist users between requests
    // So register just validates & creates a token with user info
    const plan = req.url.includes('/register') ? 'free' : 'free';
    const displayName = name || (email.split('@')[0]) || 'User';

    const payload = JSON.stringify({
      email: (email || '').trim().toLowerCase(),
      plan: plan,
      name: displayName,
      exp: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
    });
    const encoded = Buffer.from(payload).toString('base64url');
    const sig = crypto.createHmac('sha256', SECRET).update(encoded).digest('hex');
    const token = encoded + '.' + sig;

    return res.status(200).json({
      success: true,
      token: token,
      name: displayName,
      plan: plan,
    });
  }

  return res.status(404).json({ error: 'Not found' });
};
