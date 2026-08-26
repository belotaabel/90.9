import type { RequestHandler } from "express";
import { getActiveGame, getCardCatalog } from "../db";
import { serviceMode } from "../index";

export const handleCardCatalog: RequestHandler = async (_req, res) => {
  try {
    const cards = await getCardCatalog(serviceMode === "gateway" ? "90" : serviceMode);
    return res.json(cards);
  } catch (error) {
    console.error("Unable to load bingo card catalog", error);
    return res.status(503).json({ error: "Bingo card catalog is unavailable." });
  }
};

export const handleGameInfo: RequestHandler = async (req, res) => {
  try {
    const gameType = req.query.gameType === "75" ? "75" : "90";
    return res.json(await getActiveGame(serviceMode === "gateway" ? gameType : serviceMode));
  } catch (error) {
    console.error("Unable to load active bingo game", error);
    return res.status(503).json({ error: "Game data is unavailable." });
  }
};
