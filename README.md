# Humphrey's Courses Played

A single-page site logging every golf course I've played: an interactive
map plus a sortable leaderboard, split into eighteen-hole and nine-hole
boards.

**[View the live map](https://humphreycurtis.github.io/Golf-Stats/)**

## What's here

- [`golf.html`](golf.html) — page structure
- [`golf.js`](golf.js) — rendering logic (map, tables, filters, sorting)
- [`golf.css`](golf.css) — styling
- [`golf_courses.json`](golf_courses.json) — the data: one row per course
  played, with location, par, best score, year first played, and who I
  played it with. This file is the single source of truth — nothing about
  a course is patched at runtime.

Built with [D3.js](https://d3js.org/) for the tables/stats and
[Leaflet](https://leafletjs.com/) for the map, on an Esri World
Topographic basemap. No build step — it's static HTML/CSS/JS.

## Running locally

Any static file server works, e.g.:

```bash
python3 -m http.server 8000
```

then open `http://localhost:8000/golf.html`.

## Data notes

- Most coordinates are accurate to the town, not the clubhouse — the map
  caps its zoom to avoid implying more precision than the data has.
- Scores come from [Shotscope](https://shotscope.com/) round data where
  available; otherwise from memory, marked as estimated.
- Nine-hole courses are ranked separately from eighteen-hole courses so a
  nine-hole 27 never outranks an eighteen-hole 73.

## License

Code (`golf.html`, `golf.js`, `golf.css`, `favicon.svg`) is available
under the [MIT License](LICENSE). The data in `golf_courses.json` is
personal record-keeping, included for transparency rather than reuse.
