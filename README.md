# MacroFlow

A simple daily macronutrient tracker. Set your macro goals, log the foods you
eat, and watch your calories, protein, carbs, and fat progress toward your
targets in real time.

MacroFlow is a small full-stack TypeScript app built as an npm-workspaces
monorepo:

- **`web/`** — Vite + React + TypeScript single-page app (the UI).
- **`server/`** — Express + TypeScript REST API with lightweight JSON-file
  persistence (no external database required).

## Requirements

- Node.js >= 20 (developed against Node 22)
- npm >= 10

## Getting started

```bash
npm ci            # install all workspace dependencies
npm run dev       # start the API (:3001) and the web app (:5173) together
```

Then open http://localhost:5173. The web dev server proxies `/api/*` requests
to the backend on port 3001.

### Run the pieces individually

```bash
npm run dev:server   # API only, on http://localhost:3001
npm run dev:web      # web app only, on http://localhost:5173
```

## Scripts

| Command          | Description                                        |
| ---------------- | -------------------------------------------------- |
| `npm run dev`    | Run the API and web app together (watch mode).     |
| `npm run build`  | Type-check and build both workspaces.              |
| `npm test`       | Run the server and web test suites (Vitest).       |
| `npm run lint`   | Lint both workspaces (ESLint).                     |
| `npm start`      | Run the compiled API from `server/dist`.           |

## API overview

| Method | Path                 | Description                              |
| ------ | -------------------- | ---------------------------------------- |
| GET    | `/api/health`        | Service health check.                    |
| GET    | `/api/goals`         | Current daily macro goals.               |
| PUT    | `/api/goals`         | Update daily macro goals.                |
| GET    | `/api/entries?date=` | List logged foods for a date.            |
| POST   | `/api/entries`       | Log a food entry.                        |
| DELETE | `/api/entries/:id`   | Remove a logged food entry.              |
| GET    | `/api/summary?date=` | Goals, consumed, and remaining macros.   |

Data is stored in `data/macroflow.json` (git-ignored). Override the location
with the `MACROFLOW_DATA_FILE` environment variable, or the port with `PORT`.

## Cloud Agent environment

`.cursor/environment.json` configures the Cursor Cloud Agent environment: it
runs `npm ci` on setup and launches the `api` and `web` dev servers as
persistent terminals.
