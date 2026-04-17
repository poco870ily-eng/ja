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

if (Buffer.byteLength(SECRET_KEY, "utf8") !== 32) {
  throw new Error("ENCRYPTION_KEY должен быть ровно 32 байта для AES-256-CBC");
}

const AES_KEY = Buffer.from(SECRET_KEY, "utf8");

function safeJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

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

function broadcast(obj) {
  const payload = JSON.stringify(obj);

  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(payload);
    }
  }
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);

  if (req.method === "POST" && parsedUrl.pathname === "/sh") {
    let body = "";

    req.on("data", chunk => {
      body += chunk;
    });

    req.on("end", () => {
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

  res.writeHead(404);
  res.end("Not Found");
});

const wss = new WebSocketServer({ server });

wss.on("connection", ws => {
  clients.add(ws);

  ws.on("message", data => {
    const text = data.toString();
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
