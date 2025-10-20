import { WebSocketServer } from "ws";
import http from "http";
import url from "url";

const PORT = process.env.PORT || 8080;
const clients = new Set();

// Список запрещённых слов (регистронезависимо)
const bannedWords = [
  "raided", "logs", "logging", "nameless", "hub",
  "discord", "everyone", "fuck", "shit"
];

// Преобразуем "псевдо-JSON" с одинарными кавычками в валидный JSON
function parsePseudoJSON(text) {
  try {
    const jsonText = text.replace(/'/g, '"');
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

// Проверка JSON на запрещённые слова рекурсивно
function containsBannedWordsInJSON(text) {
  const obj = parsePseudoJSON(text);
  if (!obj) return true; // если не разобралось — запрещаем

  function check(obj) {
    if (typeof obj === "string") {
      return bannedWords.some(word => obj.toLowerCase().includes(word));
    } else if (typeof obj === "object" && obj !== null) {
      return Object.values(obj).some(value => check(value));
    }
    return false;
  }

  return check(obj);
}

// Создаем HTTP сервер
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
        console.log("Сообщение содержит запрещённые слова. Игнорируем.");
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("Сообщение содержит запрещённые слова. Не отправлено.\n");
        return;
      }

      console.log("Получено через /sh:", obj);

      // Рассылаем всем WebSocket клиентам
      const message = JSON.stringify(obj); // всегда отправляем валидный JSON
      for (const client of clients) {
        if (client.readyState === client.OPEN) {
          client.send(message);
        }
      }

      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("JSON отправлен WebSocket клиентам\n");
    });
  } else {
    res.writeHead(404);
    res.end("Not Found");
  }
});

// Создаем WebSocket сервер на основе HTTP
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log("Клиент подключился");

  ws.on("message", (data) => {
    console.log("Получено от клиента:", data.toString());

    // Рассылаем всем WebSocket клиентам
    for (const client of clients) {
      if (client.readyState === ws.OPEN) {
        client.send(data.toString());
      }
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log("Клиент отключился");
  });

  ws.on("error", (err) => {
    clients.delete(ws);
    console.log("Ошибка WS:", err);
  });
});

server.listen(PORT, () => {
  console.log(`HTTP + WebSocket сервер запущен на порту ${PORT}`);
});
