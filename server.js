/**
 * Mini Event Booking API  —  single file, in-memory, zero external services.
 *
 *   npm install
 *   npm run dev      (auto-restart on save, uses node --watch)
 *   npm start        (plain run)
 *
 * Two roles:
 *   - organizer : create / update / delete their own events
 *   - customer  : browse events and book seats
 *
 * Data lives in memory, so it resets every restart. No DB to set up.
 * Seed accounts (password for all = "Password123"):
 *   organizer : aria@org.com
 *   customer  : john@mail.com
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const path = require('path');
const app = express();
app.use(express.json());

// serve the frontend (public/index.html) at "/"
// disable HTML caching so edits/redeploys always show up immediately
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  },
}));

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

// ---------------------------------------------------------------------------
// In-memory "database"
// ---------------------------------------------------------------------------
const db = { users: [], events: [], bookings: [] };
let ids = { user: 1, event: 1, booking: 1 };
const nextId = (k) => ids[k]++;

// ---------------------------------------------------------------------------
// Tiny helpers
// ---------------------------------------------------------------------------
const ok = (res, status, message, data) =>
  res.status(status).json({ success: true, message, data });

const fail = (res, status, message) =>
  res.status(status).json({ success: false, message });

// strip password before sending a user back
const publicUser = ({ password, ...rest }) => rest;

const signToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });

// wrap async handlers so thrown errors hit the error middleware
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return fail(res, 401, 'Authentication token is missing');
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.users.find((u) => u.id === decoded.sub);
    if (!user) return fail(res, 401, 'User no longer exists');
    req.user = { id: user.id, role: user.role, name: user.name, email: user.email };
    next();
  } catch (err) {
    return fail(res, 401, 'Invalid or expired token');
  }
}

const authorize = (...roles) => (req, res, next) =>
  roles.includes(req.user.role)
    ? next()
    : fail(res, 403, 'You do not have permission to perform this action');

// ---------------------------------------------------------------------------
// Auth routes
// ---------------------------------------------------------------------------
app.post('/api/v1/auth/register', wrap(async (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password)
    return fail(res, 422, 'name, email and password are required');
  if (!['organizer', 'customer'].includes(role))
    return fail(res, 422, 'role must be "organizer" or "customer"');
  if (db.users.some((u) => u.email === email))
    return fail(res, 409, 'Email is already registered');

  const user = {
    id: nextId('user'),
    name,
    email,
    role,
    password: await bcrypt.hash(password, 10),
  };
  db.users.push(user);
  return ok(res, 201, 'Registered successfully', {
    user: publicUser(user),
    token: signToken(user),
  });
}));

app.post('/api/v1/auth/login', wrap(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return fail(res, 422, 'email and password are required');

  const user = db.users.find((u) => u.email === email);
  if (!user || !(await bcrypt.compare(password, user.password)))
    return fail(res, 401, 'Invalid credentials');

  return ok(res, 200, 'Logged in successfully', {
    user: publicUser(user),
    token: signToken(user),
  });
}));

// ---------------------------------------------------------------------------
// Event routes
// ---------------------------------------------------------------------------

// public: browse all events (optional ?search= and ?sort=price|date)
app.get('/api/v1/events', (req, res) => {
  let list = [...db.events];
  const { search, sort } = req.query;
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(
      (e) =>
        e.title.toLowerCase().includes(q) || e.venue.toLowerCase().includes(q)
    );
  }
  if (sort === 'price') list.sort((a, b) => a.price - b.price);
  if (sort === 'date') list.sort((a, b) => new Date(a.date) - new Date(b.date));
  return ok(res, 200, 'Events fetched', { events: list, total: list.length });
});

// public: single event
app.get('/api/v1/events/:id', (req, res) => {
  const event = db.events.find((e) => e.id === Number(req.params.id));
  if (!event) return fail(res, 404, 'Event not found');
  return ok(res, 200, 'Event fetched', { event });
});

// organizer: create event
app.post('/api/v1/events', authenticate, authorize('organizer'), (req, res) => {
  const { title, venue, date, price, totalSeats } = req.body || {};
  if (!title || !venue || !date || price == null || totalSeats == null)
    return fail(res, 422, 'title, venue, date, price and totalSeats are required');
  if (new Date(date) <= new Date())
    return fail(res, 422, 'date must be in the future');
  if (totalSeats < 1) return fail(res, 422, 'totalSeats must be at least 1');

  const event = {
    id: nextId('event'),
    title,
    venue,
    date,
    price: Number(price),
    totalSeats: Number(totalSeats),
    availableSeats: Number(totalSeats),
    organizerId: req.user.id,
  };
  db.events.push(event);
  return ok(res, 201, 'Event created', { event });
});

// organizer: update own event
app.patch('/api/v1/events/:id', authenticate, authorize('organizer'), (req, res) => {
  const event = db.events.find((e) => e.id === Number(req.params.id));
  if (!event) return fail(res, 404, 'Event not found');
  if (event.organizerId !== req.user.id)
    return fail(res, 403, 'You can only edit your own events');

  const { title, venue, date, price, totalSeats } = req.body || {};
  if (title != null) event.title = title;
  if (venue != null) event.venue = venue;
  if (date != null) event.date = date;
  if (price != null) event.price = Number(price);
  if (totalSeats != null) {
    const booked = event.totalSeats - event.availableSeats;
    if (Number(totalSeats) < booked)
      return fail(res, 422, `totalSeats cannot be below already-booked seats (${booked})`);
    event.availableSeats = Number(totalSeats) - booked;
    event.totalSeats = Number(totalSeats);
  }
  return ok(res, 200, 'Event updated', { event });
});

// organizer: delete own event
app.delete('/api/v1/events/:id', authenticate, authorize('organizer'), (req, res) => {
  const idx = db.events.findIndex((e) => e.id === Number(req.params.id));
  if (idx === -1) return fail(res, 404, 'Event not found');
  if (db.events[idx].organizerId !== req.user.id)
    return fail(res, 403, 'You can only delete your own events');
  db.events.splice(idx, 1);
  return ok(res, 200, 'Event deleted', null);
});

// ---------------------------------------------------------------------------
// Booking routes
// ---------------------------------------------------------------------------

// customer: book seats for an event
app.post('/api/v1/bookings', authenticate, authorize('customer'), (req, res) => {
  const { eventId, seats } = req.body || {};
  const qty = Number(seats) || 1;
  if (!eventId) return fail(res, 422, 'eventId is required');
  if (qty < 1) return fail(res, 422, 'seats must be at least 1');

  const event = db.events.find((e) => e.id === Number(eventId));
  if (!event) return fail(res, 404, 'Event not found');
  if (new Date(event.date) <= new Date())
    return fail(res, 422, 'Cannot book a past event');

  // Node is single-threaded, so this check-then-decrement is atomic in
  // practice — no two requests interleave between these two lines. That is
  // exactly what prevents overbooking here (the DB version used a Mongo
  // transaction to get the same guarantee across processes).
  if (event.availableSeats < qty)
    return fail(res, 409, `Only ${event.availableSeats} seat(s) left`);
  event.availableSeats -= qty;

  const booking = {
    id: nextId('booking'),
    eventId: event.id,
    eventTitle: event.title,
    customerId: req.user.id,
    seats: qty,
    totalPrice: qty * event.price,
    status: 'confirmed',
    createdAt: new Date().toISOString(),
  };
  db.bookings.push(booking);

  // pretend "email" — just a log, no real mailer needed
  console.log(`📧 Booking confirmation sent to ${req.user.email} for "${event.title}"`);

  return ok(res, 201, 'Booking confirmed', { booking });
});

// customer: my bookings
app.get('/api/v1/bookings/me', authenticate, authorize('customer'), (req, res) => {
  const mine = db.bookings.filter((b) => b.customerId === req.user.id);
  return ok(res, 200, 'Your bookings', { bookings: mine, total: mine.length });
});

// ---------------------------------------------------------------------------
// Health + 404 + error handler
// ---------------------------------------------------------------------------
app.get('/api/v1/health', (req, res) =>
  ok(res, 200, 'API is healthy', { uptime: process.uptime() })
);

app.use((req, res) => fail(res, 404, 'Route not found'));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  return fail(res, 500, 'Something went wrong');
});

// ---------------------------------------------------------------------------
// Seed a couple of accounts + events so you can test immediately
// ---------------------------------------------------------------------------
async function seed() {
  const hash = await bcrypt.hash('Password123', 10);
  const aria = { id: nextId('user'), name: 'Aria', email: 'aria@org.com', role: 'organizer', password: hash };
  const john = { id: nextId('user'), name: 'John', email: 'john@mail.com', role: 'customer', password: hash };
  db.users.push(aria, john);

  db.events.push(
    {
      id: nextId('event'), title: 'Indie Music Night', venue: 'Hauz Khas',
      date: '2026-12-01T19:00:00.000Z', price: 499, totalSeats: 100,
      availableSeats: 100, organizerId: aria.id,
    },
    {
      id: nextId('event'), title: 'Cybersecurity Meetup', venue: 'Bangalore',
      date: '2026-11-15T10:00:00.000Z', price: 0, totalSeats: 3,
      availableSeats: 3, organizerId: aria.id,
    }
  );
}

seed().then(() => {
  app.listen(PORT, () => {
    console.log(`\n  Mini Booking API running → http://localhost:${PORT}/api/v1/health`);
    console.log(`  Seed logins (password "Password123"):`);
    console.log(`    organizer  aria@org.com`);
    console.log(`    customer   john@mail.com\n`);
  });
});
