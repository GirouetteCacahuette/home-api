# Write Operations stay unauthenticated; the network decides who can call them

Adding a tricount (`POST /budget/shared-expenses`) is the first Operation that writes to a private Upstream: it creates an account in Actual, and its sync writes transactions into it. ADR 0002 asked to revisit "no credentials" before this point. We keep it: write Operations check no credentials either, like every other Operation. What changes is how narrow the Home network is made: access will be restricted at the network layer, with Tailscale ACLs limiting which tailnet devices reach home-api, and Traefik routing to it only from the tailnet. An API key would still be friction in every Shortcut, and it would sit in plain text in those Shortcuts anyway.

This doesn't conflict with ADR 0002's "never expose home-api through a public reverse proxy". A Traefik router that only accepts tailnet traffic is not public: nothing outside the Home network can reach it. Putting home-api behind a public router, or opening the tailnet route to the internet (e.g. Tailscale Funnel), is still ruled out.

## Consequences

- Until those ACLs are in place, any device on the LAN or tailnet can create Actual accounts and write transactions through home-api.
- The UI at `/ui/` is served the same way and has the same reach as the Operations it calls.
- The Operations limit what a caller can do on their own: a write needs a fresh preview, re-validates everything server-side, and never takes Upstream details from the Client (ADR 0001).
