-- GPS waypoints for mileage tracking
CREATE TABLE IF NOT EXISTS gps_waypoints (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  lat        DECIMAL(10,7) NOT NULL,
  lng        DECIMAL(10,7) NOT NULL,
  accuracy   FLOAT NULL,
  recorded_at TIMESTAMP NOT NULL,
  INDEX idx_user_date (user_id, recorded_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
