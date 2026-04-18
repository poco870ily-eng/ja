import { WebSocketServer } from "ws";
import http from "http";
import url from "url";

const PORT = process.env.PORT || 8080;
const clients = new Set();

function broadcastRaw(data, sender = null) {
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN && ws !== sender) {
      ws.send(data);
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
      broadcastRaw(body);

      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok\n");
    });

    return;
  }

  if (req.method === "GET" && parsedUrl.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("WebSocket relay server running\n");
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

const wss = new WebSocketServer({ server });

wss.on("connection", ws => {
  clients.add(ws);

  ws.on("message", data => {
    broadcastRaw(data.toString(), ws);
  });

  ws.on("close", () => {
    clients.delete(ws);
  });

  ws.on("error", () => {
    clients.delete(ws);
  });
});

server.listen(PORT, () => {
  console.log(`Server running at port ${PORT}`);
});
