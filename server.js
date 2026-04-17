import { WebSocketServer } from "ws";
import http from "http";
import url from "url";
import crypto from "crypto";

const PORT = process.env.PORT || 8080;
const clients = new Set();

const SECRET_KEY = process.env.ENCRYPTION_KEY;
if (!SECRET_KEY) {
  throw new Error("ENCRYPTION_KEY не установлен!");
}

const bannedWords = [
  "raided", "logs", "logging", "nameless", "hub",
  "discord", "everyone", "fuck", "shit"
];

function makeAesKey(secret) {
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

const AES_KEY = makeAesKey(SECRET_KEY);

function encryptData(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", AES_KEY, iv);

  const encrypted = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final()
  ]);

  return {
    encrypted: true,
    algorithm: "AES-CBC",
    iv: iv.toString("hex"),
    data: encrypted.toString("base64"),
    timestamp: Date.now()
  };
}

function containsBannedWords(text) {
  const lower = text.toLowerCase();
  for (const w of bannedWords) {
    if (lower.includes(w)) return true;
  }
  return false;
}

function safeJSON(text) {
  try { return JSON.parse(text); }
  catch { return null; }
}

function broadcast(obj) {
  const payload = JSON.stringify(obj);
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(payload, err => {
        if (err) console.log("WS send error:", err.message);
      });
    }
  }
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);

  if (req.method === "POST" && parsedUrl.pathname === "/sh") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      if (containsBannedWords(body)) {
        res.writeHead(200);
        return res.end("blocked\n");
      }

      const obj = safeJSON(body);
      if (!obj) {
        res.writeHead(400);
        return res.end("invalid json\n");
      }

      broadcast(encryptData(body));

      res.writeHead(200);
      res.end("ok\n");
    });
    return;
  }

  if (req.method === "GET" && parsedUrl.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("WebSocket encryption server running\n");
    return;
  }

  if (req.method === "GET" && parsedUrl.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      clients: clients.size,
      encryption: "AES-CBC"
    }));
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

const wss = new WebSocketServer({ server });

wss.on("connection", ws => {
  clients.add(ws);

  ws.on("message", data => {
    const text = data.toString();

    if (containsBannedWords(text)) return;

    const obj = safeJSON(text);
    if (!obj) return;

    broadcast(encryptData(text));
  });

  ws.on("close", () => clients.delete(ws));
  ws.on("error", () => clients.delete(ws));
});

server.listen(PORT, () => {
  console.log(`Server running at port ${PORT}`);
});
