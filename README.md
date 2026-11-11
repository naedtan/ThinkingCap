# ThinkingCap

An interactive AI learning interface with student-controlled explanations, guided questions, practice, quizzes, teach-back, clarification, and session summaries. The model is Gemini; the teaching behavior lives in the prompts and the UI. Students can change preferences during a conversation without losing progress.

## Run it
You need Node 22+ and a Gemini API key from https://aistudio.google.com/apikey. Run the following commands from the `thinkingcap/` directory:

```bash
npm run install:all                       # installs root, server, and client
cp server/.env.example server/.env        # only if .env does not already exist; add your key there
npm run dev                               # server on :8787, client on :5173
```

Open http://localhost:5173. Check the server with http://localhost:8787/api/health (it reports whether a key is set).
The key stays on the server; the browser only talks to `/api`, which Vite proxies in development. Never put the key in frontend code or commit it. In PowerShell, use `Copy-Item server/.env.example server/.env` to create the file if it does not exist. Restart the server after changing `.env`. Health reporting confirms a key is loaded, not that it is valid; send a tutor message to check actual API access.

`GEMINI_MODEL` in `server/.env` picks the model. The default is `gemini-3.5-flash-lite`; confirm current model codes at
https://ai.google.dev/gemini-api/docs/models and change it if one has been retired.

## What is in the box
| Proposal feature | Where it lives |
|---|---|
| Learning preferences (interaction level, activity toggles, explanation style) | `client/src/components/LearningPreferences/`, shared contract in `shared/learning.mjs`, prompt behavior in `server/tutor.js` |
| Prior knowledge check | Optional `start` diagnostic when guided questions are enabled and interaction is medium/high; direct help remains available |
| Scaffolded hints and thought-starters | `stuck` intent ("Give me a hint"), suggestion cards fill the text box |
| Comprehension checkpoints | `quiz` intent, answered and graded in `TurnCard.jsx` |
| Sentence starters | `starters` field, chips that fill the text box |
| Teach-back with feedback | `teachback` intent, then `reply` returns a `feedback` turn (right / worth another look) |
| "I'm confused" with targeted clarification | `ConfusedPanel.jsx` sends the `clarify` intent |
| End-of-session summary | `summary` intent ("Session Summary") |
| Courses and sessions | `Sidebar.jsx`, saved in `localStorage` |
| Accessibility basics | Text size and high-contrast toggles in the sidebar, visible focus, reduced-motion support |

Not built yet (from the Figma): voice inquiry, formula editor, file upload, AI-generated visuals, accounts, and server-side history.

## Learning preferences

The right sidebar is the only preference chooser. The first student message starts tutoring immediately with the current settings. Defaults are medium interaction, all four activity types enabled, and concise explanations.

| Setting | Behavior |
|---|---|
| Low interaction | Mostly explanations; introduce activities only when explicitly requested |
| Medium interaction | Explanations with occasional selected activities when useful |
| High interaction | Frequent selected activities, one at a time, with explanations and feedback between them |
| Activity toggles | Allow the tutor to introduce guided questions, practice problems, teach-back, and mini quizzes |
| Concise explanations | Focus on the answer, reasoning, and core takeaway |
| Step-by-step explanations | Present reasoning in small connected steps; does not increase activity frequency or require permission between steps |

Frequency is adaptive and instructed through the prompt, not a fixed schedule enforced by code. Selecting all activity types does not require every response to contain them. Turning them all off means explanations without unsolicited activities at any interaction level; no extra chooser appears. Explicit requests such as "Quiz me", "Practice it", "Teach it back", or "explain this directly" take priority over the default settings for that request. Feedback on an existing activity can still be provided after its toggle is turned off.

Changes apply to the next request, including replies, hints, clarification, summaries, and retries. An in-flight response keeps the preferences it was sent with. Updating a preference does not generate an API call or rewrite earlier messages. Preferences are saved across sessions in this browser's local storage, not in a server-side account.

Old saved sessions are migrated on load: obsolete mode-selection cards and session `modes` are removed while preserving messages, course organization, and quiz answers. An unfinished session offers **Continue learning**, or the student can send another message to start it. Loading a saved session does not automatically make a paid API request.

## How it works
`POST /api/tutor` takes `{ intent, topic, learning?, history, clarifications?, detail?, stats? }` and returns `{ turn }`.

```json
{
  "intent": "reply",
  "topic": "photosynthesis",
  "learning": {
    "level": "medium",
    "types": { "guided": true, "practice": true, "teachback": false, "quizzes": true },
    "style": "concise"
  },
  "history": [{ "role": "student", "text": "Why do plants need light?" }]
}
```

- `intent` is one of `start`, `reply`, `stuck`, `clarify`, `quiz`, `teachback`, `practice`, `summary`.
- `turn.kind` is one of `diagnostic`, `concept`, `hint`, `quiz`, `teachback`, `feedback`, `practice`, `summary`.
- The server validates preferences on every request, builds the current system instructions, adds a per-intent directive and conversation history, and asks Gemini for JSON matching `tutorSchema`. `normalizeTurn` cleans the result before it reaches the UI.
- Missing preference fields use defaults. Supplied invalid known values (including non-boolean activity flags) return HTTP 400. Unknown fields and activity IDs are discarded and never become prompt instructions. Legacy `modes` no longer affects teaching behavior.
- `shared/learning.mjs` defines the allowed values and defaults for both browser storage and server validation. Malformed saved preferences are repaired field by field in the browser.

To change how the tutor behaves, edit `SYSTEM`, `FREQUENCY`, `ACTIVITIES`, `EXPLANATIONS`, and `DIRECTIVES` in `server/tutor.js`. To add a new kind of turn, add it to `KINDS` and the schema, give it a directive, and render it in `TurnCard.jsx`.

## Checks

From `thinkingcap/`, run `npm test` for server request-building and client API/session tests, and `npm run build` for the production client build. Tests use no API key and do not call Gemini. Coverage includes preference defaults and validation, all activity-toggle combinations, each level/style combination, updates between requests, request snapshots, and legacy-session migration, alongside clarification and summary behavior.

With a valid key, manually check that the first message starts immediately, preference changes affect subsequent replies and retries, collapsed-sidebar controls behave the same as expanded controls, low/all-off avoids unsolicited activities, and an explicit activity request still works. Check both concise and step-by-step styles, including a change made while a response is pending. These live checks assess model behavior; unit tests check the instructions sent to it.

## Layout
```
server/index.js        Express app and the one /api/tutor route
server/tutor.js        Schema, preference behaviors, prompts, request builder
shared/learning.mjs    Allowed preference values, defaults, normalization
client/src/App.jsx     Session state, calls to the server
client/src/sessions.js Legacy session migration and start detection
client/src/components  Sidebar, LearningPreferences, Welcome, Thread, TurnCard, Composer, ConfusedPanel
client/src/styles.css  Design tokens and styles (colors follow the Figma)
```

## Git workflow
`main` is deployable; `develop` is where work merges.

```bash
git init && git add . && git commit -m "Initial ThinkingCap scaffold"
git branch -M main && git checkout -b develop
```

## Known gaps
- Live Gemini behavior requires a valid key and quota. If a response fails, the server logs the error and the UI shows a retry card.
- Activity frequency and preference adherence depend on the model following the prompt; no deterministic activity scheduler is implemented.
- Internal scenario checks demonstrate implementation behavior, not improvements in learning outcomes.
