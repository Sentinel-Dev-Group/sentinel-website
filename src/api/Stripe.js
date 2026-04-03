const stripe = require('stripe')(config.Tokens.StripeSecretKey);
const { v4: uuidv4 } = require('uuid');
const express = require('express');

module.exports = async function (app, con, config) {

  // POST /api/checkout
  // Creates a Stripe Checkout session and returns the redirect URL
  app.post('/api/checkout', async function (req, res) {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'You must be logged in to purchase.' });
    }

    const { product_id } = req.body;

    con.query(
      `SELECT * FROM products WHERE id = ? AND active = 1 LIMIT 1`,
      [product_id],
      async function (err, rows) {
        if (err || !rows[0]) {
          return res.status(404).json({ error: 'Product not found' });
        }

        const product = rows[0];

        // Check if user already owns this product
        userOwnsProduct(req.user.id, product.id, async function (owns) {
          if (owns) {
            return res.status(400).json({ error: 'You already own this product.' });
          }

          try {
            const session = await stripe.checkout.sessions.create({
              payment_method_types: ['card'],
              mode: 'payment',
              customer_email: req.user.userEmail,
              line_items: [
                {
                  price_data: {
                    currency: 'gbp',
                    product_data: {
                      name: product.name,
                      description: product.description
                        ? product.description.substring(0, 255)
                        : undefined,
                    },
                    unit_amount: Math.round(product.price * 100),
                  },
                  quantity: 1,
                },
              ],
              metadata: {
                user_id: req.user.id,
                product_id: product.id,
              },
              success_url: config.SiteInformation.Domain + '/dashboard?purchase=success',
              cancel_url: config.SiteInformation.Domain + '/product/' + product.slug,
            });

            res.json({ url: session.url });
          } catch (e) {
            Logger(e.message, { title: 'Stripe', color: 'red' });
            res.status(500).json({ error: 'Failed to create checkout session.' });
          }
        });
      }
    );
  });

  // POST /api/stripe/webhook
  // Stripe calls this after a successful payment — creates the order and license key
  app.post(
    '/api/stripe/webhook',
    express.raw({ type: 'application/json' }),
    function (req, res) {
      const sig = req.headers['stripe-signature'];
      let event;

      try {
        event = stripe.webhooks.constructEvent(
          req.body,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET
        );
      } catch (e) {
        Logger(`Webhook signature failed: ${e.message}`, { title: 'Stripe', color: 'red' });
        return res.status(400).send(`Webhook error: ${e.message}`);
      }

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const { user_id, product_id } = session.metadata;

        const orderId = uuidv4();
        const itemId = uuidv4();
        const total = session.amount_total / 100;

        // Create order
        con.query(
          `INSERT INTO orders (id, user_id, stripe_payment_id, total, status)
           VALUES (?, ?, ?, ?, 'completed')`,
          [orderId, user_id, session.payment_intent, total],
          function (err) {
            if (err) {
              Logger(err.message, { title: 'Stripe Webhook', color: 'red' });
              return;
            }

            // Create order item
            con.query(
              `INSERT INTO order_items (id, order_id, product_id, price_paid)
               VALUES (?, ?, ?, ?)`,
              [itemId, orderId, product_id, total],
              function (err) {
                if (err) {
                  Logger(err.message, { title: 'Stripe Webhook', color: 'red' });
                  return;
                }

                // Generate and store license key
                createLicense(user_id, product_id, itemId, function (err, key) {
                  if (err) {
                    Logger(err.message, { title: 'License Gen', color: 'red' });
                    return;
                  }
                  Logger(
                    `Order complete — user ${user_id} purchased ${product_id} — key: ${key}`,
                    { title: 'Stripe', color: 'green' }
                  );
                });
              }
            );
          }
        );
      }

      res.json({ received: true });
    }
  );
};