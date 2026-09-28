const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '0.0.0.0';
const clients = new Map();
const MAX_SIGNAL_BYTES = 1024 * 1024;
const peerKeyPattern = /^cmx-(?:[a-f0-9]{4}-){5}[a-f0-9]{4}$/;

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (req.method !== 'GET' || !['/', '/index.html', '/api/health'].includes(pathname)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }
  if (pathname === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({ ok: true, service: 'cipher-mesh-x', signaling: true }));
  }
  fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
    if (err) {
      res.writeHead(500);
      return res.end('Unable to load app');
    }
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()',
      'cache-control': 'no-store'
    });
    res.end(data);
  });
});

function sendFrame(socket, data, opcode = 0x1) {
  if (socket.destroyed || !socket.writable) return;
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data);
  let header;
  if (payload.length < 126) {
    header = Buffer.from([0x80 | opcode, payload.length]);
  } else if (payload.length <= 0xffff) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  socket.write(Buffer.concat([header, payload]));
}

function sendJson(socket, message) {
  sendFrame(socket, JSON.stringify(message));
}

function unregister(socket) {
  if (!socket.peerId) return;
  if (clients.get(socket.peerId) === socket) clients.delete(socket.peerId);
  socket.peerId = null;
}

function handleSignal(socket, raw) {
  let message;
  try {
    message = JSON.parse(raw.toString('utf8'));
  } catch {
    return sendJson(socket, { type: 'error', message: 'Invalid signaling message.' });
  }

  if (message.type === 'register') {
    if (typeof message.peerId !== 'string' || !peerKeyPattern.test(message.peerId)) {
      return sendJson(socket, { type: 'error', message: 'Invalid peer code.' });
    }
    unregister(socket);
    const previous = clients.get(message.peerId);
    if (previous && previous !== socket) {
      sendJson(previous, { type: 'error', message: 'This peer code connected in another tab.' });
      previous.end();
    }
    socket.peerId = message.peerId;
    clients.set(message.peerId, socket);
    sendJson(socket, { type: 'registered', peerId: socket.peerId });
    return;
  }

  if (!socket.peerId) return sendJson(socket, { type: 'error', message: 'Register a peer code first.' });
  if (message.type === 'ping') return sendJson(socket, { type: 'pong' });
  if (message.type === 'probe') {
    const online = typeof message.to === 'string' && peerKeyPattern.test(message.to) && clients.has(message.to);
    return sendJson(socket, { type: 'peer-status', peerId: message.to, online, requestId: message.requestId });
  }

  if (!['offer', 'answer', 'ice'].includes(message.type) ||
      typeof message.to !== 'string' || !peerKeyPattern.test(message.to)) {
    return sendJson(socket, { type: 'error', message: 'Unsupported signaling message.' });
  }
  const recipient = clients.get(message.to);
  if (!recipient || recipient.destroyed) {
    return sendJson(socket, { type: 'peer-offline', peerId: message.to });
  }
  sendJson(recipient, { ...message, from: socket.peerId });
}

server.on('upgrade', (req, socket) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const key = req.headers['sec-websocket-key'];
  if (pathname !== '/signal' || req.headers.upgrade?.toLowerCase() !== 'websocket' || !key) {
    socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    return socket.destroy();
  }
  const accept = crypto.createHash('sha1')
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64');
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '\r\n'
  ].join('\r\n'));

  let buffered = Buffer.alloc(0);
  let closed = false;
  const disconnect = () => {
    if (closed) return;
    closed = true;
    unregister(socket);
  };
  socket.on('close', disconnect);
  socket.on('end', disconnect);
  socket.on('error', disconnect);
  socket.on('data', chunk => {
    buffered = Buffer.concat([buffered, chunk]);
    while (buffered.length >= 2) {
      const first = buffered[0];
      const second = buffered[1];
      const opcode = first & 0x0f;
      const masked = Boolean(second & 0x80);
      let length = second & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (buffered.length < 4) return;
        length = buffered.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (buffered.length < 10) return;
        const largeLength = buffered.readBigUInt64BE(2);
        if (largeLength > BigInt(MAX_SIGNAL_BYTES)) return socket.destroy();
        length = Number(largeLength);
        offset = 10;
      }
      if (!masked || length > MAX_SIGNAL_BYTES) return socket.destroy();
      if (buffered.length < offset + 4 + length) return;
      const mask = buffered.subarray(offset, offset + 4);
      offset += 4;
      const payload = Buffer.from(buffered.subarray(offset, offset + length));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      buffered = buffered.subarray(offset + length);

      if (opcode === 0x8) {
        sendFrame(socket, payload, 0x8);
        socket.end();
        return;
      }
      if (opcode === 0x9) {
        sendFrame(socket, payload, 0xA);
        continue;
      }
      if (opcode !== 0x1) return socket.destroy();
      handleSignal(socket, payload);
    }
  });
});

server.listen(port, host, () => console.log(`Cipher Mesh X running at http://${host}:${port}`));
