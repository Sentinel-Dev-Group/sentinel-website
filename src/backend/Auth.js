const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;

module.exports = async function (app, con, config) {

  // ─── Local Strategy ───────────────────────────────────────

  passport.use(new LocalStrategy(
    { usernameField: 'username', passwordField: 'password' },
    function (username, password, done) {
      con.query(
        `SELECT * FROM users WHERE userEmail = ? OR userName = ? LIMIT 1`,
        [username, username],
        function (err, rows) {
          if (err)     return done(err);
          if (!rows[0]) return done(null, false, { message: 'No account found with those details.' });

          const user = rows[0];
          if (!user.password_hash) {
            return done(null, false, { message: 'This account uses social login. Please sign in with Discord, Google or GitHub.' });
          }

          bcrypt.compare(password, user.password_hash, function (err, match) {
            if (err || !match) return done(null, false, { message: 'Incorrect password.' });
            return done(null, { id: user.id, username: user.userName, email: user.userEmail, avatar: user.userImage });
          });
        }
      );
    }
  ));

  // POST /auth/local — local login
  app.post('/auth/local', function (req, res, next) {
    passport.authenticate('local', function (err, user, info) {
      if (err)   return next(err);
      if (!user) return res.redirect('/login?error=' + encodeURIComponent(info?.message || 'Login failed'));

      req.logIn(user, function (err) {
        if (err) return next(err);
        UpdateAccountLocal(req, res, user);
      });
    })(req, res, next);
  });

  // POST /auth/local/register
  app.post('/auth/local/register', async function (req, res) {
    const { username, email, password, confirmPassword } = req.body;

    if (!username || !email || !password) {
      return res.redirect('/login?error=' + encodeURIComponent('All fields are required.'));
    }
    if (password !== confirmPassword) {
      return res.redirect('/login?error=' + encodeURIComponent('Passwords do not match.'));
    }
    if (password.length < 8) {
      return res.redirect('/login?error=' + encodeURIComponent('Password must be at least 8 characters.'));
    }

    con.query(
      `SELECT id FROM users WHERE userEmail = ? OR userName = ? LIMIT 1`,
      [email, username],
      async function (err, rows) {
        if (rows && rows[0]) {
          return res.redirect('/login?error=' + encodeURIComponent('An account with that email or username already exists.'));
        }

        try {
          const hash   = await bcrypt.hash(password, 12);
          const id     = uuidv4();
          const date   = Math.floor(Date.now() / 1000);
          const avatar = '/img/placeholder.png';

          con.query(
            `INSERT INTO users (id, userName, userEmail, userImage, createdAt, ip, password_hash)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, username, email, avatar, date, req.clientIp, hash],
            function (err) {
              if (err) {
                Logger(err.message, { title: 'Auth', color: 'red' });
                return res.redirect('/login?error=' + encodeURIComponent('Registration failed. Please try again.'));
              }

              req.logIn({ id, username, email, avatar }, function (err) {
                if (err) return res.redirect('/login');
                res.redirect('/dashboard');
              });
            }
          );
        } catch (e) {
          Logger(e.message, { title: 'Auth', color: 'red' });
          res.redirect('/login?error=' + encodeURIComponent('Something went wrong.'));
        }
      }
    );
  });

  // ─── Google Strategy ──────────────────────────────────────

  passport.use(new GoogleStrategy(
    {
      clientID:     config.Tokens.GoogleClientID,
      clientSecret: config.Tokens.GoogleClientSecret,
      callbackURL:  config.SiteInformation.Domain + '/auth/google/callback',
    },
    function (accessToken, refreshToken, profile, done) {
      process.nextTick(function () {
        done(null, profile);
      });
    }
  ));

  app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
  );

  app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login' }),
    function (req, res) {
      UpdateAccountGoogle(req, res);
    }
  );

  // ─── GitHub Strategy ──────────────────────────────────────

  passport.use(new GitHubStrategy(
    {
      clientID:     config.Tokens.GitHubClientID,
      clientSecret: config.Tokens.GitHubClientSecret,
      callbackURL:  config.SiteInformation.Domain + '/auth/github/callback',
      scope:        ['user:email'],
    },
    function (accessToken, refreshToken, profile, done) {
      process.nextTick(function () {
        done(null, profile);
      });
    }
  ));

  app.get('/auth/github',
    passport.authenticate('github')
  );

  app.get('/auth/github/callback',
    passport.authenticate('github', { failureRedirect: '/login' }),
    function (req, res) {
      UpdateAccountGitHub(req, res);
    }
  );

  // ─── Account helpers ─────────────────────────────────────

  UpdateAccountLocal = function (req, res, user) {
    con.query(
      `UPDATE users SET ip = ?, userName = ? WHERE id = ?`,
      [req.clientIp, user.username, user.id],
      function () { res.redirect('/dashboard'); }
    );
  };

  UpdateAccountGoogle = function (req, res) {
    const profile = req.user;
    const email   = profile.emails?.[0]?.value || '';
    const avatar  = profile.photos?.[0]?.value || '/img/placeholder.png';
    const name    = profile.displayName || profile.username || 'User';

    con.query(
      `SELECT * FROM users WHERE google_id = ? OR userEmail = ? LIMIT 1`,
      [profile.id, email],
      function (err, rows) {
        if (rows && rows[0]) {
          // Update existing
          con.query(
            `UPDATE users SET google_id = ?, ip = ?, userName = ?, userImage = ? WHERE id = ?`,
            [profile.id, req.clientIp, rows[0].userName, avatar, rows[0].id],
            function () {
              req.user = { id: rows[0].id, username: rows[0].userName, email: rows[0].userEmail, avatar };
              res.redirect('/dashboard');
            }
          );
        } else {
          // Create new
          const id   = uuidv4();
          const date = Math.floor(Date.now() / 1000);
          con.query(
            `INSERT INTO users (id, userName, userEmail, userImage, createdAt, ip, google_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, name, email, avatar, date, req.clientIp, profile.id],
            function (err) {
              if (err) Logger(err.message, { title: 'Auth Google', color: 'red' });
              req.user = { id, username: name, email, avatar };
              res.redirect('/dashboard');
            }
          );
        }
      }
    );
  };

  UpdateAccountGitHub = function (req, res) {
    const profile = req.user;
    const email   = profile.emails?.[0]?.value || '';
    const avatar  = profile.photos?.[0]?.value || '/img/placeholder.png';
    const name    = profile.username || profile.displayName || 'User';

    con.query(
      `SELECT * FROM users WHERE github_id = ? OR userEmail = ? LIMIT 1`,
      [String(profile.id), email],
      function (err, rows) {
        if (rows && rows[0]) {
          con.query(
            `UPDATE users SET github_id = ?, ip = ?, userImage = ? WHERE id = ?`,
            [String(profile.id), req.clientIp, avatar, rows[0].id],
            function () {
              req.user = { id: rows[0].id, username: rows[0].userName, email: rows[0].userEmail, avatar };
              res.redirect('/dashboard');
            }
          );
        } else {
          const id   = uuidv4();
          const date = Math.floor(Date.now() / 1000);
          con.query(
            `INSERT INTO users (id, userName, userEmail, userImage, createdAt, ip, github_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, name, email, avatar, date, req.clientIp, String(profile.id)],
            function (err) {
              if (err) Logger(err.message, { title: 'Auth GitHub', color: 'red' });
              req.user = { id, username: name, email, avatar };
              res.redirect('/dashboard');
            }
          );
        }
      }
    );
  };
};