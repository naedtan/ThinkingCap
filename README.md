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
Port 8787 is the API server and does not serve the interface at `/`. Vite uses port 5173 strictly: if it is already occupied, stop the previous development process instead of silently opening another port. The API binds to `127.0.0.1` by default (`HOST` can override this); it is a local prototype, not a public service with authentication or rate limiting.
The key stays on the server; the browser only talks to `/api`, which Vite proxies in development. Never put the key in frontend code or commit it. In PowerShell, use `Copy-Item server/.env.example server/.env` to create the file if it does not exist. Restart the server after changing `.env`. Health reporting confirms a key is loaded, not that it is valid; send a tutor message to check actual API access.

`GEMINI_MODEL` in `server/.env` picks the primary model. The default is `gemini-3.6-flash`, followed by `gemini-3.5-flash-lite`, `gemini-3.8-flash`, and `gemini-3.1-flash-lite`. This order favors availability observed during local testing, rather than ranking capability. These four models list free input/output on the Standard API Free tier as of November 11, 2026: [Google pricing](https://ai.google.dev/gemini-api/docs/pricing).

```dotenv
GEMINI_MODEL=gemini-3.6-flash
GEMINI_FALLBACK_MODELS=gemini-3.5-flash-lite,gemini-3.8-flash,gemini-3.1-flash-lite
```

Only those four text models are allowed in the configuration; paid-only models and unrelated audio/image models are rejected at startup. This allowlist does not verify your Google project's billing tier. Usage is free only when the project is eligible for the Free tier and within its quotas; paid projects can incur charges. Check your project's tier and active limits in AI Studio. No paid tools or grounding are enabled by this application.

Each tutor request starts with the primary model and falls back on temporary HTTP errors (408, 429, 500, 502, 503, 504), network timeouts/failures, or a model-not-found response (404). There is one attempt per distinct model, at most four, with exponential backoff and jitter between attempts and a 20-second HTTP timeout per attempt. SDK retries are disabled to avoid multiplying calls. Invalid requests, authentication/permission errors, and response-parsing errors do not trigger fallback. Every attempt uses the same conversation, preferences, and JSON response schema. Exhausted attempts produce a clear busy/unavailable or quota message in the chat.

Set `GEMINI_FALLBACK_MODELS=` to disable fallback. If omitted, the other supported models are used in the documented order. Explicit model lists are trimmed and deduplicated. Restart the server after configuration changes. `/api/health` reports `model`, `fallbackModels`, and `hasKey`; successful `/api/tutor` responses also report the actual `model` used. The terminal logs failed model/status pairs and successful fallbacks without including prompts or keys.

## What is in the box
| Proposal feature | Where it lives |
|---|---|
| Learning preferences (interaction level, activity toggles, explanation style) | `client/src/components/LearningPreferences/`, shared contract in `shared/learning.mjs`, prompt behavior in `server/tutor.js` |
| Prior knowledge check | Optional `start` diagnostic when guided questions are enabled and interaction is medium/high; direct help remains available |
| Conversational hints and suggested replies | Ask for a hint in chat; `reply` can return a `hint` card. Clicking a suggestion such as "Intuition" immediately sends its text as a student message |
| Comprehension checkpoints | `quiz` intent, answered and graded in `TurnCard.jsx` |
| Sentence starters | `starters` field, chips that fill the text box so the student can finish the thought before sending |
| Teach-back with feedback | `teachback` intent, then `reply` returns a `feedback` turn (right / worth another look) |
| "I'm confused" with targeted clarification | `ConfusedPanel.jsx` sends the `clarify` intent; the single help button replaces the separate hint button |
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
At Medium/High, the tutor is instructed to introduce actual selected activities proactively once there is enough material to attempt, rather than asking permission or waiting for an activity request. The backend adds recent activity types and the current run of explanation turns to the prompt so the model can vary activities and avoid endless explanations. Ordinary requests to explain a concept do not disable activities; an explicit request such as "only explain, no questions" does. Existing attempts, unanswered quizzes, and requests for clarification receive support before another activity is introduced. Activities appear within tutor responses; changing settings or waiting does not trigger background API requests.

Changes apply to the next request, including replies, hints, clarification, summaries, and retries. An in-flight response keeps the preferences it was sent with. Updating a preference does not generate an API call or rewrite earlier messages. Preferences are saved across sessions in this browser's local storage, not in a server-side account.

Old saved sessions are migrated on load: obsolete mode-selection cards and session `modes` are removed while preserving messages, course organization, and quiz answers. An unfinished session offers **Continue learning**, or the student can send another message to start it. Loading a saved session does not automatically make a paid API request.
Sessions interrupted by refreshing while a response was pending can also continue without duplicating the saved student message.
The separate "Give me a hint" button and `stuck` API intent have been removed. Existing hint cards and historical activity counts remain readable; failed requests from the old button are migrated to clarification retries. Students can still ask for hints in ordinary chat.

## How it works
`POST /api/tutor` takes `{ intent, topic, learning?, history, clarifications?, detail?, stats? }` and returns `{ turn, model }`.

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

- `intent` is one of `start`, `reply`, `clarify`, `quiz`, `teachback`, `practice`, `summary`.
- `turn.kind` is one of `diagnostic`, `concept`, `hint`, `quiz`, `teachback`, `feedback`, `practice`, `summary`.
- The server validates preferences on every request, builds the current system instructions, adds a per-intent directive and conversation history, and asks Gemini for JSON matching `tutorSchema`. `normalizeTurn` cleans the result before it reaches the UI.
- Missing preference fields use defaults. Supplied invalid known values (including non-boolean activity flags) return HTTP 400. Unknown fields and activity IDs are discarded and never become prompt instructions. Legacy `modes` no longer affects teaching behavior.
- `shared/learning.mjs` defines the allowed values and defaults for both browser storage and server validation. Malformed saved preferences are repaired field by field in the browser.
- History is bounded before transport and again before prompt construction: 24 turns of up to 1,500 characters for ordinary requests, or 60 turns of up to 900 characters for summaries. Full conversations remain in browser storage. Quiz history includes answer options so selected IDs have context.
- Tutor responses are normalized on both sides of the API. Empty/invalid responses produce retryable errors; malformed quiz options cannot reach the grading UI. Bad JSON and malformed input return HTTP 400, oversized bodies return 413, exhausted quota returns 429, temporary model unavailability returns 503, and other upstream/response failures return 502.
- The app permits one tutor request at a time, with a synchronous duplicate-click lock. Replies stay attached to their originating session when navigating. Unmounting the app aborts its request, and client disconnects stop upstream calls/fallback delays. An already processed provider request cannot be undone.

To change how the tutor behaves, edit `SYSTEM`, `FREQUENCY`, `ACTIVITIES`, `EXPLANATIONS`, and `DIRECTIVES` in `server/tutor.js`. To add a new kind of turn, add it to `KINDS` and the schema, give it a directive, and render it in `TurnCard.jsx`.

## Checks

From `thinkingcap/`, run `npm test` for server HTTP/request-building and client API/session tests, and `npm run build` for the production client build. Tests use no API key and do not call Gemini. Coverage includes preference defaults and validation, all activity-toggle combinations, each level/style combination, updates between requests, request snapshots, legacy-session repair, transcript limits, duplicate/cancelled requests, HTTP error responses, and SDK fallbacks, alongside clarification and summary behavior.

With a valid key, manually check that the first message starts immediately, preference changes affect subsequent replies and retries, collapsed-sidebar controls behave the same as expanded controls, low/all-off avoids unsolicited activities, and an explicit activity request still works. Check both concise and step-by-step styles, including a change made while a response is pending. These live checks assess model behavior; unit tests check the instructions sent to it.

## Layout
```
server/index.js        Environment configuration and server startup
server/app.js          Injectable Express app and HTTP error/cancellation handling
server/models.js       Free-tier model allowlist and bounded automatic fallbacks
server/tutor.js        Schema, preference behaviors, prompts, request builder
server/activities.js   Context-aware guidance for proactive automatic activities
shared/learning.mjs    Allowed preference values, defaults, normalization
shared/conversation.mjs Shared history limits, intents, clarification labels
shared/turns.mjs       Tutor response and quiz normalization
client/src/App.jsx     Session state, calls to the server
client/src/sessions.js Legacy session migration and start detection
client/src/hooks       Persistence and tutor-request lifecycle hooks
client/src/storage.js  Safe local-storage access
client/src/tutorRequests.js Duplicate prevention and request cancellation
client/src/components  Sidebar, LearningPreferences, Welcome, Thread, TurnCard, Composer, ConfusedPanel
client/src/styles.css  Design tokens and styles (colors follow the Figma)
```

See [runtime architecture](thinkingcap/design/architecture.md) for module responsibilities, request flow, efficiency decisions, and extension boundaries.

## Git workflow
`main` is deployable; `develop` is where work merges.

```bash
git switch develop
git switch -c feature-name
```

## Known gaps
- Live Gemini behavior requires a valid key and quota. If a response fails, the server logs the error and the UI shows a retry card.
- Activity frequency and preference adherence depend on the model following the prompt; no deterministic activity scheduler is implemented.
- Internal scenario checks demonstrate implementation behavior, not improvements in learning outcomes.
- Browser storage can be unavailable or full; the current session remains usable in memory, but failed writes do not survive a reload.
