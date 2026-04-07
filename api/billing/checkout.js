const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const priceId = process.env.STRIPE_PRICE_ID_PRO;
  if (!priceId) return res.status(503).json({ error: 'Stripe not configured' });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: req.query?.email || req.query?.e,
      success_url: `${process.env.APP_URL || ''}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL || ''}/dashboard?canceled=true`,
    });
    res.status(200).json({ success: true, checkoutUrl: session.url });
  } catch (err) {
    res.status(500).json({ error: 'Checkout failed: ' + err.message });
  }
};
