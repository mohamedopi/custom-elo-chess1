# Custom Elo Chess

A responsive browser chess prototype built with React, Vite, `chess.js`, and Stockfish UCI.

## Requirements

- Node.js 18+ (Node.js 20 LTS recommended)
- Internet connection to install dependencies and load the Stockfish browser worker

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Production build

```bash
npm run build
npm run preview
```

## Features in this starter

- Responsive chessboard for mobile and desktop.
- Legal move handling via `chess.js`.
- Real Stockfish engine loaded as a Web Worker from jsDelivr.
- Custom target Elo input (400–3000) and quick-select ratings.
- White/Black selection, engine move-time options, board flipping, undo, new game, FEN copy.
- Checkmate and draw state display.

## Important strength/calibration notes

- The requested Elo is a target setting, not a verified Chess.com rating.
- For target Elo below 1320, this prototype maps the requested value to Stockfish's `Skill Level` option as an approximation. At 1320 and above, it uses `UCI_LimitStrength` and `UCI_Elo`, where supported by the selected browser build.
- This mapping is not empirically calibrated and is not guaranteed to match the requested Elo. A rating such as 1501 does not establish equivalence with Chess.com or any specific rating pool.
- Proper calibration requires engine-versus-engine match testing under documented time controls, hardware, versions, and opponent pools.
- Stockfish is GPL-licensed. If you redistribute the engine or a modified build, comply with the license and source-code obligations. Review the engine package and deployment terms before publishing.

## Limitations of this initial version

- The Stockfish worker URL is remote, so the app needs an internet connection and the CDN package must remain available.
- Browser build compatibility can vary. If the worker fails to load, inspect the browser console and pin a verified Stockfish browser build.
- The evaluation display is a raw engine score and is not a complete player-facing game review.
- Undo is intended for casual play and undoes enough plies to return to the human's turn.
- This version does not yet provide statistically calibrated Elo estimates, persistent accounts, online multiplayer, or a rating history.
