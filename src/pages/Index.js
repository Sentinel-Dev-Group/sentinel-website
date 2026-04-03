module.exports = async function (app, con, config) {

  // GET / — store homepage with featured + all products
  app.get('/', function (req, res) {
    GetUserInfo(req, res, function (User, Settings) {
      con.query(
        `SELECT p.*, c.name AS category_name, c.slug AS category_slug,
                (SELECT COUNT(*) FROM license_keys lk WHERE lk.product_id = p.id) AS sales
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.active = 1
         ORDER BY p.featured DESC, p.created_at DESC`,
        function (err, products) {
          if (err) return res.redirect('/');
          con.query(`SELECT * FROM categories`, function (err2, categories) {
            res.render('index', { User, Settings, products, categories });
          });
        }
      );
    });
  });

  // GET /store — full product listing with search + category filter
  app.get('/store', function (req, res) {
    GetUserInfo(req, res, function (User, Settings) {
      const { category, search } = req.query;
      let query = `
        SELECT p.*, c.name AS category_name, c.slug AS category_slug,
               (SELECT COUNT(*) FROM license_keys lk WHERE lk.product_id = p.id) AS sales
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.active = 1`;
      const params = [];

      if (category) {
        query += ` AND c.slug = ?`;
        params.push(category);
      }
      if (search) {
        query += ` AND (p.name LIKE ? OR p.description LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`);
      }

      query += ` ORDER BY p.featured DESC, p.created_at DESC`;

      con.query(query, params, function (err, products) {
        if (err) return res.redirect('/');
        con.query(`SELECT * FROM categories`, function (err2, categories) {
          res.render('store', { User, Settings, products, categories, search: search || '', category: category || '' });
        });
      });
    });
  });

  // GET /product/:slug — single product page
  app.get('/product/:slug', function (req, res) {
    GetUserInfo(req, res, function (User, Settings) {
      con.query(
        `SELECT p.*, c.name AS category_name, c.slug AS category_slug,
                pf.filename, pf.version,
                (SELECT COUNT(*) FROM license_keys lk WHERE lk.product_id = p.id) AS sales
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         LEFT JOIN product_files pf ON pf.product_id = p.id
         WHERE p.slug = ? AND p.active = 1
         LIMIT 1`,
        [req.params.slug],
        function (err, rows) {
          if (err || !rows[0]) return res.redirect('/store');
          const product = rows[0];

          // Parse images JSON safely
          try { product.images = JSON.parse(product.images || '[]'); }
          catch (e) { product.images = []; }

          // Check if logged in user already owns this product
          if (User.loggedIn) {
            userOwnsProduct(User.id, product.id, function (owns) {
              res.render('product', { User, Settings, product, owns });
            });
          } else {
            res.render('product', { User, Settings, product, owns: false });
          }
        }
      );
    });
  });

  // GET /download/:productId — protected download route
  app.get('/download/:productId', requireAuth, function (req, res) {
    userOwnsProduct(req.user.id, req.params.productId, function (owns) {
      if (!owns) return res.redirect('/store');

      con.query(
        `SELECT pf.* FROM product_files pf WHERE pf.product_id = ? LIMIT 1`,
        [req.params.productId],
        function (err, rows) {
          if (err || !rows[0]) return res.redirect('/dashboard');
          const file = rows[0];
          const fullPath = require('path').join(process.cwd(), file.storage_path);
          res.download(fullPath, file.filename);
        }
      );
    });
  });

  // GET /login
  app.get('/login', function (req, res) {
    if (req.isAuthenticated()) return res.redirect('/');
    GetUserInfo(req, res, function (User, Settings) {
      res.render('utils/login', { User, Settings });
    });
  });

  // GET /logout
  app.get('/logout', function (req, res) {
    req.logout(function () { res.redirect('/'); });
  });

  // GET /dashboard — user's purchases, keys and downloads
  app.get('/dashboard', requireAuth, function (req, res) {
    GetUserInfo(req, res, function (User, Settings) {
      con.query(
        `SELECT lk.*, p.name AS product_name, p.slug AS product_slug,
                p.images, pf.filename, pf.version
         FROM license_keys lk
         JOIN products p ON p.id = lk.product_id
         LEFT JOIN product_files pf ON pf.product_id = p.id
         WHERE lk.user_id = ?
         ORDER BY lk.created_at DESC`,
        [User.id],
        function (err, licenses) {
          if (err) return res.redirect('/');
          licenses.forEach(l => {
            try { l.images = JSON.parse(l.images || '[]'); }
            catch (e) { l.images = []; }
          });
          con.query(
            `SELECT o.*, GROUP_CONCAT(p.name SEPARATOR ', ') AS products
             FROM orders o
             JOIN order_items oi ON oi.order_id = o.id
             JOIN products p ON p.id = oi.product_id
             WHERE o.user_id = ?
             GROUP BY o.id
             ORDER BY o.created_at DESC`,
            [User.id],
            function (err2, orders) {
              res.render('dashboard', { User, Settings, licenses, orders: orders || [] });
            }
          );
        }
      );
    });
  });

  // GET /admin — admin panel (page guard, not API guard)
  app.get('/admin', requireAdminPage, function (req, res) {
    GetUserInfo(req, res, function (User, Settings) {
      res.render('admin/index', { User, Settings });
    });
  });

  app.get('/admin/products', requireAdminPage, function (req, res) {
    GetUserInfo(req, res, function (User, Settings) {
      res.render('admin/products', { User, Settings });
    });
  });

  app.get('/admin/orders', requireAdminPage, function (req, res) {
    GetUserInfo(req, res, function (User, Settings) {
      res.render('admin/orders', { User, Settings });
    });
  });

  app.get('/admin/customers', requireAdminPage, function (req, res) {
    GetUserInfo(req, res, function (User, Settings) {
      res.render('admin/customers', { User, Settings });
    });
  });

  app.get('/admin/licenses', requireAdminPage, function (req, res) {
    GetUserInfo(req, res, function (User, Settings) {
      res.render('admin/licenses', { User, Settings });
    });
  });
};