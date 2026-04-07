const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, stripe-signature');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const sig = req.headers['stripe-signature'];
  let event;
  try { event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET || ''); }
  catch (err) { return res.status(400).send('Webhook Error'); }

  if (event.type === 'checkout.session.completed') console.log('[Webhook] checkout completed');
  res.status(200).json({ received: true });
};
