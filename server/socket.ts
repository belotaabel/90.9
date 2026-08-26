import { Server } from "socket.io";
import { advanceSelectingGame, callNextNumber, claimGameWinners, getActiveGame, persistSelectedCards, readGameState, type GameType } from "./db";
import type { BingoWinner } from "@shared/api";

type GameState = {
  gameId: string;
  calledNumbers: number[];
  currentBall: number | null;
  status: "waiting" | "active" | "complete";
  playerCount: number;
  prizeAmount: number;
  winners: BingoWinner[];
};

function toGameState(row: any): GameState {
  return {
    gameId: String(row.id),
    calledNumbers: row.called_numbers ?? [],
    currentBall: row.current_number ?? null,
    status: row.status === "finished" ? "complete" : row.status === "playing" ? "active" : "waiting",
    playerCount: Number(row.player_count ?? 0),
    prizeAmount: Number(row.prize_pool ?? 0),
    winners: (row.winners ?? []).map((winner: BingoWinner) => ({
      ...winner,
      userId: Number(winner.userId),
      cardNumber: Number(winner.cardNumber),
      prizeAmount: Number(winner.prizeAmount),
    })),
  };
}

export function registerGameSockets(io: Server, serviceMode: GameType = "90") {
  const activeGames = new Map<GameType, string>();
  const tickInProgress = new Set<GameType>();

  // Keep the transport room scoped to both mode and database game. This makes
  // the shared-round boundary explicit and prevents a relay/service from ever
  // mixing 90-ball and 75-ball subscribers.
  const roomFor = (gameType: GameType, gameId: string) => `game:${gameType}:${gameId}`;

  const broadcastState = async (gameType: GameType) => {
    const gameId = activeGames.get(gameType);
    if (!gameId) return;
    const row = await readGameState(gameId);
    if (row) io.to(roomFor(gameType, gameId)).emit("game:state", toGameState(row));
  };

  const advanceMode = async (gameType: GameType) => {
    if (tickInProgress.has(gameType)) return;
    tickInProgress.add(gameType);
    try {
      const transition = await advanceSelectingGame(gameType);
      if (transition?.started && transition.gameId === activeGames.get(gameType)) await broadcastState(gameType);
      const gameId = activeGames.get(gameType);
      if (!gameId) return;
      const activeState = await readGameState(gameId);
      if (activeState?.status !== "playing") return;
      const nextNumber = await callNextNumber(gameId, gameType);
      if (nextNumber !== null) {
        await claimGameWinners(gameId, gameType);
        await broadcastState(gameType);
      }
    } catch (error) {
      console.error(`Unable to advance ${gameType} bingo game`, error);
    } finally {
      tickInProgress.delete(gameType);
    }
  };

  const timer = setInterval(() => {
    void advanceMode(serviceMode);
  }, 2000);

  io.on("connection", (socket) => {
    socket.on("game:join", async ({ playerId, cardNumbers }: { playerId?: string | number; cardNumbers?: number[] }) => {
      try {
        const parsedPlayerId = Number(playerId);
        if (!Number.isSafeInteger(parsedPlayerId) || parsedPlayerId <= 0) {
          socket.emit("game:error", { message: "A valid Telegram player is required." });
          return;
        }
        const cards = Array.isArray(cardNumbers)
          ? [...new Set(cardNumbers.map(Number))].filter((card) => Number.isInteger(card) && card >= 1 && card <= 400).slice(0, 2)
          : [];
        if (!cards.length) {
          socket.emit("game:error", { message: "Select at least one bingo card before joining." });
          return;
        }
        const mode = serviceMode;
        // Lookup and persistence are transactional in the database. Passing the
        // user here also keeps the occupied-card view tied to this same shared
        // round before cards are locked/purchased.
        const game = await getActiveGame(mode, parsedPlayerId);
        const gameId = String(game.id);
        activeGames.set(mode, gameId);
        await persistSelectedCards(gameId, parsedPlayerId, cards, mode);
        const room = roomFor(mode, gameId);
        await socket.join(room);
        socket.data.gameId = gameId;
        socket.data.gameType = mode;
        socket.data.playerId = parsedPlayerId;
        if (!(game.called_numbers ?? []).length) await callNextNumber(gameId, mode);
        await broadcastState(mode);
      } catch (error) {
        const joinError = error instanceof Error ? error : new Error(String(error));
        console.error("Unable to join bingo game", { message: joinError.message, stack: joinError.stack, code: (error as { code?: string }).code });
        socket.emit("game:error", { message: `ጨዋታውን መቀላቀል አልተቻለም: ${joinError.message}` });
      }
    });

    const leaveGame = () => {
      const gameId = socket.data.gameId as string | undefined;
      const gameType = socket.data.gameType as GameType | undefined;
      if (gameId && gameType) void socket.leave(roomFor(gameType, gameId));
      socket.data.gameId = undefined;
      socket.data.gameType = undefined;
    };

    socket.on("game:leave", leaveGame);
    socket.on("disconnect", leaveGame);
  });

  return () => clearInterval(timer);
}
