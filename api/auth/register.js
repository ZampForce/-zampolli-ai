const crypto = require('crypto');
const SECRET = process.env.TOKEN_SECRET || crypto.createHash('sha256').update(Buffer.from('zampolli')).digest('hex');

function makeToken(email, name, plan) {
  const p = JSON.stringify({ email: (email||'').toLowerCase().trim(), name, plan: plan||'free', exp: Math.floor(Date.now()/1000) + 30*24*3600 });
  const e = Buffer.from(p).toString('base64url');
  return e + '.' + crypto.createHmac('sha256', SECRET).update(e).digest('hex');
}

async function getBody(req) {
  if (typeof req.body === 'object' && req.body !== null) return req.body;
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch { resolve({}); }
    });
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'POST') {
    const body = await getBody(req);
    const { name, email, password } = body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    res.status(200).json({ success: true, token: makeToken(email, name, 'free'), name, plan: 'free' });
  }
};
