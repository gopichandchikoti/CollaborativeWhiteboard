# Collaborative Whiteboard — Real-Time Infinite Canvas

**Type:** Agent-ready application development specification  
**Companion:** `UNIVERSAL_APPLICATION_AGENT_RULEBOOK.md`  
**Objective:** Build a real, installable or deployable product, not a static prototype.

Build an original multi-user infinite whiteboard inspired by collaborative visual thinking tools. It should support real persistence and collaboration, not a static Miro clone. Target desktop web first with usable tablet/mobile viewing and essential editing.

## A. Agent execution contract and universal standards

**Read the user's `UNIVERSAL_APPLICATION_AGENT_RULEBOOK.md` first**, then this application specification. The universal rulebook governs design research (including approved sites such as Godly, recent.design, 21st.dev, Realtime Colors, Fontshare, Lenis, Motion, React Spring and component references), accessibility, secure engineering, coding style, testing, observability, documentation, and honest verification. **Do not copy or embed the universal rulebook**; keep it as a separate source of truth. Where this document narrows the platform, deliverable or technology, follow this specification. Where instructions conflict, explain the conflict and request a decision rather than silently weakening safety, licensing, quality or acceptance criteria.

Before implementation: inspect the repository and installed tools; preserve user changes; write a short plan, acceptance criteria, architecture decision record (ADR), and one falsifiable hypothesis plus a focused executable check. Research at least three suitable design references if browsing is available; record actual URLs, date checked, suitability, licensing, and a unique original visual direction. If unavailable, record the limitation and proceed with a defensible design—not a claim of verified research. Avoid fake metrics, nonfunctional buttons, template dashboards, stock-only content and generic AI-looking layouts. Use real behavior and authentic states.

**Code gates (policy):** 120-character maximum source lines; cognitive complexity <=15, cyclomatic complexity <=10, control nesting <=3, functions target <=50 logical lines, files target <=300 lines and split before 400; <=3% new-code duplication; >=90% coverage for lines/branches/functions/statements where measurable, >=95% for critical security or financial/state-transition modules. Enforce with appropriate platform tools and document exceptions; coverage alone does not prove correctness. No hard-coded secrets, unchecked async work, broad suppression, dead code or silent errors. Run formatting, lint/static analysis, type checks where applicable, focused tests, full tests, build, security/dependency checks, and real runtime/UI checks. Report exact commands, results and skipped checks. Do not claim success without execution.

**Accessibility and performance:** WCAG 2.2 AA target for applicable UIs; semantic controls, keyboard, screen-reader labels, visible focus, reduced motion, responsive layouts, touch targets, loading/empty/error/retry/success states, and practical performance budgets. For games, make accessibility options relevant to gameplay (rebindable controls, contrast, audio toggles, pause and reduced effects). Use animation libraries only when justified; smooth scrolling (e.g. Lenis) is not appropriate for every product and must not disrupt native scrolling or accessibility.

**Engineering:** keep UI, domain rules, infrastructure, adapters and persistence separate; validate all external inputs; least-privilege authorization when accounts exist; dependency/secret scanning; structured privacy-safe logs and correlation IDs where networked; secure default configuration; migrations, backups and rollback where persistent server data exists. Test edge cases and failure recovery. Never ship development mocks as production integrations. Do not commit, push, delete unrelated work or perform destructive migrations without explicit approval.

**Standard deliverables:** runnable source, README with exact setup commands, architecture rationale and diagram, relevant API/data contracts, tests and coverage configuration, CI pipeline, sample assets/seed data clearly marked, security/privacy notes, packaging/build instructions, troubleshooting, and a short demonstration checklist. Work in vertical milestones; each milestone must be usable and verified before expanding scope.


## B. Product scope and personas
- Personas: board owner, editor, commenter, viewer, workspace admin.
- Jobs: create board; add/edit/move shapes, connectors, freehand strokes, text, sticky notes and images; organize frames; invite teammates; work concurrently; export; revisit history.
- MVP: workspace/board CRUD, infinite pan/zoom canvas, selection and transforms, shapes/sticky notes/text/arrows, autosave, authenticated sharing, live cursors/presence, reconnect, export PNG/SVG/PDF if technically supported. Advanced: comments, frames, templates, presentation mode, board search, offline edits, version history.
- Do not promise unrestricted PDF export unless implemented and tested. Protect private board exports and images.

## C. Recommended stack and why
- **Frontend:** React + TypeScript + Vite, accessible application shell, canvas engine. Evaluate **tldraw** (license/commercial terms and embedding constraints) versus **Konva** or custom SVG/Canvas; choose via ADR after verifying current licensing, API maturity, performance and required behaviors. Do not blindly clone Miro or copy proprietary assets.
- **Collaboration:** Yjs CRDT document for shared object state, with awareness/presence separate from durable content. Evaluate Hocuspocus or y-websocket as transport. Server must authenticate socket connections and authorize every board subscription/write.
- **Backend:** Node.js + NestJS (or Express by ADR), PostgreSQL for users, workspaces, memberships, board metadata and snapshots; object storage for uploaded images; Redis/pubsub only when horizontal scaling requires it.
- **Data model:** User, Workspace, Membership, Board, BoardAccess, BoardSnapshot, BoardEvent, Asset, Invite, Comment. Stable object IDs, schema versions and safe migrations.
- **Architecture:** frontend sends CRDT updates through authenticated realtime gateway; server validates authorization and size, persists durable updates/snapshots, broadcasts to other collaborators; presence is ephemeral and not treated as canonical content.

## D. Architecture and core flows
```text
React UI / Canvas Engine
   | local Yjs document + undo manager
   +---- WebSocket / collaboration gateway ---- other clients
   |                     |
   |                     +---- auth + board permissions
   |                     +---- durable Yjs updates/snapshots
   +---- REST API --------+---- PostgreSQL board metadata
                          +---- Object storage (images)
```
**Open board:** authenticate -> fetch board metadata/permissions -> hydrate snapshot -> subscribe to authorized room -> merge subsequent updates -> display remote cursors. **Edit:** local change -> CRDT update -> server validates membership/size -> persists -> broadcasts -> ACK/reconnect reconciliation. **Invite:** owner selects role -> server creates expiring invitation -> recipient accepts -> server enforces board access on REST and sockets.

## E. Design direction and reference research
- Research current visual patterns of Miro, FigJam, Excalidraw and tldraw where accessible; evaluate toolbar density, contextual controls, mini-map, zoom controls, collaboration cursors and keyboard affordances. Produce an original layout and design tokens; no copied branding.
- UI: minimal chrome around canvas, tool rail, context-sensitive inspector, clear selected-object handles, persistent collaboration indicators, nonintrusive toasts, explicit reconnect/conflict status. Keyboard shortcuts, touch/pointer support, screen-reader accessible controls and alternative structured object list for nonvisual navigation.
- Motion should communicate transitions without affecting drawing precision. Avoid Lenis smooth-scroll on the infinite canvas; use deliberate pan/zoom physics and pointer events.

## F. Security and concurrency
- Per-workspace/board RBAC and per-object resource checks where needed; server-side authorization for every board ID, asset, export, socket join and CRDT update. Rate/size limits, upload validation, SVG sanitization or safe rasterization, CSP and secure links.
- Bound Yjs document growth; snapshot/compaction and retention; handle reconnect storms, out-of-order updates, two users editing same object, and deleted board sessions. Never trust client timestamps for authorization.
- Audit invitations, permission changes and exports. Test cross-tenant access denial and revoked-user disconnection.

## G. Milestones
1. Scaffold + design ADR + secure auth + database migrations and CI.
2. Single-user functional board with shapes, text, sticky notes, pan/zoom, undo/redo and autosave to durable server storage.
3. Two-browser collaboration, presence, reconnection, offline/online reconciliation and authenticated room isolation.
4. Share roles, invites, image upload, comments and export; test invalid and unauthorized paths.
5. Optimize large boards (virtualization/viewport culling, batching, snapshots), accessibility, browser compatibility, load tests, monitoring and deploy.

## H. Acceptance scenarios
- Two browsers edit the same board; both converge after temporary disconnection; refresh preserves all committed objects.
- Unauthorized user cannot read/write board or assets via guessed URL or direct WebSocket connection.
- 1,000+ objects remain usable on a target midrange laptop; measure pan/zoom and memory and document results.
- Undo affects intended local actions without incorrectly erasing collaborators' work; exported result matches board within documented limitations.
