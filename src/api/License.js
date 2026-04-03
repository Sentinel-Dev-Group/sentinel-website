const rateLimit = require('express-rate-limit');

module.exports = async function (app, con, config) {
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { valid: false, error: 'Too many requests, slow down.' }
  });

  // POST /api/license/validate
  // Called by your Minecraft plugins and DayZ mods on startup
  app.post('/api/license/validate', limiter, function (req, res) {
    const { key, product_id, hwid } = req.body;

    if (!key || !product_id) {
      return res.status(400).json({ valid: false, error: 'Missing key or product_id' });
    }

    con.query(
      `SELECT lk.*, p.name AS product_name
       FROM license_keys lk
       JOIN products p ON p.id = lk.product_id
       WHERE lk.\`key\` = ? AND lk.product_id = ?
       LIMIT 1`,
      [key, product_id],
      function (err, rows) {
        if (err || !rows[0]) {
          return res.json({ valid: false, error: 'Invalid license key' });
        }

        const license = rows[0];

        if (license.status === 'suspended') {
          return res.json({ valid: false, error: 'License has been suspended' });
        }

        if (license.status === 'expired') {
          return res.json({ valid: false, error: 'License has expired' });
        }

        if (license.expires_at && new Date(license.expires_at) < new Date()) {
          con.query(`UPDATE license_keys SET status = 'expired' WHERE id = ?`, [license.id]);
          return res.json({ valid: false, error: 'License has expired' });
        }

        // HWID locking — binds the key to the first machine that uses it
        if (!license.hwid && hwid) {
          con.query(
            `UPDATE license_keys SET hwid = ?, uses = uses + 1 WHERE id = ?`,
            [hwid, license.id]
          );
        } else if (license.hwid && hwid && license.hwid !== hwid) {
          return res.json({ valid: false, error: 'Hardware ID mismatch' });
        } else {
          con.query(`UPDATE license_keys SET uses = uses + 1 WHERE id = ?`, [license.id]);
        }

        return res.json({
          valid: true,
          product: license.product_name,
          expires: license.expires_at || null
        });
      }
    );
  });

  // GET /api/license/lookup — returns all keys for the logged in user
  app.get('/api/license/lookup', function (req, res) {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    con.query(
      `SELECT lk.key, lk.status, lk.hwid, lk.uses, lk.created_at, lk.expires_at,
              p.name AS product_name, p.id AS product_id
       FROM license_keys lk
       JOIN products p ON p.id = lk.product_id
       WHERE lk.user_id = ?
       ORDER BY lk.created_at DESC`,
      [req.user.id],
      function (err, rows) {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(rows);
      }
    );
  });
};