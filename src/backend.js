var figlet = require('figlet'), fs = require('fs');

module.exports = async function (app, con, config) {
  console.clear();
  await figlet.text("Val-EJS-Template", { font: "Standard", width: 700 }, function (e, data) {
    if (e) Logger(e, { title: "Figlet", color: "red" });
    Logger(data, { color: "blue", bold: true });
    Logger("———————————————————————————————————————————", { color: "blue", bold: true });
    Logger(`Version ${require('../package.json').version} | Created by ${require('../package.json').author}`, { title: "System", color: "blue" });
    Logger(`Server running on ${config.SiteInformation.Domain} (Port: ${config.SiteInformation.ProcessPort}) is now loaded & Online`, { title: "Server", color: "green" });
  });
  con.getConnection(function (e, c) {
    if (e) Logger(e.message, { title: "DB ERROR", color: "red", bold: true }), process.exit(1);
    Logger(`Successfully connected to MySQL database: ${config['SQLInformation'].Database}`, { title: "Database", color: "green" });
    c.release();
  });
  if (fs.existsSync('./src/utils')) {
    fs.readdirSync('./src/utils').forEach(function (f) {
      require(`./utils/${f}`)(app, con, config);
    });
  }
  if (fs.existsSync('./src/api')) {
    fs.readdirSync('./src/api').forEach(function (f) {
      require(`./api/${f}`)(app, con, config);
    });
  }
  if (fs.existsSync('./src/backend')) {
    fs.readdirSync('./src/backend').forEach(function (f) {
      require(`./backend/${f}`)(app, con, config);
    });
  }
  if (fs.existsSync('./src/pages')) {
    fs.readdirSync('./src/pages').forEach(function (f) {
      require(`./pages/${f}`)(app, con, config);
    });
  }
  app.use(function (e, req, res, next) {
    GetUserInfo(req, res, function (User, Settings) {
      res.status(500).render('utils/500', { Config: config, User, Settings, Error: e, });
    });
  });
}