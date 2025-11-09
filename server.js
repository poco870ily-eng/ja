import { WebSocketServer } from "ws";
import http from "http";
import url from "url";
import crypto from "crypto";

const PORT = process.env.PORT || 8080;
const clients = new Set();

// Секретный ключ для шифрования (измените на свой уникальный)
const SECRET_KEY = "MyUniqueSecretKey2024!@#$%";

// Список запрещённых слов
const bannedWords = [
  "raided", "logs", "logging", "nameless", "hub",
  "discord", "everyone", "fuck", "shit"
];

// Функция шифрования XOR + Base64
function encryptData(text, key = SECRET_KEY) {
  const keyBytes = Buffer.from(key, 'utf8');
  const textBytes = Buffer.from(text, 'utf8');
  const encrypted = Buffer.alloc(textBytes.length);
  
  for (let i = 0; i < textBytes.length; i++) {
    // XOR с циклическим использованием ключа + добавление индекса для усложнения
    encrypted[i] = textBytes[i] ^ keyBytes[i % keyBytes.length] ^ (i % 256);
  }
  
  // Конвертируем в base64
  return encrypted.toString('base64');
}

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
  if (!obj) return true;
  
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
      
      // Шифруем данные перед отправкой
      const jsonString = JSON.stringify(obj);
      const encrypted = encryptData(jsonString);
      
      // Создаем обёртку с меткой шифрования
      const payload = JSON.stringify({
        encrypted: true,
        data: encrypted,
        timestamp: Date.now()
      });
      
      // Рассылаем всем WebSocket клиентам
      for (const client of clients) {
        if (client.readyState === client.OPEN) {
          client.send(payload);
        }
      }
      
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Зашифрованный JSON отправлен WebSocket клиентам\n");
    });
  } else if (req.method === "GET" && parsedUrl.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("WebSocket Server с шифрованием работает\n");
  } else {
    res.writeHead(404);
    res.end("Not Found");
  }
});

// Создаем WebSocket сервер на основе HTTP
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log("Клиент подключился. Всего клиентов:", clients.size);
  
  ws.on("message", (data) => {
    try {
      const text = data.toString();
      console.log("Получено от клиента:", text);
      
      // Пытаемся распарсить как JSON
      let obj;
      try {
        obj = JSON.parse(text);
      } catch {
        obj = parsePseudoJSON(text);
      }
      
      if (!obj) {
        console.log("Невалидный JSON от клиента");
        return;
      }
      
      // Проверяем на запрещённые слова
      if (containsBannedWordsInJSON(text)) {
        console.log("Сообщение от клиента содержит запрещённые слова");
        return;
      }
      
      // Шифруем и рассылаем
      const jsonString = JSON.stringify(obj);
      const encrypted = encryptData(jsonString);
      
      const payload = JSON.stringify({
        encrypted: true,
        data: encrypted,
        timestamp: Date.now()
      });
      
      for (const client of clients) {
        if (client.readyState === ws.OPEN) {
          client.send(payload);
        }
      }
    } catch (err) {
      console.log("Ошибка обработки сообщения:", err);
    }
  });
  
  ws.on("close", () => {
    clients.delete(ws);
    console.log("Клиент отключился. Осталось клиентов:", clients.size);
  });
  
  ws.on("error", (err) => {
    clients.delete(ws);
    console.log("Ошибка WS:", err.message);
  });
});

server.listen(PORT, () => {
  console.log(`HTTP + WebSocket сервер с шифрованием запущен на порту ${PORT}`);
  console.log(`Используется XOR шифрование с динамическим ключом`);
});
