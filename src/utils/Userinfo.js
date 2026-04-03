module.exports = async function (app, con, config) {
  GetUserInfo = function (req, res, callback) {
    con.query(`SELECT * FROM settings LIMIT 1`, function (e, rows) {
      if (!req.isAuthenticated()) return callback({ loggedIn: false }, rows[0], false);
      con.query(`SELECT * FROM users WHERE id = ?`, [req.user.id], function (e, row) {
        if (!row[0]) return callback({ loggedIn: false }, rows[0], false);
        const isAdmin = config.SiteInformation.OwnerIDS.includes(req.user.id);
        return callback({ loggedIn: true, ...row[0] }, rows[0], isAdmin);
      });
    });
  };
  UpdateAccount = function (req, res) {
    con.query(`SELECT * FROM users WHERE id = ?`, [req.user.id], function (e, rows) {
      if (e) return res.redirect('/logout');
      if (!rows[0]) return CreateAccount(req, res);
      con.query(`UPDATE users SET ip = ?, userName = ? WHERE id = ?`, [req.clientIp, req.user.username, req.user.id], function () {
        return res.redirect('/');
      });
    });
  };
  CreateAccount = function (req, res) {
    var date = Math.floor(Date.now() / 1000), icon = req.user.avatar ? `https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png?size=512` : "/noimage.png";
    con.query(`INSERT INTO users (id, userName, userEmail, userImage, createdAt, ip) VALUES (?, ?, ?, ?, ?, ?)`, [req.user.id, req.user.username, req.user.email, icon, date, req.clientIp], function (e) {
      if (e) Logger(e.stack, { title: 'ERROR', color: 'red' });
      return res.redirect("/");
    });
  };
}