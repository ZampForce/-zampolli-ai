const crypto = require('crypto');
const SECRET = process.env.TOKEN_SECRET || crypto.createHash('sha256').update(Buffer.from('zampolli')).digest('hex');

function getBody(req) {
  if (typeof req.body === 'object' && req.body !== null) return Promise.resolve(req.body);
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

  const body = await getBody(req);
  const { email, password } = body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  // Stateless: aceite qualquer login válido, crie JWT
  const name = (email || '').split('@')[0] || 'User';
  const p = JSON.stringify({ email: (email||'').toLowerCase().trim(), name, plan: 'free', exp: Math.floor(Date.now()/1000) + 30*24*3600 });
  const e = Buffer.from(p).toString('base64url');
  const token = e + '.' + crypto.createHmac('sha256', SECRET).update(e).digest('hex');

  res.status(200).json({ success: true, token, name, plan: 'free' });
};
