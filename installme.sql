-- ============================================================
--  Sentinel Development — Full Database Schema
--  Run this on a fresh MySQL database
-- ============================================================

-- Settings (site branding)
CREATE TABLE settings (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  color VARCHAR(7) NOT NULL,
  dest TEXT NOT NULL,
  logo VARCHAR(255) NOT NULL,
  footer TEXT,
  PRIMARY KEY (id)
);

-- Users (supports local + Discord + Google + GitHub OAuth)
CREATE TABLE users (
  id CHAR(36) NOT NULL,
  userName TEXT NOT NULL,
  userImage TEXT NOT NULL,
  userEmail TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  ip VARCHAR(45),
  role ENUM('user','admin') DEFAULT 'user',
  password_hash TEXT NULL,
  google_id VARCHAR(100) NULL,
  github_id VARCHAR(100) NULL,
  PRIMARY KEY (id)
);

-- Product categories (Minecraft / DayZ)
CREATE TABLE categories (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  icon VARCHAR(50),
  PRIMARY KEY (id)
);

-- Products
CREATE TABLE products (
  id CHAR(36) NOT NULL,
  category_id INT,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  images JSON,
  active BOOLEAN DEFAULT TRUE,
  featured BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- Downloadable files attached to a product
CREATE TABLE product_files (
  id CHAR(36) NOT NULL,
  product_id CHAR(36) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  storage_path TEXT NOT NULL,
  version VARCHAR(50),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Orders
CREATE TABLE orders (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  stripe_payment_id VARCHAR(255) UNIQUE,
  total DECIMAL(10,2) NOT NULL,
  status ENUM('pending','completed','refunded') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Line items inside an order (one row per product purchased)
CREATE TABLE order_items (
  id CHAR(36) NOT NULL,
  order_id CHAR(36) NOT NULL,
  product_id CHAR(36) NOT NULL,
  price_paid DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- License keys (one generated per order_item)
CREATE TABLE license_keys (
  id CHAR(36) NOT NULL,
  order_item_id CHAR(36) NULL,
  product_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  `key` VARCHAR(64) NOT NULL UNIQUE,
  status ENUM('active','suspended','expired') DEFAULT 'active',
  hwid VARCHAR(255) NULL,
  uses INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE SET NULL,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ============================================================
--  Seed Data
-- ============================================================

INSERT INTO settings (name, color, dest, logo, footer) VALUES (
  'Sentinel Development',
  '#06b6d4',
  'Premium Minecraft plugins and DayZ mods for serious server owners.',
  '/logo.png',
  '© 2025 Sentinel Development • Built for the community'
);

INSERT INTO categories (name, slug, description, icon) VALUES
  ('Minecraft Plugins', 'minecraft', 'Premium plugins for Spigot, Paper and Purpur servers.', 'fa-cube'),
  ('DayZ Mods',        'dayz',      'High-quality mods for DayZ standalone servers.',          'fa-biohazard');