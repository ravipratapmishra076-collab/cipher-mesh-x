# Cipher Mesh X

Cipher Mesh X is a privacy-first, browser-based peer-to-peer chat and file-sharing MVP. It uses WebRTC for direct transport and derives an AES-256-GCM key in each browser using ECDH. The Node service only holds short-lived WebRTC connection signals; it never receives messages or file contents.

## Run locally

```bash
npm start
```

Open `http://127.0.0.1:8787` in two browser windows. In one window create a room and share its code with the other window, then join the room.

## What works

- Temporary room-code signaling, automatically removed after one hour
- Manual signal exchange as a fallback
- Direct encrypted chat
- Direct encrypted file transfer with live progress and recipient-side download
- Responsive, single-page interface
- Server-side request limits, strict static-file routing, and basic security headers

## Important deployment notes

WebRTC needs HTTPS in production. A public deployment should also configure a TURN relay (such as coturn) in `index.html`; STUN alone cannot connect peers behind every network or corporate firewall. For a public service, add rate limiting at the reverse proxy, observability, abuse controls, and an independent security review before describing it as production-grade or anonymous.
