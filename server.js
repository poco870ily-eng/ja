import { WebSocketServer } from "ws";
import http from "http";
import url from "url";

const PORT = process.env.PORT || 8080;
const clients = new Set();

// Создаем HTTP сервер
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);

  if (req.method === "POST" && parsedUrl.pathname === "/sh") {
    let body = "";
    req.on("data", chunk => {
      body += chunk.toString();
    });
    req.on("end", () => {
      console.log("Получено через /sh:", body);

      // Рассылаем всем WebSocket клиентам
      for (const client of clients) {
        if (client.readyState === client.OPEN) {
          client.send(body);
        }
      }

      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Данные отправлены WebSocket клиентам\n");
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
