# Mini Event Booking API

A tiny, single-file backend (Node + Express). Data is stored **in memory** — no
database, no Redis, nothing to install or configure. Great for testing and a
quick online demo.

> Note: because data lives in memory, it resets every time the server restarts.
> That's fine for a demo. To keep data permanently you'd plug in a database later.

---

## Run it locally (2 steps)

```bash
npm install
npm run dev
```

Then open: <http://localhost:4000/api/v1/health>

- `npm run dev` → auto-restarts when you edit the file
- `npm start` → plain run (this is what hosting platforms use)

### Seed logins (password for both = `Password123`)
| role      | email          |
|-----------|----------------|
| organizer | aria@org.com   |
| customer  | john@mail.com  |

---

## Test it fast

Login and grab a token:
```bash
curl -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"aria@org.com","password":"Password123"}'
```

Use the token (replace YOUR_TOKEN) to create an event:
```bash
curl -X POST http://localhost:4000/api/v1/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"title":"My Show","venue":"Delhi","date":"2026-12-30T19:00:00Z","price":300,"totalSeats":50}'
```

Browse events (no login needed):
```bash
curl http://localhost:4000/api/v1/events
```

---

## Deploy online (free, ~3 minutes) — Render

1. Push this folder to a **GitHub** repo.
2. Go to <https://render.com> → sign in with GitHub → **New → Web Service**.
3. Pick your repo. Fill in:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. Click **Create Web Service**. Wait for the build to finish.
5. Your API is live at the URL Render gives you, e.g.
   `https://your-app.onrender.com/api/v1/health`

That's it. No environment variables required (it has safe defaults).
If you want, set `JWT_SECRET` to any long random string in Render's
**Environment** tab for a bit more security.

> Works the same on Railway or Fly.io — just use `npm install` as build
> and `npm start` as the start command. The app reads the `PORT` these
> platforms provide automatically.

---

## API endpoints

| Method | Path                         | Who        | What                       |
|--------|------------------------------|------------|----------------------------|
| POST   | /api/v1/auth/register        | anyone     | create account             |
| POST   | /api/v1/auth/login           | anyone     | log in, get token          |
| GET    | /api/v1/events               | anyone     | browse (?search= ?sort=)   |
| GET    | /api/v1/events/:id           | anyone     | event details              |
| POST   | /api/v1/events               | organizer  | create event               |
| PATCH  | /api/v1/events/:id           | organizer  | update own event           |
| DELETE | /api/v1/events/:id           | organizer  | delete own event           |
| POST   | /api/v1/bookings             | customer   | book seats                 |
| GET    | /api/v1/bookings/me          | customer   | my bookings                |
| GET    | /api/v1/health               | anyone     | health check               |

All responses look like:
```json
{ "success": true, "message": "...", "data": { } }
```
