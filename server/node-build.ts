import path from "node:path";
import { createServer } from "./index";
import { registerTelegramWebhook } from "./routes/telegram";
import * as express from "express";
import { createServer as createHttpServer } from "node:http";
import { Server as SocketServer } from "socket.io";
import { registerGameSockets } from "./socket";
import { initializeDatabase } from "./db";

const app = createServer();
const port = process.env.PORT || 3000;

// In production, serve the built SPA files
const __dirname = import.meta.dirname;
const distPath = path.join(__dirname, "../spa");

// Serve static files
app.use(express.static(distPath));

// Handle React Router - serve index.html for all non-API routes
app.use((req, res) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith("/api/") || req.path.startsWith("/health")) {
    return res.status(404).json({ error: "API endpoint not found" });
  }

  res.sendFile(path.join(distPath, "index.html"));
});

const httpServer = createHttpServer(app);
const io = new SocketServer(httpServer, { cors: { origin: true, credentials: true } });
registerGameSockets(io);

httpServer.listen(port, () => {
  void initializeDatabase().catch((error) => {
    console.error("Neon database initialization failed", error instanceof Error ? { message: error.message, stack: error.stack, code: (error as { code?: string }).code } : error);
  });
  void registerTelegramWebhook().catch((error) => {
    console.error("Telegram webhook registration failed", error instanceof Error ? { message: error.message, stack: error.stack } : error);
  });
  console.log(`🚀 Fusion Starter server running on port ${port}`);
  console.log(`📱 Frontend: http://localhost:${port}`);
  console.log(`🔧 API: http://localhost:${port}/api`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 Received SIGTERM, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🛑 Received SIGINT, shutting down gracefully");
  process.exit(0);
});
