# Security and privacy model

CareChaos has no accounts and handles no real health data. This page says exactly what is stored and who can touch it.

## What is stored

* **Experiment configurations** (name, scenario, seed, fault settings, operator actions) and a small computed summary. Nothing else.
* **Not stored:** event logs, readings, IPs, emails or any personal data. All readings are synthetic and regenerated from the seed on demand.

## Who can do what

* **Anonymous owner cookie.** The first time a browser saves an experiment it receives a random 128-bit `cc_owner` ID in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production, one year). The ID is never sent to clients in API responses.
* **GitHub sign-in (optional).** When configured, signing in sets a signed `cc_session` cookie (HMAC-SHA256, 30 days). Your owner ID becomes `gh:<numeric id>` and experiments saved from the current browser are moved to it. The OAuth access token is discarded after the profile read; only the numeric ID and login are kept. Forged or expired session cookies are ignored and the browser falls back to anonymous.
* **History** (`/history`, `GET /api/experiments`) lists only experiments owned by your browser or GitHub account.
* **Edit and delete** are owner-only.
* **Reading** an experiment by its ID is public by design: that is what a share link is. IDs are unguessable but not secret. Do not put anything sensitive in an experiment name.
* Clearing cookies detaches you from your history; the experiments remain readable by link.

## Abuse controls

* Write endpoints are rate limited (30 per minute per IP, in memory, best effort per serverless instance).
* Configurations are validated with Zod and capped (2000 readings, 4 faults, 3600 s window). The engine runs in your browser, so there is no server-side compute loop to exhaust; the server replays a stored config only to compute a summary and reports.

## Honest limits

* Cookie ownership is not authentication. It protects against casual cross-user interference, not against someone who steals your cookie.
* The in-memory rate limiter does not coordinate across instances.
* The OAuth flow requests no scopes, uses a one-time `state` cookie checked in constant time, and has no refresh tokens.

## Reporting a vulnerability

See [SECURITY.md](../SECURITY.md).
