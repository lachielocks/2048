# 2048

A polished, dark-themed 2048 game built with vanilla HTML, CSS, and JavaScript — no frameworks, no build tools. Inspired by [play2048.co](https://play2048.co).

Live at:
- [2048.lachiethurlow.com](https://2048.lachiethurlow.com)
- [2048.transnology.co](https://2048.transnology.co)

---

## Features

### Gameplay
- Classic 4×4 2048 tile-merging gameplay
- Smooth CSS tile slide & spawn animations
- Merge celebrations: glow pulse (128+), halo ring (512+), lightning flicker (1024), full canvas confetti explosion (2048)
- 2048 tile: animated shimmer/gloss sweep on loop
- 4096+ tile: animated galaxy/conic-gradient rotation
- Win overlay ("Keep Going" or "New Game") + Game Over overlay
- Touch swipe support via Pointer Events (30 px threshold)
- Arrow keys + WASD — keys ignored when typing in a form field

### Power-ups
- **Undo** — one move undo via button or `Ctrl+Z`
- **Swap** — swap any two tiles (unlocked at 256)
- **Delete** — remove all tiles of a chosen value (unlocked at 512)
- **Watch AI** — Expectimax AI autoplay

### Accounts & Leaderboard
- Sign up / sign in with email + password via Supabase Auth
- Email confirmation via 6-digit OTP code or link
- Password reset by email
- Guest play works fully without an account — `localStorage` fallback for everything
- On sign-in, guest game history syncs to Supabase (last 5 games)
- Completed games saved automatically (score, highest tile, moves, duration, board state)
- Global leaderboard — Top Scores, Highest Tile, This Week tabs

### Achievements
10 unlockable achievements tracked per-user, with toast notifications and a Web Audio chime:

| Key | Label | Condition |
|-----|-------|-----------|
| `first_game` | First Move | Complete any game |
| `first_win` | 2048 Club | Reach the 2048 tile |
| `tile_4096` | Going Further | Reach 4096 |
| `tile_8192` | Legendary | Reach 8192 |
| `no_undo_win` | Purist | Win without using undo |
| `no_powerup_win` | Minimalist | Win without any power-up |
| `score_10k` | 10K Club | Score over 10,000 |
| `score_50k` | High Roller | Score over 50,000 |
| `speed_win` | Speed Runner | Win in under 5 minutes |
| `comeback` | Comeback Kid | Win after using a power-up |

### Stats
- Per-user stats modal: total games, win rate, high score, high tile, avg score, total moves, total time played
- Achievement grid with hover tooltips and unlock dates
- Recent games table (last 5)
- Guest stats derived from `localStorage`

### PWA
- Installable as a standalone app on desktop and mobile
- Offline support via service worker (cache-first for static assets)
- Custom app icon (`logo.svg`)

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Markup | HTML5 |
| Styles | CSS3 (custom properties, keyframes, grid) |
| Logic | Vanilla ES2020 JS |
| Auth & Database | [Supabase](https://supabase.com) (Auth, Postgres, RLS) |
| Fonts | [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque) · [Geist](https://fonts.google.com/specimen/Geist) via Google Fonts |
| Hosting | Vercel (zero-config static) |

---

## File Structure

```
2048/
├── index.html          # Markup, modals, PWA meta tags
├── style.css           # All styles and animations
├── game.js             # Game logic, board state, input, power-ups
├── confetti.js         # Canvas particle system
├── solver.js           # Expectimax AI
├── supabase.js         # Supabase client + DB helper functions
├── auth.js             # Auth state, sign-in/up/out modal, header UI
├── achievements.js     # Achievement definitions, unlock logic, toasts
├── leaderboard.js      # Leaderboard fetch and modal
├── stats.js            # Stats fetch and modal
├── sw.js               # Service worker (offline caching)
├── manifest.json       # PWA manifest
├── logo.svg            # App icon
├── supabase/
│   └── migrations/
│       ├── 001_profiles.sql
│       ├── 002_games.sql
│       ├── 003_achievements.sql
│       └── 004_leaderboard_functions.sql
└── README.md
```

---

## Database Setup

Apply the SQL migrations in order in the [Supabase SQL editor](https://supabase.com/dashboard):

1. `supabase/migrations/001_profiles.sql` — user profiles + trigger
2. `supabase/migrations/002_games.sql` — completed games
3. `supabase/migrations/003_achievements.sql` — unlocked achievements
4. `supabase/migrations/004_leaderboard_functions.sql` — leaderboard RPC functions

All tables use Row Level Security (RLS).

---

## Running Locally

No build step required — just serve with any static file server (required for the service worker):

```bash
npx serve .
# or
python3 -m http.server 8080
```

> Opening `index.html` directly as a `file://` URL won't work for the service worker or Supabase auth redirects.

---

## Deploying to Vercel

Push to GitHub and connect the repo in Vercel. Vercel auto-detects static sites — no `vercel.json` needed.

---

## Controls

| Action | Input |
|--------|-------|
| Move tiles | Arrow keys or WASD |
| Undo last move | Undo button or `Ctrl+Z` |
| Cancel power-up | `Escape` |
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
