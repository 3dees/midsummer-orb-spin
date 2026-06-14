## Goal
Replace the current bare `.slot-grid` look on `/play` with an enchanted pixel-art cabinet that frames the existing 5×4 interactive grid. Gameplay logic stays untouched — purely a visual swap.

## Approach

1. **Generate a cabinet artwork** with `imagegen` (premium, 9:16 portrait, ~896×1600) using the user's prompt verbatim (minus the Midjourney-only `--sref/--ar/--v/--style/--stylize/--no` flags, which are reinterpreted as natural-language constraints). Save to `src/assets/cabinet.png`. Key constraints baked into the prompt:
   - Pixel art, hard edges, limited palette, solid black background
   - Ornate twisted wood + mossy stone frame, foxgloves/vines at base & sides only
   - Empty inner grid area (4 rows × 5 cols, thin dividers) — kept visually empty so our DOM grid sits inside
   - No characters, no text, no traditional slot-machine chrome
2. **Wire it into `play.tsx`**:
   - Wrap the existing `<div className="slot-grid">` in a new `<div className="cabinet">` containing an `<img className="cabinet-frame">` and the grid positioned absolutely inside the frame's inner rectangle.
3. **Style in `src/styles.css`**:
   - `.cabinet` — `position: relative`, `aspect-ratio: 9/16`, `max-width: 520px`, centered, `image-rendering: pixelated` on the frame.
   - `.cabinet-frame` — fills cabinet, `pointer-events:none`.
   - `.slot-grid` overridden inside `.cabinet` to `position:absolute` with percentage `inset` values calibrated to the frame's inner cell area (initial guess: `top: 22%; bottom: 18%; left: 14%; right: 14%`); transparent background, no own border.
   - `.cell` background becomes near-transparent (`rgba(0,0,0,0.25)`) with a thin amber inner border so the cabinet glow shows through.
   - Add a subtle amber back-glow behind the grid (`box-shadow: inset 0 0 80px rgba(255,180,80,0.15)`).
4. **Verify** by viewing the preview at the current mobile viewport (683×716) and adjusting the `inset` percentages if the grid doesn't land cleanly over the frame's empty cell area. Iterate up to 2 calibration passes.

## Out of scope
- No changes to scoring, tooltips, pool modal, spin log, or draft UI.
- Not replacing per-symbol sprites with the creatures shown in the reference image (that's a much larger art pass).
- No animation of the frame (fireflies/glow stay static for now).

## Files
- new: `src/assets/cabinet.png` (+ no `.asset.json` needed; bundled import)
- edit: `src/routes/play.tsx` (wrap grid only)
- edit: `src/styles.css` (cabinet + grid overlay rules)
