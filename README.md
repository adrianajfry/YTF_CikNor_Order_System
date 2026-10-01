# Yong Cik Nor Tau Foo — order system

A small internal web app for the order counter, three kitchen stations, the customer-facing status board, and the pickup counter. Every screen reads and writes the same Supabase database in real time. Each staff device logs in with its own username and password and only ever sees its own page.

## Structure
- `src/pages/CounterView.jsx` — order counter (add items, ask a station about stock, send the order) — requires the `counter` login
- `src/pages/StationView.jsx` — one kitchen station's tablet (`/station/ytf`, `/station/beverage`, `/station/hotfood`) — requires the matching `ytf` / `beverage` / `hotfood` login
- `src/pages/BoardView.jsx` — customer-facing status board (`/board`) — public, no login
- `src/pages/PickupView.jsx` — pickup counter (`/pickup`) — requires the `pickup` login
- `src/pages/LoginView.jsx`, `src/contexts/AuthContext.jsx`, `src/components/ProtectedRoute.jsx` — the login screen and the guard that keeps each account on its own page
- `supabase/schema.sql` — tables and the board-status trigger
- `supabase/auth_and_rls.sql` — the `staff` table and the row-level-security policies that enforce "a station can only touch its own orders" at the database level, not just in the UI
- `supabase/seed.sql` — starter menu using real Yong Tau Foo dishes — edit freely
- `scripts/create-staff-accounts.mjs` — one-time script that creates the 5 logins

## 1. Set up Supabase
1. Create a free project at supabase.com
2. In the SQL editor, run in this order: `supabase/schema.sql`, then `supabase/auth_and_rls.sql`, then `supabase/seed.sql`
3. Go to **Authentication → Providers → Email** and turn **off** "Allow new users to sign up" — staff accounts should only ever be created by the script below, not by anyone visiting the login page
4. Copy your project URL and anon key into a `.env` file (see `.env.example`)

## 2. Create the 5 staff logins
1. Copy `.env.script.example` to `.env.script` and fill in your project URL and **service role key** (Settings → API in Supabase — keep this key secret, it's admin-level)
2. Open `scripts/create-staff-accounts.mjs` and change the placeholder passwords
3. Run it once:
   ```
   node --env-file=.env.script scripts/create-staff-accounts.mjs
   ```
   (Node 20.6+; on an older Node, export the three variables in your shell instead)
4. Staff log in with just the username (e.g. `ytf`) and the password you set — the script handles the rest behind the scenes

Never put the service role key in `.env` (that one ships to the browser) — `.env.script` is for this local script only and is already excluded via `.gitignore`.

## 3. Run locally
```
npm install
npm run dev
```

## 4. Deploy
Push this repo to GitHub, then import it in Vercel (or Netlify) — it auto-detects Vite and redeploys on every push to `main`. Add the two `VITE_SUPABASE_*` environment variables in the Vercel project settings, same values as your `.env`.

The included `.github/workflows/ci.yml` just runs a build check on every push/PR — it doesn't deploy anything itself, since Vercel's GitHub integration already handles that part.

## 5. Assign a screen per device
Open the deployed URL on each device:
- Counter tablet → `/counter`, log in as `counter`
- Each kitchen tablet → `/station/ytf`, `/station/beverage`, `/station/hotfood`, log in with the matching username
- Pickup tablet → `/pickup`, log in as `pickup`
- TV/monitor → `/board` — no login, this one's meant to be seen

Most browsers/tablets can be set to launch straight into one of these URLs in kiosk mode, and each account is locked to its own route — logging into `ytf` and visiting `/pickup` just bounces back to the login screen.

## What's stubbed vs. real
Auth, the RLS policies, and the seeded menu are all real and functional. Still simplified for a first pass:
- Order numbering is computed client-side (see the comment in `CounterView.jsx`) — move it into a Postgres function before relying on it under real concurrent traffic
- No menu-management screen yet — add/edit menu items directly in the Supabase Table Editor, or extend `supabase/seed.sql`
- Passwords are set once via the script — add a "change password" flow later if staff should be able to update their own
test deploy
