const { v4: uuidv4 } = require('uuid');

module.exports = async function (app, con, config) {
  generateLicenseKey = function () {
    const seg = () => Math.random().toString(36).substring(2, 7).toUpperCase();
    return `SNTL-${seg()}-${seg()}-${seg()}-${seg()}`;
  };

  createLicense = function (userId, productId, orderItemId, callback) {
    const key = generateLicenseKey();
    const id = uuidv4();
    con.query(
      `INSERT INTO license_keys (id, order_item_id, product_id, user_id, \`key\`) VALUES (?, ?, ?, ?, ?)`,
      [id, orderItemId, productId, userId, key],
      function (err) {
        if (err) return callback(err, null);
        callback(null, key);
      }
    );
  };

  userOwnsProduct = function (userId, productId, callback) {
    con.query(
      `SELECT lk.id FROM license_keys lk
       WHERE lk.user_id = ? AND lk.product_id = ? AND lk.status = 'active'
       LIMIT 1`,
      [userId, productId],
      function (err, rows) {
        if (err) return callback(false);
        callback(rows.length > 0);
      }
    );
  };
};