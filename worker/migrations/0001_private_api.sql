CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('seminars', 'bookings')),
  origin TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);

CREATE TABLE login_limits (
  key TEXT PRIMARY KEY,
  window INTEGER NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts > 0)
);
CREATE INDEX login_limits_window ON login_limits(window);

CREATE TABLE reservations (
  id TEXT PRIMARY KEY,
  room TEXT NOT NULL CHECK (room IN ('reunion', 'reunion-bis', 'visio-cafe', 'visio-couloir')),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL CHECK (end_ms > start_ms AND end_ms - start_ms <= 86400000),
  created_at TEXT NOT NULL
);
CREATE INDEX reservations_room_time ON reservations(room, start_ms, end_ms);
CREATE INDEX reservations_time ON reservations(start_ms, end_ms);

-- The overlap check and insert run within the same SQLite write statement.
-- Adjacent bookings are allowed; concurrent conflicting inserts cannot pass.
CREATE TRIGGER reservations_no_overlap_insert
BEFORE INSERT ON reservations
WHEN EXISTS (
  SELECT 1 FROM reservations
  WHERE room = NEW.room AND start_ms < NEW.end_ms AND end_ms > NEW.start_ms
)
BEGIN
  SELECT RAISE(ABORT, 'reservation_overlap');
END;

CREATE TRIGGER reservations_no_overlap_update
BEFORE UPDATE OF room, start_ms, end_ms ON reservations
WHEN EXISTS (
  SELECT 1 FROM reservations
  WHERE id <> NEW.id AND room = NEW.room
    AND start_ms < NEW.end_ms AND end_ms > NEW.start_ms
)
BEGIN
  SELECT RAISE(ABORT, 'reservation_overlap');
END;
