CREATE DATABASE IF NOT EXISTS smart_production_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE smart_production_db;

CREATE TABLE IF NOT EXISTS users (
  user_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('ADMIN','SUPERVISOR','MANAGER') NOT NULL DEFAULT 'SUPERVISOR',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS products (
  product_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_code VARCHAR(60) NOT NULL UNIQUE,
  product_name VARCHAR(150) NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS machines (
  machine_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  machine_code VARCHAR(60) NOT NULL UNIQUE,
  machine_name VARCHAR(150) NOT NULL,
  status ENUM('RUNNING','IDLE','DOWN','MAINTENANCE') NOT NULL DEFAULT 'IDLE',
  location VARCHAR(150) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS shifts (
  shift_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  shift_name VARCHAR(80) NOT NULL UNIQUE,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS production_targets (
  target_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT UNSIGNED NOT NULL,
  machine_id BIGINT UNSIGNED NULL,
  shift_id BIGINT UNSIGNED NULL,
  target_date DATE NOT NULL,
  target_quantity INT UNSIGNED NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(product_id),
  FOREIGN KEY (machine_id) REFERENCES machines(machine_id) ON DELETE SET NULL,
  FOREIGN KEY (shift_id) REFERENCES shifts(shift_id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL,
  INDEX idx_targets_date (target_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS production_records (
  production_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT UNSIGNED NOT NULL,
  machine_id BIGINT UNSIGNED NOT NULL,
  shift_id BIGINT UNSIGNED NULL,
  supervisor_id BIGINT UNSIGNED NULL,
  production_date DATE NOT NULL,
  quantity_produced INT UNSIGNED NOT NULL DEFAULT 0,
  quantity_defective INT UNSIGNED NOT NULL DEFAULT 0,
  run_minutes INT UNSIGNED NULL,
  planned_minutes INT UNSIGNED NULL,
  notes TEXT NULL,
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(product_id),
  FOREIGN KEY (machine_id) REFERENCES machines(machine_id),
  FOREIGN KEY (shift_id) REFERENCES shifts(shift_id) ON DELETE SET NULL,
  FOREIGN KEY (supervisor_id) REFERENCES users(user_id) ON DELETE SET NULL,
  INDEX idx_production_date (production_date),
  INDEX idx_production_machine_date (machine_id, production_date),
  CONSTRAINT chk_defects_not_over_production CHECK (quantity_defective <= quantity_produced)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS downtime_events (
  downtime_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  machine_id BIGINT UNSIGNED NOT NULL,
  production_id BIGINT UNSIGNED NULL,
  started_at DATETIME NOT NULL,
  ended_at DATETIME NULL,
  reason VARCHAR(255) NOT NULL,
  notes TEXT NULL,
  reported_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (machine_id) REFERENCES machines(machine_id),
  FOREIGN KEY (production_id) REFERENCES production_records(production_id) ON DELETE SET NULL,
  FOREIGN KEY (reported_by) REFERENCES users(user_id) ON DELETE SET NULL,
  INDEX idx_downtime_started (started_at),
  INDEX idx_downtime_machine (machine_id)
) ENGINE=InnoDB;
