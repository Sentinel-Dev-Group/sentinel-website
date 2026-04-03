const path = require('path');
const fs   = require('fs');

module.exports = async function (app, con, config) {

  // Ensure upload directories exist on startup
  const dirs = [
    './uploads/images',
    './uploads/files',
  ];
  dirs.forEach(function (dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      Logger(`Created upload directory: ${dir}`, { title: 'Upload', color: 'blue' });
    }
  });

  // Serve uploaded images publicly
  app.use('/uploads/images', require('express').static(path.join(process.cwd(), 'uploads/images')));

  // Serve downloadable files — protected, ownership checked
  app.get('/uploads/files/:filename', requireAuth, function (req, res) {
    const filename = req.params.filename;

    // Look up which product this file belongs to
    con.query(
      `SELECT pf.*, p.id AS product_id
       FROM product_files pf
       JOIN products p ON p.id = pf.product_id
       WHERE pf.filename = ? OR pf.storage_path LIKE ?
       LIMIT 1`,
      [filename, `%${filename}`],
      function (err, rows) {
        if (err || !rows[0]) {
          return res.status(404).render('utils/500', {
            Config: config,
            User: { loggedIn: false },
            Settings: {},
            Error: 'File not found.',
          });
        }

        const file = rows[0];

        // Verify the logged in user owns this product
        userOwnsProduct(req.user.id, file.product_id, function (owns) {
          if (!owns) {
            return res.status(403).redirect('/store');
          }

          const fullPath = path.join(process.cwd(), file.storage_path);

          if (!fs.existsSync(fullPath)) {
            return res.status(404).render('utils/500', {
              Config: config,
              User: { loggedIn: false },
              Settings: {},
              Error: 'File missing from server. Please contact support.',
            });
          }

          // Force download with the original filename
          res.download(fullPath, file.filename, function (err) {
            if (err) {
              Logger(`Download error: ${err.message}`, { title: 'Upload', color: 'red' });
            }
          });
        });
      }
    );
  });

  // DELETE /api/admin/uploads/file/:id — admin can remove a file record + disk file
  app.delete('/api/admin/uploads/file/:id', requireAdmin, function (req, res) {
    con.query(
      `SELECT * FROM product_files WHERE id = ? LIMIT 1`,
      [req.params.id],
      function (err, rows) {
        if (err || !rows[0]) return res.status(404).json({ error: 'File not found' });

        const file     = rows[0];
        const fullPath = path.join(process.cwd(), file.storage_path);

        // Remove from disk
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }

        // Remove from database
        con.query(`DELETE FROM product_files WHERE id = ?`, [file.id], function (err) {
          if (err) return res.status(500).json({ error: err.message });
          Logger(`Deleted file: ${file.filename}`, { title: 'Upload', color: 'yellow' });
          res.json({ success: true });
        });
      }
    );
  });

  // DELETE /api/admin/uploads/image — admin can clean up a specific image path
  app.delete('/api/admin/uploads/image', requireAdmin, function (req, res) {
    const { path: imgPath } = req.body;
    if (!imgPath) return res.status(400).json({ error: 'No path provided' });

    // Safety check — only allow deleting from uploads/images
    if (!imgPath.startsWith('/uploads/images/')) {
      return res.status(403).json({ error: 'Invalid path' });
    }

    const fullPath = path.join(process.cwd(), imgPath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      Logger(`Deleted image: ${imgPath}`, { title: 'Upload', color: 'yellow' });
    }

    res.json({ success: true });
  });

  // GET /api/admin/uploads — list all uploaded files with their product info
  app.get('/api/admin/uploads', requireAdmin, function (req, res) {
    con.query(
      `SELECT pf.*, p.name AS product_name, p.slug AS product_slug
       FROM product_files pf
       JOIN products p ON p.id = pf.product_id
       ORDER BY pf.uploaded_at DESC`,
      function (err, rows) {
        if (err) return res.status(500).json({ error: err.message });

        // Enrich with file size from disk
        const enriched = rows.map(function (file) {
          const fullPath = path.join(process.cwd(), file.storage_path);
          let size = null;
          try {
            if (fs.existsSync(fullPath)) {
              size = fs.statSync(fullPath).size;
            }
          } catch (e) {}
          return { ...file, size };
        });

        res.json(enriched);
      }
    );
  });
};