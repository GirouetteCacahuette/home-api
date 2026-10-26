# Operations are grouped by intent, not by Upstream

Clients (mainly iOS Shortcuts) hard-code Operation URLs, so those URLs are effectively a permanent contract. We name and group Operations by what they do (`/dogs/{breed}/random`, later `/budget/...`, `/tasks/...`) rather than by the Upstream that fulfils them (`/dog-ceo/...`, `/actual/...`, `/vikunja/...`), so an Upstream can be replaced (dog.ceo shutting down, moving off Vikunja) without editing any Shortcut. The cost is that the URL no longer says which app sits behind it; the code and `/docs` carry that mapping.

## Considered Options

- **Group by Upstream:** rejected because swapping an Upstream would break every Shortcut that uses it.
- **Generic proxy (`POST /http/call` with a client-supplied URL):** rejected because the Client would need to know Upstream details, binary responses would be mangled into strings, and anything on the Home network could make the server call arbitrary hosts (SSRF).
