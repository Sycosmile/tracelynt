-- Short-lived server-side OIDC login transactions prevent state/nonce/PKCE
-- material from being stored in browser storage or application logs.
CREATE TABLE oidc_login_transactions (
  state_hash bytea PRIMARY KEY CHECK (octet_length(state_hash) = 32),
  browser_binding_hash bytea NOT NULL CHECK (octet_length(browser_binding_hash) = 32),
  nonce text NOT NULL CHECK (length(nonce) BETWEEN 16 AND 256),
  pkce_verifier text NOT NULL CHECK (length(pkce_verifier) BETWEEN 43 AND 128),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > created_at)
);
CREATE INDEX oidc_login_transactions_expiry_idx ON oidc_login_transactions (expires_at);
