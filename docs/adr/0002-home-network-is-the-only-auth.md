# Being on the Home network is the only authorisation

home-api is reachable only from the LAN and the Tailscale tailnet, and it deliberately checks no credentials: no API key, no tokens. It's a single-user tool, the only Operation today is read-only and public (random dog image), and a key would add friction to every Shortcut for little gain. The reader should not "fix" this by accident, and should not expose home-api through a public reverse proxy.

## Consequences

- Any device on the LAN or tailnet (IoT gadgets, guests on the Wi-Fi, shared tailnet nodes) can call every Operation.
- Revisit this decision before adding the first Operation that writes to a private Upstream (e.g. adding a transaction in Actual or creating a task in Vikunja).
