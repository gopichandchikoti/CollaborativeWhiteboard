# Collaborative Whiteboard

A private infinite canvas with real multi-user editing and durable server storage. Built with React,
TypeScript, Vite, NestJS, Yjs and SQLite. Desktop web first, with responsive controls for smaller screens.
Version **1.0.0**. Windows / Node 22.23.4 verified locally; other operating systems are not verified.

Security review: the installed Node 22.13.1 is behind current security patches. Use a maintained patched
runtime before public use; the latest Node 22.x release checked on 2026-11-07 is
[22.23.4](https://nodejs.org/en/blog/release/v22.23.4). Package audit results do not cover the Node binary.
See the [current application audit](docs/architecture.md#15-current-application-audit-2026-11-07)
and [proposed agent-standard refinements](docs/architecture.md#16-proposed-agent-standard-refinements-awaiting-owner-approval).

## Open locally

**[http://localhost:5603](http://localhost:5603)**

Create your own account on the sign-in screen, then create a board. There are no default credentials,
cloud accounts, seeded personal records or external services to configure. New accounts require 15–128 characters;
existing 12-character passwords remain usable for sign-in.
The app runs on this computer only. Invitation links work in another browser/profile on the same computer.

The previous application was a drawing scaffold. This build adds the real persistence, authentication,
authorization and collaboration workflows. Browser visual verification was unavailable and the user chose
API and automated component verification; no screenshot or full WCAG conformance claim is provided.

## Features

| Capability | Behavior |
| --- | --- |
| Workspaces and boards | Create, search, rename, delete; owners administer their workspaces |
| Canvas | Pan, zoom, select, move, resize, reorder and duplicate objects |
| Tools | Rectangles, ellipses, sticky notes, editable text, arrows, freehand strokes, frames and raster images |
| Collaboration | Authenticated Yjs updates, live cursors, presence, reconnect and durable save acknowledgements |
| Undo / redo | Local-origin Yjs undo; collaborators' remote transactions remain separate |
| Recovery | Per-account IndexedDB drafts; reconnect merges offline edits; restore/compaction generations reject stale drafts |
| Sharing | Owner/editor/commenter/viewer roles, expiring one-use invitations, role changes and revocation |
| Comments and history | Comment, resolve, save up to 20 checkpoints, restore, compact saved collaboration state |
| Export | Authenticated PNG and self-contained SVG, including private images; no PDF export |
| Templates / presentation | Retrospective and simple-flow structures; distraction-free presentation view |
| Accessible navigation | Named controls, keyboard shortcuts, focus-restoring dialogs and searchable object list |

## Setup and start

Run from this project's root with Node.js **22.23.4 or a newer maintained security patch** and npm. Dependency installation needs registry access.
Node 22 prints an experimental SQLite warning; it is expected for its built-in SQLite API.

```powershell
npm ci --prefix frontend
npm ci --prefix backend
npm run build --prefix backend
node tools/start-local.mjs
```

The launcher starts hidden, loopback-only services, checks HTTP readiness, and records exact service PIDs in
`.local-run/whiteboard-processes.json`. Re-running it reuses its healthy services. It refuses occupied ports owned by
other services. Logs are under `.local-run/`; they are diagnostic output, not readiness evidence.

```powershell
node tools/stop-local.mjs
```

The stop command validates the recorded service command lines before stopping them. It does not stop by
process name. The application is left running when requested for local use. On Windows, process termination
can be abrupt; SQLite transactions and WAL provide committed-data recovery.

Alternatively, use two terminals: `npm run start:dev --prefix backend` and `npm run dev --prefix frontend`.
The VS Code workspace task **Start frontend + backend** remains available. The backend dev script rebuilds
once and watches compiled output; rerun its build after changing TypeScript source, or run `tsc --watch`
in the backend during development.

- Frontend: <http://localhost:5603>
- API health: <http://localhost:5604/health>
- Proxied health: <http://localhost:5603/api/health>
- Authenticated WebSocket: `/collaboration?board=<board UUID>` on the frontend origin

## Usage

Choose a tool and drag or click on the canvas. A completed shape switches to Select. Select an object to
edit its text or geometry in the inspector; press Save to apply the inspector form. Drag an object to move it,
or its bottom-right handle to resize it. Double-click an object to focus text editing. The object list provides
an alternative to pointing at canvas objects. Use Pan or Space + drag; wheel pans and Ctrl/Cmd + wheel zooms.

Shortcuts: **V** select, **H** pan, **R** rectangle, **O** ellipse, **S** sticky, **T** text, **A** arrow,
**P** pen, **F** frame, **Delete/Backspace** remove, **Ctrl/Cmd Z** undo, **Ctrl/Cmd Shift Z** redo,
arrow keys move a selected object (Shift moves 10 canvas units), **Escape** clears selection / exits presentation.
Shortcuts do not run while editing form fields or using dialogs.

Wait for **All changes saved** before exporting or closing. Offline edits stay in a per-account device draft;
the browser must retain IndexedDB for recovery. A cache failure is shown explicitly. A revoked, restored or
compacted board must be reopened; stale drafts cannot be uploaded into its new generation.

If a change is rejected, use **Recover saved board** to explicitly discard its device draft and reopen the
saved board. Closing a rejected or reset connection cannot recreate an invalid draft during teardown.
New objects receive a layer; equal layers use stable IDs so collaborators and exports share the same paint order.

## Verification

Run from the project root after both installs:

```powershell
node tools/check-source.mjs
npm run lint --prefix frontend
npm run lint --prefix backend
npm run format:check --prefix frontend
npm run format:check --prefix backend
npm run typecheck --prefix frontend
npm run typecheck --prefix backend
npm run test:coverage --prefix frontend
npm run test:coverage --prefix backend
npm run build --prefix frontend
npm run build --prefix backend
node tools/check-web.mjs
npm audit --prefix frontend
npm audit --prefix backend
npm run benchmark --prefix frontend
```

Coverage includes every application source module, including untested startup entry points. Global gates
require 90% for statements, branches, functions and lines individually. Authentication, board authorization,
document validation and the frontend collaboration state machine have additional 95% gates.
ESLint enforces cyclomatic complexity <=10, cognitive complexity <=15, nesting <=3 and practical 120-column
lines. The source check limits files to 400 lines and functions to 50 logical statements, scans common secret
patterns, checks content placement and rejects duplicate JSON keys. It is a focused scan, not security certification.

Current executed results and limitations are recorded in [architecture](docs/architecture.md#153-executed-checks).
The HTTP smoke command uses random loopback ports and an in-memory database, checks both development HTML
and the production build preview, and closes its own servers. Existing app processes are preserved. It does
not execute browser JavaScript or replace visual/accessibility checks. Type checking includes backend tests
and the frontend Vite configuration. Content and sharing services own authorization, limits and transactions;
controllers adapt HTTP identity and responses.
The native renderer benchmark runs separately from coverage, with its original 32 ms p95 budget; parallel
instrumentation can distort timings. The component suite uses four workers and separates long UI workflows.
CI is defined for pushes, PRs and manual runs with frozen installs, the same gates, audits and duplication
checks. Action SHAs were verified against official Git references on 2026-11-07. Hosted CI has not been run:
the root Git repository has no commits or remote, and this work does not commit or publish.
Weekly npm/action update configuration is included for future hosted use. The original changed source files
were preserved under `.local-run/pre-completion-source-20261107/` before applying the implementation.

## Data, backup and recovery

The default database is `backend/data/whiteboard.sqlite`. It contains account password hashes, expiring
sessions, board metadata, Yjs snapshots, private images, comments, invitations, checkpoints and bounded audit
events. Keep it private and back it up. There is no analytics, third-party image storage, remote font request,
email delivery or account recovery service. Authentication uses HttpOnly SameSite cookies and adaptive scrypt.

```powershell
node tools/backup.mjs "path-to-a-new-backup.sqlite"
```

The command makes a consistent SQLite backup and refuses an existing destination. To restore: stop the
services, preserve the current database and its `-wal` / `-shm` files together, copy the verified backup to the
default database path, then restart. Test restoration in an isolated copy first. Never replace a live database.
Environment variables are read from the process; `.env` is not loaded automatically. See `backend/.env.example`.

## Layout

This application uses **one Git repository at `CollaborativeWhiteboard/`**, on `main`. The React frontend
and NestJS backend are two npm packages inside that repository. Each keeps its own `package.json` and
`package-lock.json`; they are installed and built separately but versioned and pushed together with the
root README, architecture, tools and CI. No npm workspace migration is required for this structure.

```text
.git/                     The application's only active Git metadata (local; never committed)
CollaborativeWhiteboard.code-workspace  Optional single-folder VS Code workspace
frontend/src/components/   Screens, canvas, toolbars, dialogs and inspector
frontend/src/lib/          API, content, collaboration, offline cache, exports and uploads
frontend/public/           Single authored UI content model
frontend/tests/            Component, pixel, domain, accessibility and performance tests
backend/src/               HTTP adapters, domain services, storage and WebSocket gateway
backend/tests/             Real SQLite / HTTP / WebSocket and recovery tests
tools/                    Local lifecycle, backup and verification helpers
docs/architecture.md       Decisions, contracts, threat model, traceability and evidence
.github/workflows/ci.yml   Unpublished verification workflow
```

Open the **CollaborativeWhiteboard folder** in VS Code, or open the supplied `.code-workspace` file.
Both now use the application root; the workspace retains **Start frontend + backend** with corrected
package paths. If an already-open window still shows the former Frontend/Backend roots, reopen the updated
workspace or use **File > Open Folder** and choose CollaborativeWhiteboard, then reload the window if needed.
Source Control should show one repository. Package-level `.gitignore` files are ignore rules, not repositories.

On 2026-11-07 the two empty nested repositories were consolidated into this root repository. They had no
commits, staged files or remotes. Their complete Git metadata was archived under the ignored
`.local-run/git-consolidation-*/frontend-git` and `backend-git` directories for recovery; application source
and local data were preserved. Do not copy that metadata back into the package folders during normal use.

There is no first commit or remote yet. To publish the whole application, create an empty remote repository,
then run these commands **from CollaborativeWhiteboard**, replacing the example URL with your repository URL:

```powershell
git add .
git status
git commit -m "Initial Collaborative Whiteboard application"
git remote add origin https://github.com/YOUR_USERNAME/CollaborativeWhiteboard.git
git push -u origin main
```

Review the staged file list before committing. Dependencies, build outputs, local runtime/backup files,
databases and `.env` secrets are ignored; safe `.env.example` files remain versioned.
The consolidation did not stage, commit, configure a remote or push anything.

## Limits and troubleshooting

- This is a single-process local deployment, not an Internet-hosted multi-tenant service. Before hosting:
  configure HTTPS, deployment origins, enrollment/recovery policy, backups/monitoring and a production static
  server. PostgreSQL/object storage and horizontal pubsub remain deployment options described in the ADR.
- Limits: 500 boards/account, 100 workspaces/account, 5,000 objects/board, 2 MB encoded CRDT state,
  4,000 points/stroke, 4,000 text characters/object, 100 images and 200 comments/board, 20 checkpoints.
  Image files are limited to 4 MB, converted to PNG and downscaled to 2,048 pixels in the browser; the server
  decodes and checks PNGs up to 4,096 pixels per dimension. PNG export is capped at 4,096 pixels per side.
- At most 10 live sessions/account, 100 pending invitations and 100 members/board. Password hashing admits
  two concurrent operations with no waiting queue; saturation returns a retryable rate-limit error. Ordinary
  JSON requests are capped at 16 KiB, raster upload JSON at 6 MiB; compressed request bodies are refused.
- HTML delivers CSP and framing/nosniff/referrer/permission protections in dev and built preview. A public
  static host needs its own verified HTTP header configuration. Vite's dev server is not a production host.
- This audit did not restart the existing backend process; restart it through the documented local lifecycle
  when ready to load the rebuilt hardening changes. Existing accounts, boards and database schema are preserved.
- Connectors are geometric arrows; they are not bound to moving shapes. Frames are visual containers,
  not nested group transforms. No pressure-sensitive pen, rich text, rotation, multi-selection or pinch gestures.
- English content is provided. The adapter supports locale fallback, parity, interpolation and RTL direction;
  additional translated locale dictionaries are not supplied.
- If save is rejected or access changes, reopen the board. Compact saved state before long-lived CRDT
  tombstones reach the limit. Export always reads the authorized canonical server snapshot.
- Port errors never select another port. Inspect the exact listener and stop only the intended application.
- If the API is unreachable, start/build the backend, then check both health URLs. API errors contain a
  correlation ID; internal errors are sanitized. No passwords or invitation tokens are logged by application code.

## Demonstration checklist

Create an account/workspace/board; draw and edit text; move/resize/undo; open the same board in two browser
profiles and invite the second account; compare edits and presence; disconnect/reconnect one client; refresh
and restart to check persistence; test viewer denial, comment resolution, checkpoint restore and PNG/SVG export.
The API/component equivalents have run; a human browser demonstration remains to be performed.

## Third-party notices

[Dependency inventory](docs/third-party.json) records installed direct dependencies and declared licenses.
React/Yjs/NestJS/Vite use their respective package licenses; Lucide icons retain their ISC notice in the package.
No proprietary reference-site code, artwork or fonts were copied. The application owner has not selected a
source license; this task does not invent one. The retained Docker Compose PostgreSQL file is legacy reference
configuration and is not required or used by this local build.
