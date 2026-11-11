# Runtime architecture

ThinkingCap is a local React/Vite client and Express server. The browser owns
session history and preferences; only the server accesses the Gemini API key.
The current prototype has no accounts, database, file uploads, or public-hosting
access controls.

## Module boundaries

| Module | Responsibility |
|---|---|
| `client/src/App.jsx` | Connect the UI, active session, and student actions |
| `client/src/hooks/useStoredState.js` | Persist state when its value changes |
| `client/src/storage.js` | Recover from unavailable storage or invalid JSON |
| `client/src/sessions.js` | Repair saved records and migrate obsolete chooser cards |
| `client/src/hooks/useTutorRequest.js` | Snapshot preferences/history and append results to the originating session |
| `client/src/tutorRequests.js` | Lock duplicate requests, retain retry metadata, and cancel on unmount |
| `client/src/api.js` | HTTP transport, bounded transcript serialization, and activity statistics |
| `client/src/components/` | Present and edit state through props and callbacks |
| `shared/learning.mjs` | Preference IDs, defaults, and validation |
| `shared/conversation.mjs` | History limits, supported intents, and clarification labels |
| `shared/turns.mjs` | Validate/normalize tutor cards and quizzes before rendering |
| `shared/activity-prompt.mjs` | Separate activity tasks from context, including legacy messages, for rendering and history |
| `server/index.js` | Read environment configuration and start the listener |
| `server/app.js` | HTTP routes, request cancellation, and JSON error responses |
| `server/tutor.js` | Validate tutor input and build teaching instructions/schema |
| `server/activities.js` | Guide proactive activity selection using recent explanations, activities, and pending attempts |
| `server/models.js` | Select supported models and perform bounded fallback attempts |

## Request lifecycle

1. A student message or explicit action selects a tutor intent. Creating a new
   session dispatches `start` immediately, using sidebar defaults if unchanged.
2. A synchronous lock prevents double clicks from sending duplicate requests.
   The app permits one tutor request at a time. Students may browse another
   session while it runs; the busy indicator belongs to the originating session.
3. The request snapshots the current preferences. A retry uses the latest
   preferences while preserving the original intent and clarification/summary
   metadata. Changing a setting does not itself make a request.
4. The client serializes only the last 24 relevant turns (1,500 characters each),
   or 60 turns (900 characters each) for a summary. It scans backward until the
   window is filled rather than formatting the entire session. The server applies
   the same limits independently; browser state is not a trusted API boundary.
5. The server validates inputs, builds a system instruction from allowlisted
   preferences, and supplies a task directive and transcript. Fallback attempts
   reuse that request without changing teaching settings or conversation history.
6. Both server and browser validate output cards. Invalid or blank responses
   become retryable errors; malformed quizzes are omitted rather than rendered
   with unsafe IDs or ambiguous grading.
7. Results are appended to the session that issued the request, even if the
   student has navigated elsewhere. Unmounting the app cancels its transport.
   HTTP disconnects abort upstream work and pending fallback delays. Cancellation
   cannot undo work already processed by the provider.

## Persistence and cost boundaries

Browser storage is repaired per record: a malformed card does not discard other
sessions. Unsupported fields in preferences are discarded, while invalid supplied
API preference values return HTTP 400. Storage errors leave the current in-memory
session usable, but a failed write cannot be restored after a reload.

Sidebar session grouping is a single pass over the sessions. Summary statistics
still inspect the whole session because their counts must include older activity.
All messages remain in browser storage; only the bounded transcript is sent.

There are at most four distinct model attempts, with SDK retries disabled and
timeouts/backoff documented in the README. The model allowlist contains Free-tier
options but cannot determine the Google project's actual billing tier. The server
binds to `127.0.0.1` by default; public hosting requires authentication and request
rate/concurrency controls before sharing a server-side key with untrusted users.

## Validation

`npm test` runs pure contract/session/request tests, mocked SDK fallback tests,
and local HTTP tests with injected model clients. These tests do not contact
Gemini or read a real key. `npm run build` compiles the client.

Live scenario checks are still needed for visual layout, keyboard interaction,
model adherence to preferences, and tutoring quality. Adaptive activity frequency
is a prompt instruction, not a deterministic scheduler or evidence of learning
improvements.
Medium/High explicitly request actual selected activities without waiting for an
activity request. The prompt includes recent activity types and consecutive
explanation turns; the model still decides readiness from context. Ordinary
"explain" requests do not implicitly opt out. Clarification and existing attempts
take precedence, and Low/all-off disables unsolicited activities. No extra
planning call or background generation is introduced.

## Activity presentation

New non-quiz tasks use `activity_prompt`, with introductory context in `message`.
The UI renders questions in a labeled, bordered **Your turn** block with larger,
stronger text; quiz questions use the same treatment. Legacy activity cards can
extract a final question or an invitation such as "In your own words" from the
message. Ordinary explanation text is not rewritten. A key-idea box is hidden
alongside a task/unanswered quiz to avoid revealing the answer. History mirrors
the visible task and does not include that hidden takeaway.
