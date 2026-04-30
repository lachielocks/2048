# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

This is a vanilla HTML/CSS/JS 2048 game — no frameworks, no build step, no `package.json`, no npm dependencies. The entire application is static files served from the repository root.

### Running the dev server

Serve files with any static file server. `file://` URLs will **not** work (service worker and Supabase auth require HTTP).

```bash
python3 -m http.server 8080
```

The app is then available at `http://localhost:8080/`.

### Key points

- **No build step** — all JS files are vanilla ES2020 loaded directly by `index.html`.
- **No linter/formatter configured** — there is no ESLint, Prettier, or equivalent in the repo.
- **No automated tests** — there is no test framework or test files.
- **Backend is remote Supabase** — the app connects to a hosted Supabase instance (`sxjvxfgylbeikmkwkogm.supabase.co`). No local database setup is needed. Guest play works fully without auth.
- **PWA** — `sw.js` caches assets for offline use. When modifying files, you may need to hard-refresh or clear the service worker cache in the browser to see changes.
- **Admin panel** — accessible at `/admin.html` (requires Supabase admin role).

### File layout (quick reference)

| File | Purpose |
|------|---------|
| `index.html` | Main app markup and modals |
| `style.css` | All styles, animations, tile ramp |
| `game.js` | Core game logic, board state, input, power-ups |
| `auth.js` | Supabase auth UI (sign-in/up/out) |
| `supabase.js` | Supabase client init + DB helpers |
| `achievements.js` | Achievement definitions and unlock logic |
| `leaderboard.js` | Leaderboard modal |
| `stats.js` | Per-user stats modal |
| `solver.js` | Expectimax AI autoplay |
| `confetti.js` | Canvas particle effects |
| `win-animation.js` | Win/merge celebration animations |
| `autosave.js` | Game state autosave logic |
| `sw.js` | Service worker for offline PWA |

### Gotchas

- The service worker (`sw.js`) may serve stale cached files during development. Use Chrome DevTools → Application → Service Workers → "Update on reload" or unregister the SW while developing.
- Supabase SDK is loaded from CDN (`<script>` tag in `index.html`). If offline or CDN is unreachable, auth/leaderboard/stats features won't load, but the core game still works.
