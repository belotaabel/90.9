import "dotenv/config";
import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { handleTelegramWebhook } from "./routes/telegram";
import { handleMe, handleProfilePhoto } from "./routes/me";
import { handleCardCatalog, handleGameInfo } from "./routes/game";

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);
  app.post("/api/telegram/webhook", handleTelegramWebhook);
  app.get("/api/me", handleMe);
  app.get("/api/profile-photo/:telegramId", handleProfilePhoto);
  app.get("/api/game/cards", handleCardCatalog);
  app.get("/api/game", handleGameInfo);

  return app;
}
