import { WebSocketServer } from "ws";
import http from "http";
import url from "url";

const PORT = process.env.PORT || 8080;
const clients = new Set();

// 🔐 Секретный ключ
const SECRET_KEY = process.env.ENCRYPTION_KEY ||

// Предупреждение
if (!process.env.ENCRYPTION_KEY) {
  console.warn("⚠️ ENCRYPTION_KEY не установлен! Используется fallback ключ!");
}

// ❌ Запрещённые слова
const bannedWords = [
  "raided", "logs", "logging", "nameless", "hub",
  "discord", "everyone", "fuck", "shit"
];

// 🔐 Производим байты ключа один раз (экономия CPU)
const KEY_BYTES = Buffer.from(SECRET_KEY, "utf8");

// Быстрая XOR + Base64
function encryptData(text) {
  const textBytes = Buffer.from(text);
  const out = Buffer.allocUnsafe(textBytes.length);

  for (let i = 0, j = 0; i < textBytes.length; i++) {
    out[i] = textBytes[i] ^ KEY_BYTES[j] ^ (i & 255);
    if (++j >= KEY_BYTES.length) j = 0;
  }
  return out.toString("base64");
}

// Быстрая проверка запрещённых слов
function containsBannedWords(text) {
  const lower = text.toLowerCase();
  for (const w of bannedWords) {
    if (lower.includes(w)) return true;
  }
  return false;
}

// Безопасный JSON.parse
function safeJSON(text) {
  try { return JSON.parse(text); }
  catch { return null; }
}

// Формируем пакет шифрования
function encryptPacket(jsonString) {
  return {
    encrypted: true,
    data: encryptData(jsonString),
    timestamp: Date.now()
  };
}

// Общая безопасная WS-рассылка
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

// ---------------------- HTTP SERVER ----------------------
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);

  // POST /sh — входящий JSON → шифрование → broadcast
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

      const encryptedJSON = encryptPacket(body);
      broadcast(encryptedJSON);

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
      encryption: process.env.ENCRYPTION_KEY ? "enabled" : "fallback"
    }));
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

// ---------------------- WEBSOCKET SERVER ----------------------
const wss = new WebSocketServer({ server });

wss.on("connection", ws => {
  clients.add(ws);

  ws.on("message", data => {
    const text = data.toString();

    if (containsBannedWords(text)) return;

    const obj = safeJSON(text);
    if (!obj) return;

    broadcast(encryptPacket(text));
  });

  ws.on("close", () => {
    clients.delete(ws);
  });

  ws.on("error", () => {
    clients.delete(ws);
  });
});

// ---------------------- START ----------------------
server.listen(PORT, () => {
  console.log(`🚀 Server running at port ${PORT}`);
});
