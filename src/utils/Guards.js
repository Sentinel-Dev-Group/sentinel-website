module.exports = async function (app, con, config) {
  requireAuth = function (req, res, next) {
    if (!req.isAuthenticated()) return res.redirect('/login');
    next();
  };

  requireAdmin = function (req, res, next) {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    if (!config.SiteInformation.OwnerIDS.includes(req.user.id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };

  requireAdminPage = function (req, res, next) {
    if (!req.isAuthenticated()) return res.redirect('/login');
    if (!config.SiteInformation.OwnerIDS.includes(req.user.id)) {
      return res.redirect('/');
    }
    next();
  };
};