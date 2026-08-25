import type { RequestHandler } from "express";
import { getActiveGame, getCardCatalog } from "../db";

export const handleCardCatalog: RequestHandler = async (req, res) => {
  try {
    const mode = req.query.mode === "75" ? "75" : "90";
    const cards = await getCardCatalog(mode);
    return res.json(cards);
  } catch (error) {
    console.error("Unable to load bingo card catalog", error);
    return res.status(503).json({ error: "Bingo card catalog is unavailable." });
  }
};

export const handleGameInfo: RequestHandler = async (_req, res) => {
  try {
    return res.json(await getActiveGame());
  } catch (error) {
    console.error("Unable to load active bingo game", error);
    return res.status(503).json({ error: "Game data is unavailable." });
  }
};
