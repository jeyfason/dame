# Dame Design System — Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Dame
**Direction:** Classic premium — a real board game in the browser
**Spec:** `docs/specs/2026-09-09-dame-ui-ux-revamp-design.md` (approved 2026-09-09)
**Last updated:** 2026-09-13 — supersedes the previous purple/neon spec (never applied)

---

## Global Rules

### Color Palette (tokens live in `app/dame-tokens.css`)

No raw hex in components — everything routes through CSS variables.

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Board light squares | `#E8D5B0` | `--dame-board-light` |
| Board dark squares | `#A9713F` | `--dame-board-dark` |
| Board frame (espresso) | `#3E2A1E` | `--dame-board-frame` |
| Piece white (cream) | `#F7F1E3` | `--dame-piece-white` |
| Piece black (jet) | `#1C1B18` | `--dame-piece-black` |
| Accent (aged brass) | `#C9A227` | `--dame-accent` |
| Accent highlight | `#E2C45C` | `--dame-accent-hi` |
| On accent (ink) | `#241C05` | `--dame-accent-ink` |
| Page felt | `#23301F` | `--dame-felt` |
| Deep felt | `#1A2418` | `--dame-felt-deep` |
| Card surface | `#2A3327` | `--dame-surface` |
| Deep surface | `#222B20` | `--dame-surface-deep` |
| Text | `#F2EDE3` | `--dame-text` |
| Muted text | `#9BA694` | `--dame-muted` |
| Danger (invalid flash) | `#D05B4C` | `--dame-danger` |

**Color notes:** warm walnut board, cream/jet pieces, aged brass for selection,
focus, kings and primary actions, deep forest felt for page surfaces. The felt
identity IS both themes (`.dark` keeps the same values).

shadcn/ui variables (`--background`, `--card`, `--primary`, …) are mapped onto
this palette in `app/globals.css` so `components/ui/*` blend in automatically.

### Typography (next/font, self-hosted)

- **Display / headings / wordmark:** **Fraunces** — `font-heading` utility, `--font-fraunces`
- **Body / UI:** **Outfit** — `font-sans` utility, `--font-outfit`
- **Board coordinates** (a–j, 1–10): Outfit, 10px, small tracking, low opacity,
  on the espresso frame (`--dame-frame-text`)
- Buttons and labels: Outfit 500–600 weight; headings use Fraunces 600

### Motion scale (`dame-motion`)

| Token | Value | Used for |
|-------|-------|----------|
| `--dame-t-slide` | `180ms` | Piece slide (also `ANIMATION_DURATION_MS` in AnimatedBoard) |
| `--dame-t-shake` | `250ms` | Invalid-tap shake + flash |
| `--dame-t-glow` | `300ms` | Plaque glow, dimming |
| `--dame-t-overlay` | `220ms` | End overlay fade |
| `--dame-t-lift` | `120ms` | Piece hover lift |

One shared reduced-motion path in `app/globals.css`: all dame animations
collapse to opacity-only or none under `prefers-reduced-motion: reduce`,
and framer animations get `duration: 0` via `useReducedMotion()`.

### Radii

- `--dame-radius: 14px` — cards, buttons, plaques
- Frame: `calc(var(--dame-radius) * 1.3)`; board grid: `10px`

---

## Component Specs

### Board (`.dame-board-scene`, `.dame-board-frame`, AnimatedBoard)

- **3D scene:** the frame sits in a CSS perspective container
  (`.dame-board-scene`, 1300px) tilted `rotateX(9deg)` toward the viewer,
  with an extruded wooden base edge (stacked box-shadow layers) and
  top-down lighting baked into the grain overlay — a real, physical board
  without WebGL
- Espresso frame with beveled inner edge (layered inset shadows), ambient
  drop shadow, SVG-noise grain overlay (`.dame-grain`) + lighting gradient
- Squares: maple light / walnut dark with a subtle diagonal sheen gradient
- Coordinates rendered on the frame via a CSS grid (`auto 1fr` column for
  ranks 1–10, row for files a–j)
- Squares are real `<button>`s: `data-testid="square-{r}-{c}"`, keyboard
  play (arrows + Enter), `aria-label` with color/kind/coordinates

### Pieces (`.dame-piece`)

- Pure CSS discs: radial-gradient body + repeating radial "groove" rings +
  inset highlights, ground shadow that anchors them to the tilted board
- **Customizable textures** (site-wide via `<html data-piece-texture>`):
  Classic lacquer (default) · Walnut grain · Marble (SVG turbulence) ·
  Brushed metal — chosen with `PieceStylePicker` (persisted in
  localStorage, `dame:piece-texture`), applied to boards AND plaques
- Kings: engraved brass crown (lucide `Crown`, filled `--dame-accent`)
- Own movable pieces hover-lift (`.dame-liftable`); selected piece scales
  1.06 with brass glow (`.dame-selected` + motion scale)
- Must-capture pieces pulse brass (`.dame-pulse`) — teaches the majority rule

### Feedback (in-board only — NO toasts in gameplay)

- Legal destinations: glowing brass dot (`.dame-dest-dot`); capture
  destinations: stronger brass ring (`.dame-dest-ring`)
- Invalid tap: square shakes ~3px + terracotta flash (`.dame-shake`,
  `.dame-flash`) + low wooden thud (`playInvalid()`); no text popup
- Last move: quiet brass trail on from/to squares (`.dame-trail`)
- Promotion: expanding brass ring + crown fade-in (`.dame-burst`)
- Not your turn: board dims (`.dame-dimmed`), taps give the gentle shake only
- Game end: full-board overlay, Fraunces result, actions slide in at 220ms

### Player plaques (PlayerPlaque)

chess.com-style rows above/below the board: color chip, name, captured-piece
tray (mini discs + count). Active player glows brass; inactive dims 70%.

### Buttons

- **Primary (brass):** `--dame-accent` bg, `--dame-accent-ink` text, radius
  `--dame-radius`, hover scale ≤1.03
- **Ghost:** transparent/surface-deep bg, `rgba(242,237,227,0.16)` border,
  hover border `rgba(201,162,39,0.45)`
- All buttons: `min-h-[44px]`, visible focus ring (`--dame-accent`)

### Cards

Felt surface: `--dame-surface-deep` bg, `rgba(242,237,227,0.08)` border,
radius `--dame-radius`. Hover may warm the border toward brass — never scale.

### Shell / navigation

- Sticky top nav: felt glass (`backdrop-blur-md`), Wordmark left, links
  (Play, Leaderboard, Profile) center, UserBadge right
- Mobile: bottom tab bar (Play / Ladder / Profile), `env(safe-area-inset-bottom)`
- Page background: deep felt with a radial vignette from the top

### Logo

"Dame" wordmark in Fraunces with a small brass disc-dot over the "a"
(`components/dame/Wordmark.tsx`) — pure CSS, no image asset.

---

## Style Guidelines

**Style:** Classic premium / tactile board game

**Keywords:** Walnut, felt, brass, warm, physical, ridged discs, quiet motion,
chess-club sophistication

**Key effects:** layered inset shadows (bevels), radial-gradient material
shading, subtle SVG grain, short physical motion (120–300ms), brass glow
for everything interactive

### Page patterns

- **Landing `/`:** hero wordmark + live mini demo board (real component,
  scripted 4-move capture loop) → three brass feature rows → minimal footer
- **`/play`:** three mode cards (friend invite / bot / pass-and-play) →
  local board with plaques; fits one screen
- **`/play/bot`:** the built-in bot (client-side negamax engine, unrated) —
  difficulty + color segmented controls, "Thinking…" plaque note, same
  in-board feedback; difficulty Easy/Medium/Hard trade search depth for noise
- **`/play/join`:** two felt cards (create invite / join with code), big
  brass code display; copy-link keeps its sonner toast (the ONLY toast)
- **`/play/[gameId]`:** centerpiece — opponent plaque above, yours below,
  board flips for black (presentational CSS rotate), chat right rail on
  desktop / below on mobile, header with game chip + connection dot +
  piece-style picker + sound
- **`/leaderboard`:** felt rows, gold/silver/bronze medal discs, segmented
  All/Friends control
- **`/profile/[id]`:** card header (avatar/name/country/joined), rating
  tiles, brass sparkline, FriendButton

---

## Anti-Patterns (Do NOT Use)

- ❌ **Raw hex in components** — tokens only (`app/dame-tokens.css`)
- ❌ **Toasts during gameplay** — feedback is physical and in-board; sonner
  is reserved for the invite copy action on `/play/join` (and out-of-game
  error paths like rematch failures)
- ❌ **Text popups over the board** — use shake/flash/pulse
- ❌ **Emojis as icons** — lucide only
- ❌ **Low contrast text** — `--dame-muted` on felt passes 4.5:1 for body copy
- ❌ **Instant state changes** — always transition within the motion scale
- ❌ **Invisible focus states** — brass focus ring everywhere
- ❌ **Layout-shifting hovers** — transforms on pieces/buttons only, ≤1.06

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No raw hex — all colors via dame tokens
- [ ] No toasts in gameplay flows
- [ ] All icons from lucide, consistent stroke width
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states within the motion scale (120–300ms)
- [ ] Text contrast ≥ 4.5:1 on felt surfaces
- [ ] Focus states visible (brass outline/ring)
- [ ] `prefers-reduced-motion` respected (shared path in globals.css)
- [ ] Responsive: 375px, 768px, 1024px, 1440px — no horizontal scroll,
      mobile bottom tabs never cover content (main has pb-28)
- [ ] Board testids intact: `board`, `square-{r}-{c}`, `piece-{r}-{c}`,
      `dest-{r}-{c}`, `turn-label`, `winner-banner`, `reset-button`,
      `move-announcement`
