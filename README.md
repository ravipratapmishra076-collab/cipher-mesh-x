# Cipher Mesh X

Cipher Mesh X is a browser-to-browser chat and file transfer prototype. The Node.js server serves the page and briefly routes WebRTC setup messages. Chat and file data travel over a direct WebRTC data channel; files are encrypted in AES-GCM chunks before they are sent.

## Run locally

```bash
npm start
```

Open <http://localhost:8787> in two browser profiles on the same computer. Click **Invite a friend** and share the link. The other person opens it and taps **Start chatting**; both pages must stay open while they connect. You can also add someone by pasting their peer code. For other devices, use an HTTPS deployment; browsers restrict Web Crypto on plain HTTP LAN addresses.

The app uses browser-native WebRTC and Web Crypto APIs, so it has no npm runtime dependencies. Deploy the Node server to a host that supports WebSocket upgrades; the signaling endpoint is `/signal`.

## File transfer

- File chunks are encrypted with a fresh AES-256-GCM key for each transfer. The key travels inside the WebRTC data channel, which is protected by DTLS.
- Up to four chunks are encrypted ahead of time. A 1 MB channel-buffer limit applies backpressure, keeping memory use bounded on the sender and avoiding a slow peer being overwhelmed.
- Chunk size is selected from the browser's negotiated WebRTC message limit, up to 256 KB.
- The receiver authenticates each chunk and offers a **Save received file** link when the complete file arrives.
- Received files up to 2 GB are accepted by the current browser implementation. Large received files require enough browser storage/memory.

## Network and security limits

The signaling service handles peer codes and WebRTC offer, answer, and ICE connection details. It does not receive chat text or file contents. The current build uses a public STUN server and has no TURN relay, so some restrictive networks may not establish a direct connection. Both peers must be online at the same time.

Peer codes are random 96-bit identifiers. Anyone who obtains a peer code can attempt to connect, so share it only with the intended person. This prototype does not authenticate WebRTC signaling with a long-term identity signature or verify the remote DTLS fingerprint. Traffic is encrypted in transit, but a compromised or malicious signaling service could attempt impersonation or a man-in-the-middle.

Contacts and the latest 200 chat messages are stored in this browser's local storage. No database is used for chat history: messages stay on this device, are not sent to or stored by the signaling server, and do not sync to other devices. Clearing this site's browser data removes the local history. Received files remain in the browser until the recipient saves them.
