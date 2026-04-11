# 2048

A polished, dark-themed 2048 game built with vanilla HTML, CSS, and JavaScript — no frameworks, no build tools. Inspired by [play2048.co](https://play2048.co).

Live at:
- [2048.lachiethurlow.com](https://2048.lachiethurlow.com)
- [2048.transnology.co](https://2048.transnology.co)

---

## Features

- Classic 4×4 2048 tile-merging gameplay
- Smooth CSS tile slide & spawn animations
- Merge celebrations: glow pulse (128+), halo ring (512+), lightning flicker (1024), full canvas confetti explosion (2048)
- 2048 tile: animated shimmer/gloss sweep on loop
- 4096+ tile: animated galaxy/conic-gradient rotation
- Score tracking with **best score** persisted in `localStorage`
- **Undo** — one move undo via button or `Ctrl+Z`
- Win overlay ("Keep Going" or "New Game") + Game Over overlay
- Touch swipe support via Pointer Events (30 px threshold)
- Arrow keys + WASD — page scroll blocked during play
- Fully responsive, mobile-first layout
- Zero dependencies, zero build steps

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Markup | HTML5 |
| Styles | CSS3 (custom properties, keyframes, grid) |
| Logic | Vanilla ES2020 JS |
| Fonts | [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque) · [Geist](https://fonts.google.com/specimen/Geist) via Google Fonts |
| Hosting | Vercel (zero-config static) |

---

## File Structure

```
2048/
├── index.html     # Markup & font imports
├── style.css      # All styles, animations, tile colours
├── game.js        # Game logic, board state, input handling, scoring
├── confetti.js    # Canvas particle system
└── README.md
```

---

## Running Locally

No build step required — just open `index.html` in a browser, or serve with any static file server:

```bash
npx serve .
# or
python3 -m http.server 8080
```

---

## Deploying to Vercel

Push to GitHub and connect the repo in Vercel. Vercel auto-detects static sites — no `vercel.json` needed.

---

## Controls

| Action | Input |
|--------|-------|
| Move tiles | Arrow keys or WASD |
| Undo last move | Undo button or `Ctrl+Z` |
| New game | New Game button |
| Swipe (mobile) | Touch swipe ≥ 30 px |

---

## Colour Palette

| Tile | Gradient |
|------|----------|
| 2 | `#e8e0d5 → #d4c9b8` |
| 4 | `#f0e6c8 → #ddd0a0` |
| 8 | `#f7c07a → #e8963c` |
| 16 | `#f4a26b → #e0723a` |
| 32 | `#f07a5f → #d94f35` |
| 64 | `#e84e2a → #c42e10` |
| 128 | `#f5d76e → #e0b830` |
| 256 | `#f0c93a → #d4a010` |
| 512 | `#e8b820 → #c49000` |
| 1024 | `#7c3aed → #4c1d95` (purple) |
| 2048 | `#FF6B2B → #ff3d00` (brand orange, shimmer) |
| 4096+ | conic galaxy gradient |

---

## License

MIT — see [LICENSE](LICENSE).

---

A fun project by [Lachie Thurlow](https://lachiethurlow.com) & [Transnology](https://transnology.co).
