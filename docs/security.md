# Security and privacy model

CareChaos has no accounts and handles no real health data. This page says exactly what is stored and who can touch it.

## What is stored

* **Experiment configurations** (name, scenario, seed, fault settings, operator actions) and a small computed summary. Nothing else.
* **Not stored:** event logs, readings, IPs, emails or any personal data. All readings are synthetic and regenerated from the seed on demand.

## Who can do what

* **Anonymous owner cookie.** The first time a browser saves an experiment it receives a random 128-bit `cc_owner` ID in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production, one year). The ID is never sent to clients in API responses.
* **History** (`/history`, `GET /api/experiments`) lists only experiments saved from your browser.
* **Edit and delete** are owner-only.
* **Reading** an experiment by its ID is public by design: that is what a share link is. IDs are unguessable but not secret. Do not put anything sensitive in an experiment name.
* Clearing cookies detaches you from your history; the experiments remain readable by link.

## Abuse controls

* Write endpoints are rate limited (30 per minute per IP, in memory, best effort per serverless instance).
* Configurations are validated with Zod and capped (2000 readings, 4 faults, 3600 s window). The engine runs in your browser, so there is no server-side compute loop to exhaust; the server replays a stored config only to compute a summary and reports.

## Honest limits

* Cookie ownership is not authentication. It protects against casual cross-user interference, not against someone who steals your cookie.
* The in-memory rate limiter does not coordinate across instances.
* "Sign in with GitHub" (OAuth) is on the roadmap for cross-device history.

## Reporting a vulnerability

See [SECURITY.md](../SECURITY.md).
