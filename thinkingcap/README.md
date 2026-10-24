# ThinkingCap

An interactive AI learning interface (CSE 216). Instead of returning one long answer, ThinkingCap checks what the
student already knows, reveals ideas in small steps, quizzes them, lets them signal confusion at any time, asks them to
teach the idea back, and ends with a short summary. The model is Gemini; the pedagogy lives in the prompts and the UI.

## Run it

You need Node 18+ and a Gemini API key from https://aistudio.google.com/apikey.

```bash
npm run install:all                       # installs root, server, and client
cp server/.env.example server/.env        # then paste your key into server/.env
npm run dev                               # server on :8787, client on :5173
```

Open http://localhost:5173. Check the server with http://localhost:8787/api/health (it reports whether a key is set).
The key stays on the server; the browser only talks to `/api`, which Vite proxies in development.

`GEMINI_MODEL` in `server/.env` picks the model. The default is `gemini-3.5-flash-lite`; confirm current model codes at
https://ai.google.dev/gemini-api/docs/models and change it if one has been retired.

## What is in the box

| Proposal feature | Where it lives |
|---|---|
| Teaching mode selection (multi-select: guided, step-by-step, practice, teach-back) | `client/src/components/ModeSelector.jsx`, behaviors in `server/tutor.js` (`MODES`) |
| Prior knowledge check | `start` intent, renders as a "Prior knowledge check" card with three angles |
| Scaffolded hints and thought-starters | `stuck` intent ("Give me a hint"), suggestion cards fill the text box |
| Comprehension checkpoints | `quiz` intent, answered and graded in `TurnCard.jsx` |
| Sentence starters | `starters` field, chips that fill the text box |
| Teach-back with feedback | `teachback` intent, then `reply` returns a `feedback` turn (right / worth another look) |
| "I'm confused" with targeted clarification | `ConfusedPanel.jsx` sends the `clarify` intent |
| End-of-session summary | `summary` intent ("Wrap up") |
| Courses and sessions | `Sidebar.jsx`, saved in `localStorage` |
| Accessibility basics | Text size and high-contrast toggles in the sidebar, visible focus, reduced-motion support |

Not built yet (from the Figma): voice inquiry, formula editor, file upload, AI-generated visuals, accounts, and
server-side history. Changing the learning style mid-session is also not wired up.

## How it works

`POST /api/tutor` takes `{ intent, topic, modes, history, clarifications?, detail? }` and returns `{ turn }`.

- `intent` is one of `start`, `reply`, `stuck`, `clarify`, `quiz`, `teachback`, `practice`, `summary`.
- `turn.kind` is one of `diagnostic`, `concept`, `hint`, `quiz`, `teachback`, `feedback`, `practice`, `summary`.
- The server builds a system prompt from the chosen modes, adds a per-intent directive, and asks Gemini for JSON that
  matches `tutorSchema`. `normalizeTurn` cleans the result before it reaches the UI.

To change how the tutor behaves, edit `SYSTEM`, `MODES`, and `DIRECTIVES` in `server/tutor.js`. To add a new kind of
turn, add it to `KINDS` and the schema, give it a directive, and render it in `TurnCard.jsx`.

## Layout

```
server/index.js        Express app and the one /api/tutor route
server/tutor.js        Schema, teaching modes, prompts, request builder
client/src/App.jsx     Session state, calls to the server
client/src/components  Sidebar, Welcome, Thread, TurnCard, ModeSelector, Composer, ConfusedPanel
client/src/styles.css  Design tokens and styles (colors follow the Figma)
```

## Git workflow

`main` is deployable; `develop` is where work merges.

```bash
git init && git add . && git commit -m "Initial ThinkingCap scaffold"
git branch -M main && git checkout -b develop
```

## Known gaps

- Built and checked against the Gemini SDK's request shape, but the sandbox it was written in could not reach the Gemini
  API, so the first real run is yours. If a response fails, the server logs the error and the UI shows a card.
- No automated tests yet.
