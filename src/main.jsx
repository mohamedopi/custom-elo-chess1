import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Chess } from "chess.js";
import "./style.css";

const PIECES = {
  w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟︎" }
};
const FILES = "abcdefgh";
const ENGINE_URL = "https://cdn.jsdelivr.net/npm/stockfish@16.0.0/src/stockfish.js";


function configureStrength(worker, elo) {
  // Stockfish UCI_Elo limiting is commonly supported only from about 1320 Elo.
  // Below that threshold, use Stockfish's Skill Level option as an approximation.
  if (elo < 1320) {
    const skill = Math.max(0, Math.min(20, Math.round(((elo - 400) / (1320 - 400)) * 20)));
    worker.postMessage("setoption name UCI_LimitStrength value false");
    worker.postMessage(`setoption name Skill Level value ${skill}`);
  } else {
    worker.postMessage("setoption name Skill Level value 20");
    worker.postMessage("setoption name UCI_LimitStrength value true");
    worker.postMessage(`setoption name UCI_Elo value ${Math.max(1320, Math.min(3190, elo))}`);
  }
}
function App() {
  const [game, setGame] = useState(() => new Chess());
  const [fen, setFen] = useState(game.fen());
  const [eloText, setEloText] = useState("1501");
  const [targetElo, setTargetElo] = useState(1501);
  const [humanColor, setHumanColor] = useState("w");
  const [thinking, setThinking] = useState(false);
  const [engineStatus, setEngineStatus] = useState("Engine not started");
  const [engineReady, setEngineReady] = useState(false);
  const [engineError, setEngineError] = useState("");
  const [selected, setSelected] = useState(null);
  const [legalTargets, setLegalTargets] = useState([]);
  const [history, setHistory] = useState([]);
  const [lastMove, setLastMove] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [timeControl, setTimeControl] = useState("3000");
  const [gameResult, setGameResult] = useState("");
  const [evalText, setEvalText] = useState("—");
  const workerRef = useRef(null);
  const pendingRef = useRef(false);
  const gameRef = useRef(game);
  const readyTimerRef = useRef(null);

  useEffect(() => { gameRef.current = game; setFen(game.fen()); }, [game]);

  const stopWorker = useCallback(() => {
    if (workerRef.current) {
      try { workerRef.current.terminate(); } catch {}
      workerRef.current = null;
    }
    pendingRef.current = false;
    setThinking(false);
  }, []);

  const startEngine = useCallback(() => {
    stopWorker();
    setEngineError("");
    setEngineReady(false);
    setEngineStatus("Loading Stockfish…");
    try {
      const worker = new Worker(ENGINE_URL);
      workerRef.current = worker;
      worker.onmessage = (event) => {
        const line = typeof event.data === "string" ? event.data : "";
        if (line.includes("uciok")) {
          configureStrength(worker, targetElo);
          worker.postMessage("isready");
        }
        if (line.includes("readyok")) {
          setEngineReady(true);
          setEngineStatus("Stockfish ready");
        }
        if (line.startsWith("info ") && line.includes(" score ")) {
          const m = line.match(/score (cp|mate) (-?\d+)/);
          if (m) setEvalText(m[1] === "mate" ? `Mate ${m[2]}` : `${(Number(m[2]) / 100).toFixed(2)} pawns`);
        }
        if (line.startsWith("bestmove ")) {
          pendingRef.current = false;
          setThinking(false);
          const uci = line.split(/\s+/)[1];
          const current = gameRef.current;
          if (!uci || uci === "(none)" || current.isGameOver()) return;
          try {
            const move = current.move({
              from: uci.slice(0, 2),
              to: uci.slice(2, 4),
              ...(uci.length > 4 ? { promotion: uci[4].toLowerCase() } : {})
            });
            if (move) {
              setGame(new Chess(current.fen()));
              setHistory(current.history({ verbose: true }));
              setLastMove({ from: move.from, to: move.to });
              setSelected(null);
              setLegalTargets([]);
              updateResult(current);
            }
          } catch (e) {
            setEngineError("The engine returned a move that could not be applied. Restart the game or reload the engine.");
          }
        }
      };
      worker.onerror = () => {
        setEngineError("Could not load Stockfish. Check your internet connection or try again.");
        setEngineStatus("Engine failed to load");
        setEngineReady(false);
      };
      worker.postMessage("uci");
      readyTimerRef.current = setTimeout(() => {
        if (!workerRef.current || !engineReady) {
          setEngineStatus("Waiting for engine…");
        }
      }, 5000);
    } catch (e) {
      setEngineError("Your browser could not start the chess engine.");
      setEngineStatus("Engine unavailable");
    }
  }, [stopWorker, targetElo, engineReady]);

  useEffect(() => {
    startEngine();
    return () => {
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
      stopWorker();
    };
  // Engine is initialized once at mount; strength changes are sent before a new game.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateResult = (g) => {
    if (g.isCheckmate()) setGameResult(`${g.turn() === "w" ? "Black" : "White"} wins by checkmate`);
    else if (g.isStalemate()) setGameResult("Draw by stalemate");
    else if (g.isThreefoldRepetition()) setGameResult("Draw by threefold repetition");
    else if (g.isInsufficientMaterial()) setGameResult("Draw by insufficient material");
    else if (g.isDraw()) setGameResult("Draw");
    else setGameResult("");
  };

  const requestEngineMove = useCallback(() => {
    const worker = workerRef.current;
    const current = gameRef.current;
    if (!worker || !engineReady || pendingRef.current || current.isGameOver() || current.turn() === humanColor) return;
    pendingRef.current = true;
    setThinking(true);
    setEngineStatus(`Thinking at target Elo ${targetElo}…`);
    configureStrength(worker, targetElo);
    worker.postMessage(`position fen ${current.fen()}`);
    const movetime = Math.max(100, Number(timeControl) || 3000);
    worker.postMessage(`go movetime ${movetime}`);
  }, [engineReady, humanColor, targetElo, timeControl]);

  useEffect(() => {
    if (engineReady && game.turn() !== humanColor && !game.isGameOver()) requestEngineMove();
  }, [fen, engineReady, game, humanColor, requestEngineMove]);

  const selectSquare = (square) => {
    if (thinking || game.isGameOver() || game.turn() !== humanColor) return;
    const piece = game.get(square);
    if (selected) {
      const candidate = legalTargets.find(m => m.to === square);
      if (candidate) {
        let promotion = candidate.promotion;
        if (candidate.flags.includes("p")) {
          const answer = window.prompt("Promote to q (queen), r (rook), b (bishop), or n (knight):", "q");
          promotion = ["q", "r", "b", "n"].includes((answer || "q").toLowerCase()) ? answer.toLowerCase() : "q";
        }
        try {
          const move = game.move({ from: selected, to: square, ...(promotion ? { promotion } : {}) });
          setGame(new Chess(game.fen()));
          setHistory(game.history({ verbose: true }));
          setLastMove({ from: move.from, to: move.to });
          setSelected(null);
          setLegalTargets([]);
          updateResult(game);
        } catch {
          setSelected(null);
          setLegalTargets([]);
        }
        return;
      }
    }
    if (piece && piece.color === humanColor) {
      setSelected(square);
      setLegalTargets(game.moves({ square, verbose: true }));
    } else {
      setSelected(null);
      setLegalTargets([]);
    }
  };

  const newGame = (color = humanColor, elo = targetElo) => {
    stopWorker();
    const fresh = new Chess();
    setGame(fresh);
    gameRef.current = fresh;
    setFen(fresh.fen());
    setHumanColor(color);
    setTargetElo(elo);
    setHistory([]);
    setLastMove(null);
    setSelected(null);
    setLegalTargets([]);
    setGameResult("");
    setEvalText("—");
    // Restart engine with current target strength, then game effect starts its move if needed.
    setTimeout(() => {
      startEngine();
    }, 50);
  };

  const applyElo = () => {
    const n = Number(eloText);
    if (!Number.isInteger(n) || n < 400 || n > 3000) {
      setEngineError("Enter a whole-number target Elo between 400 and 3000.");
      return;
    }
    setEngineError("");
    newGame(humanColor, n);
  };

  const undo = () => {
    if (thinking) return;
    const g = gameRef.current;
    if (g.history().length === 0) return;
    g.undo();
    if (g.turn() !== humanColor && g.history().length > 0) g.undo();
    setGame(new Chess(g.fen()));
    setHistory(g.history({ verbose: true }));
    setLastMove(g.history({ verbose: true }).slice(-1)[0] || null);
    setGameResult("");
    setSelected(null);
    setLegalTargets([]);
  };

  const displaySquares = useMemo(() => {
    const rows = [];
    for (let r = 0; r < 8; r++) {
      const row = [];
      for (let c = 0; c < 8; c++) {
        const file = flipped ? 7 - c : c;
        const rank = flipped ? r + 1 : 8 - r;
        row.push(`${FILES[file]}${rank}`);
      }
      rows.push(row);
    }
    return rows;
  }, [flipped]);

  const squareClass = (square, r, c) => {
    const fileIndex = FILES.indexOf(square[0]);
    const rank = Number(square[1]);
    const dark = (fileIndex + rank) % 2 === 0;
    const isTarget = legalTargets.some(m => m.to === square);
    const isSelected = selected === square;
    const isLast = lastMove && (lastMove.from === square || lastMove.to === square);
    return `square ${dark ? "dark" : "light"} ${isTarget ? "target" : ""} ${isSelected ? "selected" : ""} ${isLast ? "last" : ""}`;
  };

  const boardPiece = (square) => {
    const p = game.get(square);
    return p ? PIECES[p.color][p.type] : "";
  };

  const movePairs = [];
  for (let i = 0; i < history.length; i += 2) movePairs.push({ no: i / 2 + 1, white: history[i], black: history[i + 1] });

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark">♞</div>
        <div>
          <div className="brand-title">Custom Elo Chess</div>
          <div className="brand-subtitle">A real chess engine · Adjustable opponent strength</div>
        </div>
        <span className={`engine-pill ${engineReady ? "online" : ""}`}>{engineReady ? "ENGINE READY" : "ENGINE LOADING"}</span>
      </header>

      <div className="layout">
        <section className="play-column">
          <div className="player-row opponent">
            <div className="avatar">♟</div>
            <div className="player-info"><strong>Stockfish</strong><span>Target Elo {targetElo}</span></div>
            <div className="player-rating">{targetElo}</div>
          </div>

          <div className="board-frame">
            <div className="board-coordinates left">{displaySquares.map((row, r) => <span key={r}>{row[0][1]}</span>)}</div>
            <div className="board">
              {displaySquares.flatMap((row, r) => row.map((square, c) => {
                const p = game.get(square);
                const isTarget = legalTargets.some(m => m.to === square);
                return (
                  <button
                    type="button"
                    key={square}
                    aria-label={`${square}${p ? ` ${p.color === "w" ? "white" : "black"} ${p.type}` : ""}`}
                    className={squareClass(square, r, c)}
                    onClick={() => selectSquare(square)}
                  >
                    {p && <span className={`piece ${p.color === "w" ? "white-piece" : "black-piece"}`}>{boardPiece(square)}</span>}
                    {isTarget && <span className={`move-dot ${p ? "capture-dot" : ""}`} />}
                    {c === 0 && <span className="rank-label">{square[1]}</span>}
                    {r === 7 && <span className="file-label">{square[0]}</span>}
                  </button>
                );
              }))}
            </div>
          </div>

          <div className="player-row human">
            <div className="avatar human-avatar">{humanColor === "w" ? "♙" : "♟"}</div>
            <div className="player-info"><strong>You ({humanColor === "w" ? "White" : "Black"})</strong><span>{thinking ? "Engine is thinking…" : gameResult || "Your move when it is your turn"}</span></div>
            <div className="player-rating">YOU</div>
          </div>

          <div className="board-actions">
            <button className="secondary-button" onClick={undo} disabled={thinking || history.length === 0}>↶ Undo</button>
            <button className="secondary-button" onClick={() => setFlipped(v => !v)}>⇅ Flip board</button>
            <button className="primary-button" onClick={() => newGame(humanColor, targetElo)}>＋ New game</button>
          </div>
          {gameResult && <div className="result-banner">{gameResult}</div>}
        </section>

        <aside className="side-column">
          <section className="panel">
            <div className="panel-heading"><span>⚙</span><h2>Game setup</h2></div>
            <label className="field-label" htmlFor="elo">Opponent Elo Rating</label>
            <div className="elo-row">
              <input id="elo" type="number" min="400" max="3000" step="1" value={eloText} onChange={e => setEloText(e.target.value)} onKeyDown={e => e.key === "Enter" && applyElo()} />
              <button className="primary-button apply-button" onClick={applyElo}>Apply</button>
            </div>
            <div className="quick-ratings">
              {[800, 1000, 1200, 1501, 1800, 2000].map(n => <button key={n} className={targetElo === n ? "active" : ""} onClick={() => { setEloText(String(n)); newGame(humanColor, n); }}>{n}</button>)}
            </div>
            <p className="helper-text">Supported input: 400–3000. Exact Elo equivalence requires empirical calibration.</p>
            <div className="field-group">
              <label className="field-label" htmlFor="color">Play as</label>
              <select id="color" value={humanColor} onChange={e => newGame(e.target.value, targetElo)}>
                <option value="w">White</option>
                <option value="b">Black</option>
              </select>
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="time">Engine move budget</label>
              <select id="time" value={timeControl} onChange={e => setTimeControl(e.target.value)}>
                <option value="250">Fast (0.25 s)</option>
                <option value="750">Quick (0.75 s)</option>
                <option value="1500">Normal (1.5 s)</option>
                <option value="3000">Thoughtful (3 s)</option>
                <option value="6000">Deep (6 s)</option>
              </select>
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading"><span>☷</span><h2>Moves</h2></div>
            <div className="move-list">
              {movePairs.length === 0 ? <div className="empty-state">Moves will appear here after the game starts.</div> : movePairs.map(pair => (
                <div className="move-row" key={pair.no}>
                  <span className="move-number">{pair.no}.</span>
                  <span>{pair.white ? `${pair.white.from}${pair.white.to}${pair.white.promotion || ""}` : "—"}</span>
                  <span>{pair.black ? `${pair.black.from}${pair.black.to}${pair.black.promotion || ""}` : ""}</span>
                </div>
              ))}
            </div>
            <div className="fen-row"><span>Position</span><button onClick={() => navigator.clipboard?.writeText(fen)}>Copy FEN</button></div>
          </section>

          <section className="panel status-panel">
            <div className="panel-heading"><span>◉</span><h2>Engine status</h2></div>
            <div className="status-line"><span className={`status-dot ${engineReady ? "green" : ""}`} />{engineStatus}</div>
            <div className="status-line"><span className="status-dot green" />Target rating: {targetElo} Elo</div>
            <div className="status-line"><span className="status-dot" />Evaluation: {evalText}</div>
            {engineError && <div className="error-message">{engineError}</div>}
            <button className="secondary-button full-width" onClick={startEngine}>Reload engine</button>
          </section>

          <div className="disclaimer"><strong>Rating note</strong><br />The selected Elo is a target setting. Actual playing strength varies with engine version, hardware, time budget, and calibration pool. This prototype uses Stockfish's supported UCI strength controls; it does not claim Chess.com rating equivalence.</div>
        </aside>
      </div>
      <footer>Custom Elo Chess · Built with React, chess.js, and Stockfish UCI</footer>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
