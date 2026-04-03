require('dotenv').config();

module.exports = {
  SiteInformation: {
    Domain: process.env.DOMAIN || "http://localhost:3000",
    ProcessPort: process.env.PORT || 3000,
    OwnerIDS: (process.env.OWNER_IDS || "1155551194337521726").split(",")
  },
  Tokens: {
    DiscordBotToken:     process.env.DISCORD_BOT_TOKEN,
    OAuth2ClientID:      process.env.DISCORD_CLIENT_ID,
    OAuth2ClientToken:   process.env.DISCORD_CLIENT_SECRET,
    GoogleClientID:      process.env.GOOGLE_CLIENT_ID,
    GoogleClientSecret:  process.env.GOOGLE_CLIENT_SECRET,
    GitHubClientID:      process.env.GITHUB_CLIENT_ID,
    GitHubClientSecret:  process.env.GITHUB_CLIENT_SECRET,
    StripeSecretKey:     process.env.STRIPE_SECRET_KEY,
    StripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    StripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  },
  SQLInformation: {
    Host:     process.env.DB_HOST     || "localhost",
    Username: process.env.DB_USER     || "root",
    Password: process.env.DB_PASSWORD || "",
    Database: process.env.DB_NAME     || "sentinel",
    Port:     process.env.DB_PORT     || 3306
  },
}