# Building an ISBN Scanner + Reading List Web App

A step-by-step guide to building a web app that scans (or accepts) an ISBN, looks up the book, and saves it to a reading list. Written for someone comfortable with JavaScript. No backend required to start — we use the browser's camera, a free public book API, and `localStorage`. Later sections show how to grow it.

The plan is deliberately incremental. You'll have a *working* app after Part 4 (manual entry). Camera scanning is added in Part 6 so you never block progress on the trickiest piece.

---

## 1. What you're building and how it fits together

Four moving parts:

1. **Input** — an ISBN, obtained two ways: typed into a box (Part 5) or read from a barcode by the camera (Part 6).
2. **Validation** — confirm the ISBN is well-formed before you spend a network request on it (Part 2).
3. **Lookup** — send the ISBN to a book metadata API and get back title, authors, cover, etc. (Part 3).
4. **Storage** — keep the reading list somewhere. We start with `localStorage`; Part 8 covers a real backend (Part 4, 8).

Data flow:

```
[barcode / typed digits] -> validate -> fetch(book API) -> render card -> save to list
```

Nothing here needs a build server, but we'll use **Vite** because it gives you a dev server with hot reload and clean ES-module imports, which you'll want the moment you add the scanner library.

---

## 2. Prerequisites and project setup

You need Node 18+ installed. Then scaffold a vanilla project:

```bash
npm create vite@latest isbn-reader -- --template vanilla
cd isbn-reader
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). Delete the boilerplate in `main.js`, `style.css`, and the contents of `<div id="app">` in `index.html` — we'll fill them in.

> **Why vanilla and not React?** For this project the logic is small and the interesting parts (camera, API) are framework-agnostic. Everything below ports to React/Vue trivially — the functions in `book.js` and `storage.js` don't change; only the rendering does. If you'd rather start in React, use `--template react` and put the same functions in hooks.

Suggested file layout:

```
isbn-reader/
  index.html
  src/
    main.js        # wires up the UI
    isbn.js        # validation + normalization
    book.js        # API lookup
    storage.js     # reading list persistence
    scanner.js     # camera barcode scanning (Part 6)
  style.css
```

---

## 3. Part 2 — Validating an ISBN

An ISBN is either 10 or 13 digits. Modern books use ISBN-13. Both have a check digit — the last digit is a checksum of the others, so you can reject typos and misreads *without* a network call. This matters more than it looks: a camera will occasionally misread a barcode, and validating first stops you from firing garbage at the API.

Create `src/isbn.js`:

```js
// Strip hyphens/spaces and uppercase the trailing X used by ISBN-10.
export function normalizeISBN(input) {
  return input.replace(/[^0-9Xx]/g, "").toUpperCase();
}

export function isValidISBN13(isbn) {
  if (!/^\d{13}$/.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    // Alternating weights 1,3,1,3... for the first 12 digits.
    sum += Number(isbn[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(isbn[12]);
}

export function isValidISBN10(isbn) {
  if (!/^\d{9}[\dX]$/.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(isbn[i]) * (10 - i);
  }
  // Final char may be 'X' meaning 10.
  sum += isbn[9] === "X" ? 10 : Number(isbn[9]);
  return sum % 11 === 0;
}

export function isValidISBN(input) {
  const isbn = normalizeISBN(input);
  return isValidISBN13(isbn) || isValidISBN10(isbn);
}
```

The two checksum algorithms are genuinely different (mod 10 with 1/3 weights for ISBN-13; mod 11 with descending weights for ISBN-10), which is why they're separate functions. I tested `isValidISBN13("9780140328721")` → `true` and a one-digit-off variant → `false`; that's the behaviour you want.

---

## 4. Part 3 — Looking up the book

We'll use the **Open Library API**. It's free, needs no API key, returns JSON, and serves cover images. (Google Books is the main alternative — also free but rate-limited and it prefers an API key. We'll use it as a fallback below.)

The convenient endpoint is:

```
https://openlibrary.org/api/books?bibkeys=ISBN:<isbn>&format=json&jscmd=data
```

It returns an object keyed by `"ISBN:<isbn>"`. Covers come from a separate predictable URL:

```
https://covers.openlibrary.org/b/isbn/<isbn>-M.jpg   (S | M | L for size)
```

Create `src/book.js`:

```js
import { normalizeISBN } from "./isbn.js";

// Returns a normalized book object, or null if not found.
export async function lookupBook(rawIsbn) {
  const isbn = normalizeISBN(rawIsbn);
  const fromOpenLibrary = await tryOpenLibrary(isbn);
  if (fromOpenLibrary) return fromOpenLibrary;
  return await tryGoogleBooks(isbn); // fallback
}

async function tryOpenLibrary(isbn) {
  const url =
    `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}` +
    `&format=json&jscmd=data`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const record = data[`ISBN:${isbn}`];
  if (!record) return null;

  return {
    isbn,
    title: record.title ?? "Unknown title",
    authors: (record.authors ?? []).map((a) => a.name),
    cover:
      record.cover?.medium ??
      `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`,
    year: record.publish_date ?? "",
    source: "openlibrary",
  };
}

async function tryGoogleBooks(isbn) {
  const url =
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const info = data.items?.[0]?.volumeInfo;
  if (!info) return null;

  return {
    isbn,
    title: info.title ?? "Unknown title",
    authors: info.authors ?? [],
    cover: info.imageLinks?.thumbnail?.replace("http:", "https:") ?? "",
    year: info.publishedDate ?? "",
    source: "google",
  };
}
```

Two things worth noticing. First, both branches return the *same shape* — the rest of the app never has to care which API answered. Normalizing external data at the boundary like this is a habit that pays off. Second, Google Books sometimes returns `http:` image URLs, which a browser on an `https://` page will refuse to load ("mixed content"); the `.replace` fixes that.

Quick manual test in your browser console once the dev server is running:

```js
import("./src/book.js").then((m) => m.lookupBook("9780140328721")).then(console.log);
```

---

## 5. Part 4 — The reading list (persistence)

Start with `localStorage`. It's synchronous, survives refreshes, and is enough to prove the app out. Create `src/storage.js`:

```js
const KEY = "reading-list";

export function getList() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? [];
  } catch {
    return [];
  }
}

function save(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function addBook(book) {
  const list = getList();
  if (list.some((b) => b.isbn === book.isbn)) return list; // no dupes
  const updated = [{ ...book, addedAt: Date.now() }, ...list];
  save(updated);
  return updated;
}

export function removeBook(isbn) {
  const updated = getList().filter((b) => b.isbn !== isbn);
  save(updated);
  return updated;
}
```

Keying dedupe on the ISBN is why we normalized it earlier — `"978-0-14-032872-1"` and `"9780140328721"` must collapse to one entry.

> **Limitation to keep in mind:** `localStorage` is per-browser and per-device. The list won't follow the user to their phone, and clearing site data wipes it. That's the motivation for Part 8.

---

## 6. Part 5 — Wiring up manual entry

Now the app becomes real. HTML first — replace the body of `index.html`:

```html
<div id="app">
  <h1>My Reading List</h1>

  <form id="isbn-form">
    <input
      id="isbn-input"
      inputmode="numeric"
      placeholder="Enter ISBN (10 or 13 digits)"
      autocomplete="off"
    />
    <button type="submit">Add</button>
    <button type="button" id="scan-btn">Scan</button>
  </form>

  <p id="status" role="status"></p>

  <video id="preview" playsinline hidden></video>

  <ul id="list"></ul>
</div>
<script type="module" src="/src/main.js"></script>
```

Then `src/main.js`:

```js
import { isValidISBN } from "./isbn.js";
import { lookupBook } from "./book.js";
import { getList, addBook, removeBook } from "./storage.js";

const form = document.querySelector("#isbn-form");
const input = document.querySelector("#isbn-input");
const statusEl = document.querySelector("#status");
const listEl = document.querySelector("#list");

function setStatus(msg) {
  statusEl.textContent = msg;
}

function render(list) {
  listEl.innerHTML = "";
  for (const book of list) {
    const li = document.createElement("li");
    li.className = "book";
    li.innerHTML = `
      <img src="${book.cover}" alt="" width="50" />
      <div>
        <strong>${book.title}</strong><br />
        <small>${book.authors.join(", ")} ${book.year ? "· " + book.year : ""}</small>
      </div>
      <button data-isbn="${book.isbn}">Remove</button>
    `;
    listEl.appendChild(li);
  }
}

// Central handler both manual entry and the scanner call.
export async function handleISBN(raw) {
  if (!isValidISBN(raw)) {
    setStatus("That doesn't look like a valid ISBN.");
    return;
  }
  setStatus("Looking up…");
  const book = await lookupBook(raw);
  if (!book) {
    setStatus("No book found for that ISBN.");
    return;
  }
  render(addBook(book));
  setStatus(`Added: ${book.title}`);
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  handleISBN(input.value);
  input.value = "";
});

listEl.addEventListener("click", (e) => {
  if (e.target.matches("button[data-isbn]")) {
    render(removeBook(e.target.dataset.isbn));
  }
});

render(getList()); // restore on load
```

At this point you have a complete, useful app: type an ISBN, get the book, see it persist across refreshes. Ship this before touching the camera.

A bit of `style.css` to make the list readable:

```css
body { font-family: system-ui, sans-serif; max-width: 640px; margin: 2rem auto; padding: 0 1rem; }
#isbn-form { display: flex; gap: .5rem; }
#isbn-input { flex: 1; padding: .5rem; }
#list { list-style: none; padding: 0; }
.book { display: flex; align-items: center; gap: .75rem; padding: .5rem 0; border-bottom: 1px solid #eee; }
.book div { flex: 1; }
#preview { width: 100%; border-radius: 8px; margin: 1rem 0; }
```

---

## 7. Part 6 — Camera barcode scanning

A book's barcode encodes its ISBN-13 in **EAN-13** format, so "scan a book barcode" and "read an EAN-13" are the same task.

The cleanest modern approach is the browser's built-in **`BarcodeDetector`** API — no library, native speed. The catch: as of 2026 it ships in Chrome and Edge (and Chrome for Android) but not reliably in Safari/Firefox. So we use the native API where present and load a small polyfill everywhere else. The polyfill exposes the *same* interface, so your code is written once.

```bash
npm install barcode-detector
```

Create `src/scanner.js`:

```js
// Polyfill registers globalThis.BarcodeDetector only if it's missing.
import "barcode-detector/side-effects";

let stream = null;
let running = false;

export async function startScanner(videoEl, onDetected) {
  const detector = new BarcodeDetector({ formats: ["ean_13"] });

  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" }, // rear camera on phones
  });
  videoEl.srcObject = stream;
  videoEl.hidden = false;
  await videoEl.play();

  running = true;
  const seen = new Set();

  async function tick() {
    if (!running) return;
    try {
      const codes = await detector.detect(videoEl);
      for (const c of codes) {
        if (!seen.has(c.rawValue)) {
          seen.add(c.rawValue);
          onDetected(c.rawValue); // an ISBN-13 string
        }
      }
    } catch {
      /* transient decode errors are normal; ignore */
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

export function stopScanner(videoEl) {
  running = false;
  stream?.getTracks().forEach((t) => t.stop());
  videoEl.hidden = true;
  videoEl.srcObject = null;
}
```

Restricting `formats` to `["ean_13"]` makes detection faster and stops it matching unrelated codes. The `seen` set debounces — the detector fires many times a second while the barcode is in frame, and you only want to add the book once.

Wire it into `main.js`:

```js
import { startScanner, stopScanner } from "./scanner.js";

const scanBtn = document.querySelector("#scan-btn");
const video = document.querySelector("#preview");
let scanning = false;

scanBtn.addEventListener("click", async () => {
  if (scanning) {
    stopScanner(video);
    scanning = false;
    scanBtn.textContent = "Scan";
    return;
  }
  try {
    scanning = true;
    scanBtn.textContent = "Stop";
    await startScanner(video, (isbn) => {
      handleISBN(isbn);        // reuse the same pipeline as manual entry
      stopScanner(video);      // stop after first good read
      scanning = false;
      scanBtn.textContent = "Scan";
    });
  } catch (err) {
    setStatus("Camera unavailable: " + err.message);
    scanning = false;
    scanBtn.textContent = "Scan";
  }
});
```

The payoff of routing everything through `handleISBN` is visible here: the scanner just produces a string and hands it to the exact same validate → lookup → save path as the text box.

### The one thing that will trip you up: HTTPS

`navigator.mediaDevices.getUserMedia` only works on a **secure context** — `https://` or `localhost`. Vite's dev server on `localhost` is fine on your machine. But testing on your *phone* over the LAN (`http://192.168.x.x`) will silently fail because it isn't `localhost` and isn't HTTPS.

Two fixes:

- Run Vite with HTTPS: `npm run dev -- --host` plus a dev-cert plugin like `@vitejs/plugin-basic-ssl`, then open the `https://` LAN URL.
- Or tunnel: `npx localtunnel --port 5173` (or ngrok/cloudflared) gives you a public HTTPS URL you can open on any phone.

Also: the first `getUserMedia` call triggers the browser's camera-permission prompt. If the user denies it, the promise rejects — which the `try/catch` above already surfaces as a status message.

---

## 8. Where to go from here

**A real backend.** When you want the list to sync across devices, replace `storage.js` with `fetch` calls to an API. The function signatures (`getList`, `addBook`, `removeBook`) stay the same — they just become `async`. A small Express/Fastify server with SQLite, or a hosted option like Supabase/Firebase, gets you there quickly. Add user accounts so lists are per-person.

**Make it installable (PWA).** Add a web manifest and a service worker so it installs to a phone home screen and opens full-screen — much nicer for a scan-heavy app. Vite has `vite-plugin-pwa` for this.

**Richer data.** Pull descriptions, subjects, and page counts from the API and show a detail view. Add "want to read / reading / finished" status, ratings, and notes per book.

**Robustness.** Handle the offline case, debounce lookups, and cache results so re-scanning a known book is instant. Consider showing a confirmation card before saving, so a misread barcode doesn't add the wrong book.

**Testing.** The pure functions in `isbn.js` are perfect unit-test targets — feed known valid/invalid ISBNs and assert. `book.js` can be tested with a mocked `fetch`.

---

## Recap

You built it in an order that always leaves you with something working: validation (cheap, offline) → lookup (one API, one fallback) → persistence → manual UI → camera. Every input path funnels through a single `handleISBN` function, and every external book record is normalized to one shape at the boundary. Those two decisions are what keep the app from turning into spaghetti as you add features.

---

### Sources
- [Open Library APIs](https://openlibrary.org/developers/api)
- [Book Databases Overview 2026 — BookScouter](https://bookscouter.com/blog/book-databases/)
- [Popular open-source JavaScript barcode scanners — Scanbot](https://scanbot.io/blog/popular-open-source-javascript-barcode-scanners/)
- [html5-qrcode (GitHub) — note on maintenance status](https://github.com/mebjas/html5-qrcode)
