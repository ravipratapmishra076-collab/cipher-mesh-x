const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";
const ROOM_TTL = 60 * 60 * 1000;
const MAX_ROOMS = 2_000;
const MAX_SIGNAL_BYTES = 128 * 1024;
const rooms = new Map();

function headers(extra = {}) {
  return {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "cache-control": "no-store",
    ...extra
  };
}

function sendJson(res, status, body) {
  res.writeHead(status, headers({ "content-type": "application/json; charset=utf-8" }));
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_SIGNAL_BYTES) {
        reject(new Error("Signal is too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function roomCode() {
  return crypto.randomBytes(5).toString("base64url").toUpperCase().slice(0, 7);
}

function cleanExpiredRooms() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.createdAt > ROOM_TTL) rooms.delete(code);
  }
}

function serveApp(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname !== "/" && url.pathname !== "/index.html") {
    res.writeHead(404, headers({ "content-type": "text/plain; charset=utf-8" }));
    res.end("Not found");
    return;
  }
  fs.readFile(path.join(__dirname, "index.html"), (error, data) => {
    if (error) {
      res.writeHead(500, headers());
      res.end("Unable to load application");
      return;
    }
    res.writeHead(200, headers({ "content-type": "text/html; charset=utf-8" }));
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, service: "cipher-mesh-x", rooms: rooms.size });
    return;
  }

  try {
    if (req.method === "POST" && url.pathname === "/api/rooms") {
      cleanExpiredRooms();
      if (rooms.size >= MAX_ROOMS) {
        sendJson(res, 503, { error: "Signaling service is busy. Try again shortly." });
        return;
      }
      let code;
      do code = roomCode(); while (rooms.has(code));
      rooms.set(code, { createdAt: Date.now(), offer: null, answer: null });
      sendJson(res, 201, { code, expiresIn: ROOM_TTL });
      return;
    }

    const match = url.pathname.match(/^\/api\/rooms\/([A-Z0-9_-]{4,12})\/(offer|answer)$/);
    if (match) {
      const [, code, key] = match;
      const room = rooms.get(code);
      if (!room || Date.now() - room.createdAt > ROOM_TTL) {
        rooms.delete(code);
        sendJson(res, 404, { error: "Room not found or expired" });
        return;
      }
      if (req.method === "GET") {
        sendJson(res, 200, { signal: room[key] });
        return;
      }
      if (req.method === "POST") {
        const body = await readBody(req);
        if (!body.signal || typeof body.signal !== "object") throw new Error("A valid signal is required");
        room[key] = body.signal;
        sendJson(res, 200, { ok: true });
        return;
      }
    }
    serveApp(req, res);
  } catch (error) {
    sendJson(res, 400, { error: error.message || "Bad request" });
  }
});

setInterval(cleanExpiredRooms, 10 * 60 * 1000).unref();
server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Start with another port, e.g. PORT=8788 npm start`);
  } else {
    console.error(`Cipher Mesh X could not start: ${error.message}`);
  }
  process.exitCode = 1;
});

server.listen(port, host, () => console.log(`Cipher Mesh X running at http://${host}:${port}`));
