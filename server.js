import { WebSocketServer } from "ws";
import http from "http";
import url from "url";
import crypto from "crypto";

const PORT = process.env.PORT || 8080;
const clients = new Set();

const SECRET_KEY = process.env.ENCRYPTION_KEY || "default-fallback-key-change-me";

if (!process.env.ENCRYPTION_KEY) {
  console.warn("⚠️  ВНИМАНИЕ: ENCRYPTION_KEY не установлен! Используется fallback ключ.");
}

const bannedWords = [
  "raided", "logs", "logging", "nameless", "hub",
  "discord", "everyone", "fuck", "shit"
];

// ------------------------
//  ШИФРОВАНИЕ
// ------------------------
function encryptData(text, key = SECRET_KEY) {
  const keyBytes = Buffer.from(key, 'utf8');
  const textBytes = Buffer.from(text, 'utf8');
  const encrypted = Buffer.alloc(textBytes.length);

  for (let i = 0; i < textBytes.length; i++) {
    encrypted[i] = textBytes[i] ^ keyBytes[i % keyBytes.length] ^ (i % 256);
  }

  return encrypted.toString('base64');
}

// ------------------------
//  JSON обработка
// ------------------------
function parsePseudoJSON(text) {
  try {
    const jsonText = text.replace(/'/g, '"');
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function containsBannedWordsInJSON(text) {
  const obj = parsePseudoJSON(text);
  if (!obj) return true;

  function check(obj) {
    if (typeof obj === "string") {
      return bannedWords.some(w => obj.toLowerCase().includes(w));
    } else if (typeof obj === "object" && obj !== null) {
      return Object.values(obj).some(value => check(value));
    }
    return false;
  }

  return check(obj);
}

// ------------------------
//  ОЧЕРЕДЬ СООБЩЕНИЙ WS
// ------------------------
function createQueue(ws) {
  ws._queue = [];

  ws._sendQ = function(data) {
    if (ws.readyState !== ws.OPEN) return;

    // если буфер переполнен — кладём в очередь
    if (ws.bufferedAmount > 0) {
      ws._queue.push(data);
      return;
    }

    ws.send(data, err => {
      if (err) {
        ws._queue.push(data);
      }
    });
  };

  ws._flushQ = function() {
    if (ws.readyState !== ws.OPEN) return;
    if (!ws._queue.length) return;
    if (ws.bufferedAmount > 0) return;

    const data = ws._queue.shift();
    ws.send(data, () => ws._flushQ());
  };
}

// ------------------------
//  HTTP сервер
// ------------------------
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);

  if (req.method === "POST" && parsedUrl.pathname === "/sh") {
    let body = "";

    req.on("data", chunk => {
      body += chunk.toString();
    });

    req.on("end", () => {
      const obj = parsePseudoJSON(body);
      if (!obj) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Ошибка: только JSON допустим\n");
        return;
      }

      if (containsBannedWordsInJSON(body)) {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("Сообщение содержит запрещённые слова. Не отправлено.\n");
        return;
      }

      const jsonString = JSON.stringify(obj);
      const encrypted = encryptData(jsonString);

      const payload = JSON.stringify({
        encrypted: true,
        data: encrypted,
        timestamp: Date.now()
      });

      for (const client of clients) {
        client._sendQ(payload);
      }

      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Зашифрованный JSON отправлен WebSocket клиентам\n");
    });

  } else if (req.method === "GET" && parsedUrl.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("WebSocket Server с шифрованием работает\n");

  } else if (req.method === "GET" && parsedUrl.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      clients: clients.size,
      encryption: process.env.ENCRYPTION_KEY ? "enabled" : "fallback"
    }));

  } else {
    res.writeHead(404);
    res.end("Not Found");
  }
});

// ------------------------
//  WebSocket сервер
// ------------------------
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  createQueue(ws);

  clients.add(ws);
  console.log("Клиент подключился. Всего:", clients.size);

  const flushInterval = setInterval(() => ws._flushQ(), 5);

  ws.on("message", (data) => {
    const text = data.toString();

    let obj = null;
    try { obj = JSON.parse(text); } catch { obj = parsePseudoJSON(text); }

    if (!obj) return;
    if (containsBannedWordsInJSON(text)) return;

    const jsonString = JSON.stringify(obj);
    const encrypted = encryptData(jsonString);

    const payload = JSON.stringify({
      encrypted: true,
      data: encrypted,
      timestamp: Date.now()
    });

    for (const client of clients) {
      client._sendQ(payload);
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    clearInterval(flushInterval);
    console.log("Клиент отключился. Осталось:", clients.size);
  });

  ws.on("error", (err) => {
    clients.delete(ws);
    clearInterval(flushInterval);
    console.log("Ошибка WS:", err.message);
  });
});

// ------------------------
server.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
