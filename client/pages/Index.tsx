import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Bell,
  Home,
  MoreVertical,
  Star,
  Users,
  Wallet,
} from "lucide-react";
import { io } from "socket.io-client";
import type { BingoWinner } from "@shared/api";

type Cell = number | null;
type Card = { card_number: number; rows: Cell[][] };
type User = {
  id: number;
  telegram_id: string | number;
  username: string | null;
  display_name: string;
  balance: number | string;
};
type GameType = "90" | "75";
type GameState = {
  calledNumbers: number[];
  currentBall: number | null;
  playerCount: number;
  prizeAmount: number;
  status: string;
  winners: BingoWinner[];
};
declare global {
  interface Window {
    Telegram?: { WebApp?: { initData?: string; ready?: () => void } };
  }
}

function CardView({
  card,
  selected,
  called,
  onClick,
  gameType = "90",
}: {
  card: Card;
  selected: boolean;
  called: Set<number>;
  onClick: () => void;
  gameType?: GameType;
}) {
  return (
    <article
      className={`ticket-card ${selected ? "selected" : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
    >
      <header className="ticket-title">
        <span>✦ {gameType} BINGO</span>
        <b>#{card.card_number}</b>
      </header>
      {gameType === "75" && (
        <div className="ticket-columns" aria-hidden="true">
          {['B', 'I', 'N', 'G', 'O'].map((letter) => <b key={letter}>{letter}</b>)}
        </div>
      )}
      <div className="ticket-grid">
        {card.rows.flatMap((row, rowIndex) =>
          row.map((number, columnIndex) => (
            <span
              key={`${rowIndex}-${columnIndex}`}
              className={number === 0 || (number !== null && called.has(number)) ? "marked" : ""}
            >
              {number === 0 ? "FREE" : number}
            </span>
          )),
        )}
      </div>
      {selected && <small>✓ የተመረጠ</small>}
    </article>
  );
}

export default function Index() {
  const [screen, setScreen] = useState<"landing" | "selection">("landing");
  const [gameType, setGameType] = useState<GameType>("90");
  const [user, setUser] = useState<User | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [selected, setSelected] = useState<number[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("neon-90-selected-cards") ?? "[]");
      return Array.isArray(saved) ? saved.filter((id): id is number => Number.isInteger(id) && id >= 1 && id <= 400).slice(0, 2) : [];
    } catch {
      return [];
    }
  });
  const [called, setCalled] = useState<Set<number>>(new Set());
  const [currentBall, setCurrentBall] = useState<number | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [countdown, setCountdown] = useState<number | null>(20);
  const [playing, setPlaying] = useState(false);
  const [notice, setNotice] = useState("ካርዶች እየተጫኑ ነው...");
  const [panel, setPanel] = useState<"profile" | "wallet" | null>(null);
  useEffect(() => {
    const key = `neon-${gameType}-selected-cards`;
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "[]");
      setSelected(
        Array.isArray(saved)
          ? saved.filter((id): id is number => Number.isInteger(id) && id >= 1 && id <= 400).slice(0, 2)
          : [],
      );
    } catch {
      setSelected([]);
    }
  }, [gameType]);
  useEffect(() => {
    localStorage.setItem(`neon-${gameType}-selected-cards`, JSON.stringify(selected));
  }, [selected, gameType]);
  const initData =
    window.Telegram?.WebApp?.initData ||
    new URLSearchParams(window.location.hash.replace(/^#/, "")).get(
      "tgWebAppData",
    ) ||
    new URLSearchParams(window.location.search).get("tgWebAppData") ||
    "";

  useEffect(() => {
    window.Telegram?.WebApp?.ready?.();
    if (!initData) {
      setNotice("ጨዋታውን ለመጫወት Telegram ውስጥ ይክፈቱ።");
      return;
    }
    fetch("/api/me", { headers: { "x-telegram-init-data": initData } })
      .then(async (r) => {
        if (!r.ok)
          throw new Error(
            r.status === 401
              ? "Telegram authentication አልተረጋገጠም።"
              : "Telegram authentication ላይ ስህተት ተፈጥሯል።",
          );
        setUser(await r.json());
      })
      .catch((e) => setNotice(e.message));
  }, [initData]);
  useEffect(() => {
    fetch(`/api/game/cards?mode=${gameType}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Card catalog unavailable");
        setCards(await r.json());
        setNotice("");
      })
      .catch((e) => setNotice(e.message));
  }, [gameType]);
  useEffect(() => {
    if (playing || countdown === null || countdown <= 0) return;
    const timer = window.setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown, playing]);
  useEffect(() => {
    if (countdown === 0) {
      if (screen !== "selection") {
        setCountdown(20);
        return;
      }
      if (selected.length) {
        setPlaying(true);
        setCountdown(null);
      } else {
        setCountdown(20);
        setNotice("");
      }
    }
  }, [countdown, selected.length]);
  useEffect(() => {
    if (!playing || !user) return;
    const socket = io({ transports: ["polling", "websocket"], upgrade: false });
    socket.on("connect", () => {
      setNotice("");
      socket.emit("game:join", { playerId: user.id, cardNumbers: selected, gameType });
    });
    socket.on("connect_error", () => setNotice("የጨዋታ ሰርቨር አይገናኝም።"));
    socket.on("game:error", (e: { message?: string }) =>
      setNotice(e.message || "ወደ ጨዋታው መግባት አልተቻለም።"),
    );
    socket.on("game:state", (state: GameState) => {
      setGame(state);
      setCalled(new Set(state.calledNumbers));
      setCurrentBall(state.currentBall);
    });
    return () => {
      socket.emit("game:leave");
      socket.disconnect();
    };
  }, [playing, user, selected, gameType]);
  const cardIdentifiers = useMemo(
    () => Array.from({ length: 400 }, (_, index) => index + 1),
    [],
  );
  const cardForId = (id: number) =>
    cards.find((card) => card.card_number === id) ??
    (gameType === "75" ? cards.find((card) => card.card_number === id + 400) : undefined);
  const toggle = (id: number) =>
    setSelected((old) =>
      old.includes(id)
        ? old.filter((x) => x !== id)
        : old.length < 2
          ? [...old, id]
          : old,
    );
  const start = () => {
    if (!user) return setNotice("Telegram authentication is required.");
    if (!selected.length) return setNotice("");
    setCountdown(5);
    setNotice("ጨዋታው ይጀምራል...");
  };
  const winningLines = (card: Card | undefined) => {
    if (!card) return [];
    const complete = (values: Cell[]) =>
      values.every((cell) => cell === null || cell === 0 || called.has(cell));
    const rows = card.rows
      .map((row, index) => (complete(row) ? index + 1 : null))
      .filter((line): line is number => line !== null);
    if (gameType === "90") return rows;

    const columns = card.rows[0]
      ?.map((_, columnIndex) =>
        complete(card.rows.map((row) => row[columnIndex])) ? columnIndex + 6 : null,
      )
      .filter((line): line is number => line !== null) ?? [];
    const diagonals = [
      complete(card.rows.map((row, index) => row[index])) ? 11 : null,
      complete(card.rows.map((row, index) => row[4 - index])) ? 12 : null,
    ].filter((line): line is number => line !== null);
    const corners = [card.rows[0]?.[0], card.rows[0]?.[4], card.rows[4]?.[0], card.rows[4]?.[4]]
      .every((cell) => cell !== undefined && (cell === 0 || called.has(cell)));
    return [...rows, ...columns, ...diagonals, ...(corners ? [13] : [])];
  };
  const winners = game?.winners ?? [];
  const winner = winners.length > 0;
  const winnerCardIds = winners.map((winner) => winner.cardNumber);
  const winnerCardId = winnerCardIds[0] ?? null;
  useEffect(() => {
    if (!winner || !playing) return;
    const resetTimer = window.setTimeout(() => {
      setPlaying(false);
      setScreen("selection");
      setGame(null);
      setCalled(new Set());
      setCurrentBall(null);
      setSelected([]);
      setCountdown(20);
      setNotice("");
    }, 5000);
    return () => window.clearTimeout(resetTimer);
  }, [winner, playing]);
  const winningRows = winningLines(cardForId(winnerCardId ?? -1));
  if (screen === "landing")
    return (
      <main className="app-shell landing-shell">
        <div className="landing-glow landing-glow-one" />
        <div className="landing-glow landing-glow-two" />
        <section className="landing-content">
          <span className="landing-kicker">WELCOME TO</span>
          <h2>
            <span>NEON</span> <strong>90</strong>
            <br />
            <em>BINGO</em>
          </h2>
          <p>{gameType === "90" ? "የ90" : "የ75"} ቢንጎ ጨዋታን ይጫወቱ።</p>
          <div className="mode-choice"><button onClick={() => setGameType("90")} className={gameType === "90" ? "active" : ""}>90 Bingo</button><button onClick={() => setGameType("75")} className={gameType === "75" ? "active" : ""}>75 Bingo</button></div>
          <div className="landing-highlights">
            <span>400 ካርዶች</span>
            <i /> <span>እስከ 2 ካርዶች</span>
            <i /> <span>{gameType} ቁጥሮች</span>
          </div>
        </section>
        <button
          className="landing-start"
          onClick={() => {
            setScreen("selection");
            setNotice("ካርድዎን ይምረጡ። ቀሪው ጊዜ ሲያልቅ ጨዋታው ይጀምራል።");
          }}
        >
          ጨዋታ ጀምር <b>→</b>
        </button>
        <small className="landing-note">ካርድዎን ለመምረጥ ይቀጥሉ</small>
      </main>
    );
  if (playing)
    return (
      <main className="app-shell">
        <header className="topbar">
          <button
            className="icon-button"
            onClick={() => { setPlaying(false); setCountdown(20); }}
            aria-label="Back"
          >
            <ArrowLeft />
          </button>
          <h1 className="brand">
            <span>NEON</span> <strong>90</strong> <em>BINGO</em>
          </h1>
        </header>
        <section className="stats-row">
          <div className="stat purple">
            <Users />
            <span>
              <small>ተጫዋቾች</small>
              <b>{game?.playerCount ?? 0}/200</b>
            </span>
          </div>
          <div className="stat blue">
            <Wallet />
            <span>
              <small>የሽልማት ፈንድ</small>
              <b>{game?.prizeAmount ?? 0} ብር</b>
            </span>
          </div>
          <div className="stat gold">
            <Star />
            <span>
              <small>የተጠሩ</small>
              <b>{called.size}/{gameType === "75" ? 75 : 90}</b>
            </span>
          </div>
        </section>
        <section className="draw">
          <p>የአሁኑ ቁጥር</p>
          <div className="current-ball-layout">
            <strong className="ball-letter">{currentBall === null ? "—" : gameType === "75" ? (currentBall <= 15 ? "B" : currentBall <= 30 ? "I" : currentBall <= 45 ? "N" : currentBall <= 60 ? "G" : "O") : ""}</strong>
            <div className="orb">{currentBall ?? "—"}</div>
            <span className="called-count">{called.size}/{gameType === "75" ? 75 : 90}</span>
          </div>
        </section>
        <section className="ball-history" aria-label="Called ball history">
          <h2>የኳስ ማሽን</h2>
          <div className="ball-history-list">
            {(game?.calledNumbers ?? []).slice(-45).reverse().map((number, index) => (
              <span key={`${number}-${index}`} className={`ball-cell ${number === currentBall ? "latest" : ""}`} style={{ animationDelay: `${index * 35}ms` }}>{number}</span>
            ))}
            {!game?.calledNumbers?.length && <small>እስካሁን ኳስ አልተጠራም</small>}
          </div>
        </section>
        <section className="tickets">
          {selected.map((id) => {
            const card = cardForId(id);
            return (
              card && (
                <CardView
                  key={id}
                  card={card}
                  selected
                  called={called}
                  onClick={() => undefined}
                  gameType={gameType}
                />
              )
            );
          })}
        </section>
        {winner && (
          <>
            <div className="confetti" aria-label="Winner celebration">
              {Array.from({ length: 28 }, (_, index) => (
                <i key={index} style={{ left: `${(index * 37) % 100}%`, animationDelay: `${-(index % 9) / 3}s` }} />
              ))}
            </div>
            <div className="winner-modal" role="status">
              <div className="winner-badge">BINGO!</div>
              <h2>{winners.length > 1 ? "አሸናፊዎች ተገኝተዋል" : "አሸናፊ ተገኝቷል"}</h2>
              <div className="winner-prize">{((game?.prizeAmount ?? 0) / winners.length).toFixed(2)} ብር / እያናቸው</div>
              <p>የአሸናፊው ስም: <b>{winners.map((item) => item.displayName).join(", ")}</b></p>
              <p>የአሸናፊ ካርዶች: <b>{winnerCardIds.join(", ")}</b></p>
              <p>የተዘጉ መስመሮች: <b>{winners.map((item) => item.rows.join(", ")).join("; ")}</b></p>
              {winnerCardIds.length <= 3 && <div className="winner-card-preview">
                {winnerCardIds.map((id) => { const card = cardForId(id); return card && <CardView key={id} card={card} selected called={called} onClick={() => undefined} gameType={gameType} />; })}
              </div>}
              {winnerCardIds.length > 3 && <small>ከ{winnerCardIds.length} አሸናፊዎች የተነሳ card previews አልታዩም።</small>}
              <small>አዲስ ጨዋታ በቅርቡ ይጀምራል...</small>
            </div>
          </>
        )}
        {panel && <aside className="account-panel" role="dialog" aria-label={panel === "profile" ? "Profile" : "Wallet"}><button className="icon-button" onClick={() => setPanel(null)} aria-label="Close"><ArrowLeft /></button><h2>{panel === "profile" ? "መገለጫ" : "Wallet"}</h2>{panel === "profile" ? <p>{user?.display_name || "Telegram player"}</p> : <p>ቀሪ ሂሳብ: <strong>{user?.balance ?? 0} ብር</strong></p>}</aside>}
      </main>
    );
  return (
    <main className="app-shell">
      <header className="topbar">
        <button
          className="icon-button"
          onClick={() => history.back()}
          aria-label="Back"
        >
          <ArrowLeft />
        </button>
        <h1 className="brand">
          <span>NEON</span> <strong>90</strong> <em>BINGO</em>
        </h1>
        <div className="top-actions">
          <button
            onClick={() => setNotice("ማሳወቂያ የለም።")}
            aria-label="Notifications"
          >
            <Bell />
          </button>
          <button aria-label="More" onClick={() => setPanel("profile")}>
            <MoreVertical />
          </button>
        </div>
      </header>
      <section className="stats-row">
        <div className="stat purple">
          <Users />
          <span>
            <small>ተጫዋቾች</small>
            <b>{game?.playerCount ?? 0}/200</b>
          </span>
        </div>
        <div className="stat blue">
          <Wallet />
          <span>
            <small>ቀሪ ሂሳብ</small>
            <b>{user?.balance ?? 0} ብር</b>
          </span>
        </div>
        <div className="stat gold">
          <Star />
          <span>
            <small>የተመረጡ ካርዶች</small>
            <b>{selected.length}/2</b>
          </span>
        </div>
      </section>
      <div className="selection-countdown" aria-live="polite">
        <span>ጨዋታው ይጀምራል</span>
        <b>{countdown ?? 20}</b>
        <small>ሰከንድ</small>
      </div>
      <section className="number-grid" aria-label="Card identifiers">
        {cardIdentifiers.map((id) => (
          <button
            key={id}
            className={selected.includes(id) ? "active" : ""}
            onClick={() => toggle(id)}
            aria-pressed={selected.includes(id)}
          >
            {id}
          </button>
        ))}
      </section>
      <section
        className="selected-previews"
        aria-label="Selected card previews"
      >
        <h2>
          የተመረጡ ካርዶች <span>{selected.length}/2</span>
        </h2>
        <div className="tickets">
          {selected.map((id) => {
            const card = cardForId(id);
            return (
              card && (
                <CardView
                  key={id}
                  card={card}
                  selected
                  called={called}
                  onClick={() => toggle(id)}
                  gameType={gameType}
                />
              )
            );
          })}
        </div>
      </section>
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      <button
        className="start-button"
        disabled={!selected.length || countdown !== null}
        onClick={start}
      >
        {countdown !== null ? `ይጀምራል ${countdown}` : "ጨዋታ ጀምር"}
      </button>
      <nav className="bottom-nav">
        <button onClick={() => { setScreen("landing"); setCountdown(null); setSelected([]); setNotice(""); }}>
          <Home />
          <span>Lobby</span>
        </button>
        <button onClick={() => setPanel("wallet")}>
          <Wallet />
          <span>Wallet</span>
        </button>
      </nav>
    </main>
  );
}
