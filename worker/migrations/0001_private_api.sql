CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role = 'seminars'),
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
