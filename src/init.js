var config = require('../config'), express = require('express'), ip = require('request-ip'), session = require('express-session');
var passport = require('passport'), mysql = require('mysql2'), MySQLStore = require('express-mysql-session')(session), app = express()
var DiscordStrategy = require('passport-discord-faxes').Strategy;

Logger = function (s, o) {
  let b = []
  if (o.color == 'red') o.color = '31';
  if (o.color == 'blue') o.color = '34';
  if (o.color == 'yellow') o.color = '33';
  if (o.color == 'green') o.color = '32';
  if (o.bold) b.push(`\x1b[1m`);
  if (o.color) b.push(`\x1b[${o.color}m`);
  if (o.title) b.push(`[${o.title}]: \x1b[0m`);
  console.log(`${b.join('')}${s}`);
};

con = mysql.createPool({
  host: config['SQLInformation'].Host,
  user: config['SQLInformation'].Username,
  password: config['SQLInformation'].Password || null,
  database: config['SQLInformation'].Database,
  charset: config['SQLInformation'].Charset || "utf8mb4",
  port: config['SQLInformation'].Port || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

app.use(express.static('public'));
app.use(express.static('src/static'));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', './src/views');
app.use(session({
  // key: 'PhilKey',
  secret: process.env.SESSION_SECRET || "1b1756ca-bf2c-4de2-9e99-b0b685580da4",
  resave: false,
  saveUninitialized: false,
  store: new MySQLStore({}, con),
  cookie: { maxAge: 31556952000 },
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(ip.mw());

app.listen(config['SiteInformation'].ProcessPort, function (e) {
  if (e) return Logger(e, { title: "Server", color: "red" });
  require(`./backend`)(app, con, config);
});

passport.serializeUser(function (user, done) {
  process.nextTick(function () {
    done(null, user);
  });
});
passport.deserializeUser(function (obj, done) {
  process.nextTick(function () {
    done(null, obj);
  });
});
passport.use(new DiscordStrategy({
  clientID: config.Tokens.OAuth2ClientID,
  clientSecret: config.Tokens.OAuth2ClientToken,
  callbackURL: config.SiteInformation.Domain + "/auth/discord/callback",
  scope: ['identify', 'email']
}, function (accessToken, refreshToken, profile, done) {
  process.nextTick(function () {
    done(null, profile);
  });
}));

app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), function (req, res) {
  UpdateAccount(req, res);
});

process.on('uncaughtException', function (e) {
  Logger(e.stack, { title: 'ERROR', color: 'red' });
});
process.on('unhandledRejection', function (e) {
  Logger(e.stack, { title: 'ERROR', color: 'red' });
});