# Canvas interaction repair

Historical scaffold repair notes. Current persistence, collaboration, controls and verification are described
in the root README and `docs/architecture.md`; the pixel regression checks described below remain in the suite.

## Plan and acceptance

Keep the existing Canvas 2D UI. Render a temporary item on pointer movement, then commit that same item
on release. Implement the existing pen, arrow and Select toolbar tools. Keep selection feedback and
drawing cursors visible, and capture the pointer so a drag can finish outside the canvas.

- Rectangle, ellipse, sticky note and arrow previews must appear before pointer-up in every drag direction.
- Pen strokes must follow sampled pointer positions immediately, including a single-click dot.
- Select must identify the topmost object, show an outline and preview dragging without duplicate objects.
- Escape, pointer cancellation and capture loss must discard a draft and restore an object being moved.
- Resizing and high-density displays must preserve the canvas content and pointer coordinates.
- Dependencies, build output, coverage, logs, local environment files and caches must stay out of Git.

## Architecture decision

Pointer events cover mouse, pen and touch with one gesture path. An interaction ref retains the current
gesture between events; React state holds committed items and a separate preview. A cancelled movement
therefore leaves the original item untouched. The renderer replaces a moving object in its existing
paint order rather than drawing a second copy. Geometry, hit detection and Canvas 2D rendering are
separate from React event handling. A dark crosshair with a white outline stays visible over light and
dark content, independently of the selected paint color.

This is a focused repair of the existing UI. No external visual assets or design changes are needed.
Shared state, persistence, remote cursors, pan/zoom and resizing selected objects remain outside this fix.

## Falsifiable regression check

Hypothesis: the missing preview comes from only adding an item on mouse-up, while pen and selection
have no implementation. Automated interaction tests dispatch pointer-down and pointer-move without
pointer-up and inspect actual Canvas 2D pixels; a blank canvas fails the check. The same tests cover
pen paths, selection movement and cancellation. Geometry tests cover reverse drags and hit detection.

Run `npm run typecheck`, `npm run test:coverage` and `npm run build` in `frontend`.

## Verification results

- Frontend type check and production build passed; backend production build passed.
- All 29 regression tests passed. Canvas coverage: 100% lines/statements, 92.41% branches, 96.15% functions.
- The running Vite server on port 5603 serves the updated pointer interaction and pen geometry modules.
- Backend health remains available on port 5604. Both repositories' ignore patterns were checked with Git.
- Interactive browser verification was unavailable because the browser access host could not be reached.
  The interaction tests use DOM pointer events and an actual Canvas 2D rasterizer, rather than screenshots
  from an interactive browser. Native browser pointer capture is requested by the code and asserted in tests.
- No lint script is configured. Dependency audit findings remain documented in the root README;
  this change does not upgrade the existing Vite/Vitest dependency line.
