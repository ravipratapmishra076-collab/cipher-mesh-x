# Cipher Mesh X

Cipher Mesh X is a local-first browser messenger with private chats, status updates, and file transfer. Chat history, contacts, queued messages, and statuses are saved in the current browser. Messages can wait on the sender's device and are sent directly when both peers reconnect. The Node.js server serves the page and briefly routes WebRTC setup messages; it does not store chat content. Files are encrypted in AES-GCM chunks before they are sent.

## Run locally

```bash
npm start
```

Open <http://localhost:8787> in two browser profiles on the same computer. Click **Invite a friend** and share the link. The other person opens it and connects with your invite; both pages must be open to establish a direct connection. If a peer is offline, text messages wait in local browser storage and send when both apps are online again. The sender app must remain open or be reopened so it can reconnect and deliver the queue. You can also add someone by pasting their peer code. For other devices, use an HTTPS deployment; browsers restrict Web Crypto on plain HTTP LAN addresses.

The app uses browser-native WebRTC and Web Crypto APIs, so it has no npm runtime dependencies. Deploy the Node server to a host that supports WebSocket upgrades; the signaling endpoint is `/signal`.

## Status and media

Status updates are stored in each browser and expire after 24 hours. They are shared directly with a peer when the data channel is open, and again when the peer reconnects. Both people must be online to exchange an update. Photos and other files use the chunked, encrypted transfer flow; image files also appear as previews in the active chat. Chat history keeps the file name, while the preview itself remains in memory for the current page session.

## Deploy on Render

Use the included render.yaml Blueprint to create or configure this project as a **Web Service**. In Render, choose **New → Blueprint** and select the Git repository containing this file. This project needs the Node server for both the page and WebSocket signaling; a static-site deployment will not work.

The Blueprint runs **npm install** and **npm start**, and checks **/api/health**. The WebSocket signaling endpoint is **/signal**. The server reads Render's **PORT** environment variable and binds to **0.0.0.0**; locally it defaults to port 8787. Use the Render HTTPS URL so browsers allow Web Crypto, WebRTC, and secure WebSocket connections. Render supports WebSocket connections on web services. If you connect the service to a Git branch with auto-deploy enabled, pushing a commit to that branch deploys the latest version.

## Local profile screen

The sign-in screen stores a display name in this browser. It does not use a password or an online account, so it is a profile prompt rather than account authentication. Peer identity and chat history remain local to the browser. Browser local storage is not encrypted at rest; protect access to the device and browser profile.

## File transfer

- File chunks are encrypted with a fresh AES-256-GCM key for each transfer. The key travels inside the WebRTC data channel, which is protected by DTLS.
- Up to four chunks are encrypted ahead of time. A 1 MB channel-buffer limit applies backpressure, keeping memory use bounded on the sender and avoiding a slow peer being overwhelmed.
- Chunk size is selected from the browser's negotiated WebRTC message limit, up to 256 KB.
- The receiver authenticates each chunk and offers a **Save received file** link when the complete file arrives.
- Received files up to 2 GB are accepted by the current browser implementation. Large received files require enough browser storage/memory.

## Network and security limits

The signaling service handles peer codes and WebRTC offer, answer, and ICE connection details. It does not receive chat text or file contents. The current build uses a public STUN server and has no TURN relay, so some restrictive networks may not establish a direct connection. Queued messages remain on the sender's device until both apps are online; this browser app does not relay messages while both devices are offline. It does not currently support Briar's Tor, Bluetooth, local Wi-Fi, or removable-media transports.

Peer codes are random 96-bit identifiers. Anyone who obtains a peer code can attempt to connect, so share it only with the intended person. This prototype does not authenticate WebRTC signaling with a long-term identity signature or verify the remote DTLS fingerprint. Traffic is encrypted in transit, but a compromised or malicious signaling service could attempt impersonation or a man-in-the-middle.

Contacts and the latest 200 chat messages are stored in this browser's local storage. Unsent messages wait on this device and are sent when a peer connection becomes available. No database is used for chat history: messages are not sent to or stored by the signaling server. Clearing this site's browser data removes the local history and queued messages. Received files remain in the browser until the recipient saves them.
