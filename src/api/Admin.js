const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// File storage config for product images and downloadable files
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = file.fieldname === 'file' ? './uploads/files' : './uploads/images';
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, unique + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
  fileFilter: function (req, file, cb) {
    if (file.fieldname === 'file') {
      // Allow zip, jar, pbo, rar for plugins/mods
      const allowed = ['.zip', '.jar', '.pbo', '.rar', '.7z'];
      if (!allowed.includes(path.extname(file.originalname).toLowerCase())) {
        return cb(new Error('Invalid file type'));
      }
    }
    cb(null, true);
  }
});

module.exports = async function (app, con, config) {

  // ─── Products ────────────────────────────────────────────

  // GET /api/admin/products
  app.get('/api/admin/products', requireAdmin, function (req, res) {
    con.query(
      `SELECT p.*, c.name AS category_name,
              (SELECT COUNT(*) FROM license_keys lk WHERE lk.product_id = p.id) AS total_sales
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       ORDER BY p.created_at DESC`,
      function (err, rows) {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      }
    );
  });

  // POST /api/admin/products
  app.post('/api/admin/products', requireAdmin, upload.array('images', 10), function (req, res) {
    const { name, description, price, category_id, active, featured } = req.body;
    if (!name || !price) return res.status(400).json({ error: 'Name and price are required' });

    const id = uuidv4();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const images = req.files
      ? JSON.stringify(req.files.map(f => `/uploads/images/${f.filename}`))
      : JSON.stringify([]);

    con.query(
      `INSERT INTO products (id, category_id, name, slug, description, price, images, active, featured)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, category_id || null, name, slug, description || null, price, images,
       active === 'true' ? 1 : 0, featured === 'true' ? 1 : 0],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id, slug });
      }
    );
  });

  // PUT /api/admin/products/:id
  app.put('/api/admin/products/:id', requireAdmin, upload.array('images', 10), function (req, res) {
    const { name, description, price, category_id, active, featured } = req.body;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    // If new images uploaded, replace. Otherwise leave existing.
    if (req.files && req.files.length > 0) {
      const images = JSON.stringify(req.files.map(f => `/uploads/images/${f.filename}`));
      con.query(
        `UPDATE products SET name=?, slug=?, description=?, price=?, category_id=?,
         active=?, featured=?, images=? WHERE id=?`,
        [name, slug, description || null, price, category_id || null,
         active === 'true' ? 1 : 0, featured === 'true' ? 1 : 0, images, req.params.id],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ success: true });
        }
      );
    } else {
      con.query(
        `UPDATE products SET name=?, slug=?, description=?, price=?, category_id=?,
         active=?, featured=? WHERE id=?`,
        [name, slug, description || null, price, category_id || null,
         active === 'true' ? 1 : 0, featured === 'true' ? 1 : 0, req.params.id],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ success: true });
        }
      );
    }
  });

  // DELETE /api/admin/products/:id
  app.delete('/api/admin/products/:id', requireAdmin, function (req, res) {
    con.query(`DELETE FROM products WHERE id = ?`, [req.params.id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });

  // ─── Product File Upload ──────────────────────────────────

  // POST /api/admin/products/:id/file
  app.post('/api/admin/products/:id/file', requireAdmin, upload.single('file'), function (req, res) {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const id = uuidv4();
    const { version } = req.body;
    const storagePath = `/uploads/files/${req.file.filename}`;

    // Remove old file record for this product (one active file per product)
    con.query(`DELETE FROM product_files WHERE product_id = ?`, [req.params.id], function () {
      con.query(
        `INSERT INTO product_files (id, product_id, filename, storage_path, version)
         VALUES (?, ?, ?, ?, ?)`,
        [id, req.params.id, req.file.originalname, storagePath, version || null],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ success: true, path: storagePath });
        }
      );
    });
  });

  // ─── Orders ──────────────────────────────────────────────

  // GET /api/admin/orders
  app.get('/api/admin/orders', requireAdmin, function (req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;

    con.query(
      `SELECT o.*, u.userName, u.userEmail,
              GROUP_CONCAT(p.name SEPARATOR ', ') AS products
       FROM orders o
       JOIN users u ON u.id = o.user_id
       JOIN order_items oi ON oi.order_id = o.id
       JOIN products p ON p.id = oi.product_id
       GROUP BY o.id
       ORDER BY o.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset],
      function (err, rows) {
        if (err) return res.status(500).json({ error: err.message });
        con.query(`SELECT COUNT(*) AS total FROM orders`, function (err2, count) {
          res.json({ orders: rows, total: count[0].total, page, limit });
        });
      }
    );
  });

  // ─── Customers ───────────────────────────────────────────

  // GET /api/admin/customers
  app.get('/api/admin/customers', requireAdmin, function (req, res) {
    con.query(
      `SELECT u.*,
              COUNT(DISTINCT o.id) AS total_orders,
              COUNT(DISTINCT lk.id) AS total_keys,
              COALESCE(SUM(o.total), 0) AS total_spent
       FROM users u
       LEFT JOIN orders o ON o.user_id = u.id AND o.status = 'completed'
       LEFT JOIN license_keys lk ON lk.user_id = u.id
       GROUP BY u.id
       ORDER BY u.createdAt DESC`,
      function (err, rows) {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      }
    );
  });

  // ─── Licenses ────────────────────────────────────────────

  // GET /api/admin/licenses
  app.get('/api/admin/licenses', requireAdmin, function (req, res) {
    con.query(
      `SELECT lk.*, u.userName, u.userEmail, p.name AS product_name
       FROM license_keys lk
       JOIN users u ON u.id = lk.user_id
       JOIN products p ON p.id = lk.product_id
       ORDER BY lk.created_at DESC`,
      function (err, rows) {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      }
    );
  });

  // POST /api/admin/licenses/:id/suspend
  app.post('/api/admin/licenses/:id/suspend', requireAdmin, function (req, res) {
    con.query(
      `UPDATE license_keys SET status = 'suspended' WHERE id = ?`,
      [req.params.id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      }
    );
  });

  // POST /api/admin/licenses/:id/activate
  app.post('/api/admin/licenses/:id/activate', requireAdmin, function (req, res) {
    con.query(
      `UPDATE license_keys SET status = 'active' WHERE id = ?`,
      [req.params.id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      }
    );
  });

  // POST /api/admin/licenses/:id/reset-hwid
  app.post('/api/admin/licenses/:id/reset-hwid', requireAdmin, function (req, res) {
    con.query(
      `UPDATE license_keys SET hwid = NULL WHERE id = ?`,
      [req.params.id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      }
    );
  });

  // POST /api/admin/licenses/generate
  // Manually generate a key for a user (gifting, support, etc.)
  app.post('/api/admin/licenses/generate', requireAdmin, function (req, res) {
    const { user_id, product_id } = req.body;
    if (!user_id || !product_id) return res.status(400).json({ error: 'Missing fields' });

    createLicense(user_id, product_id, null, function (err, key) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, key });
    });
  });
};