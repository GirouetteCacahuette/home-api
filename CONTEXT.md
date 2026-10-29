# home-api

A personal API that exposes simple, purpose-built operations over public services and self-hosted apps, so they can be triggered with a single HTTP call.

## Language

**Client**:
Whatever calls home-api: mainly iOS Shortcuts, sometimes a browser. It talks only to home-api and never directly to the services behind it.
_Avoid_: Consumer, caller, user

**Home network**:
The user's LAN plus their Tailscale tailnet: the only place home-api can be reached from. Being on the Home network is what authorises a Client; there is no other credential.
_Avoid_: Internal network, intranet, private network

**Operation**:
One named thing a Client can ask home-api to do, such as "get a random pug image". Which upstream service it calls, the credentials it uses and the shape of its response are fixed on the server, never supplied by the Client.
_Avoid_: Endpoint, action, proxy call

**Shared expense**:
A group of expenses shared with other people, such as a tricount, synced into one Actual account that holds only the user's share. Adding one creates that account and saves the group to the tricount list; the logic lives in the tricount-actual-sync library.
_Avoid_: Tricount (for the concept; it is one kind), group, split

**UI**:
The static page home-api serves at `/ui/` for flows that need a person in the loop, such as adding a shared expense. It is a Client like any other: it only calls Operations and holds no logic of its own beyond display and validation hints.
_Avoid_: Frontend, web app, dashboard

**Upstream**:
The public or self-hosted service an Operation relies on to do its work (e.g. dog.ceo, Actual Budget, Vikunja). Operations are named and grouped by intent ("dogs", "budget", "tasks"), not by Upstream, so the Upstream can be swapped without the Client noticing.
_Avoid_: Backend, integration, service, provider
