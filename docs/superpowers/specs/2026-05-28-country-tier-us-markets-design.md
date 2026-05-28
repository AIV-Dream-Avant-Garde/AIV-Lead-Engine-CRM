# Country Tier + US (Florida) Markets — Design

**Date:** 2026-05-28
**Status:** Approved (pending spec review)
**Author:** AIV CRM team

## Problem

The CRM is Colombia-only. `LOCATIONS` is a flat map of Colombian cities, `KEYWORDS`
is a Spanish-only business-category tree, and a lead stores `city` + `barrio` as
plain strings with no notion of country. The team wants to prospect **American
(US) businesses** — starting with Florida metros — and to treat **country as a
first-class field across the whole app**, not just a scraper convenience.

## Goals

1. Add `country` as a first-class field on every lead.
2. Add US market data (Florida metros) with neighborhood-level GPS coordinates so
   the scraper works identically to Colombian cities.
3. Use English business-type keywords for US scrapes (better Google Places results)
   while keeping the Spanish tree for Colombia.
4. Surface country in the scraper, import, scheduled jobs, the Leads filter, and
   CSV export.
5. Zero data loss: existing leads backfill to `Colombia` automatically.

## Non-Goals (YAGNI)

- Per-country phone formatting / validation
- Per-country currency or commission rules
- Per-country timezones for scheduled jobs / reports
- Countries beyond Colombia and `Estados Unidos`
- Any change to auth, roles, or commission math

These can be added later if needed; they are explicitly out of scope here.

## Chosen Approach

**Nest the data structures by country** (Approach A from brainstorming). Country
becomes a genuine parent key rather than a predicate sprinkled across the code.
This makes the country → city → barrio cascade trivial and keeps each selector's
population logic a simple `Object.keys()` lookup.

Rejected alternative (Approach B): tag each city with a `country` property and keep
the flat map. Smaller diff to the object literal, but country is then a filter
predicate repeated in every consumer, which ages worse and is easy to get
inconsistent.

## Design

### 1. Data layer

**`js/data/locations.js`** — nest the existing map one level deeper under country:

```js
const LOCATIONS = {
  'Colombia': {
    'Medellín': { type:'comunas', data:{ ... } },   // unchanged content
    'Envigado': { type:'flat', lat, lng, b:[...] },  // unchanged content
    ...all current cities...
  },
  'Estados Unidos': {
    'Miami':        { type:'flat', lat, lng, b:[...neighborhoods] },
    'Orlando':      { type:'flat', lat, lng, b:[...neighborhoods] },
    'Tampa':        { type:'flat', lat, lng, b:[...neighborhoods] },
    'Jacksonville': { type:'flat', lat, lng, b:[...neighborhoods] },
  },
};
```

- US cities use `type:'flat'` (same shape as Colombian flat cities). Each gets a
  city-center `lat`/`lng`; the existing `barrioCoords()` hash spreads neighborhoods
  around that center — no per-neighborhood coordinates required.
- Neighborhood lists are real and reasonably complete (e.g. Miami: Downtown,
  Brickell, Wynwood, Little Havana, Coral Gables, Coconut Grove, Doral, Hialeah,
  Kendall, Miami Beach, Edgewater, Allapattah, Liberty City, Overtown, etc.).

**`js/data/keywords.js`** — nest by country, mirroring `LOCATIONS`:

```js
const KEYWORDS = {
  'Colombia':       { 'Comida & Bebida':[...], ... },   // current Spanish tree
  'Estados Unidos': { 'Food & Drink':[...],   ... },     // English tree, same categories
};
```

The US tree covers the same categories as Colombia, with English category names and
English keywords (Restaurant, Bakery, Cafe, Dentist, Pharmacy, Auto Repair, etc.).

### 2. Lead model

Add `country` to the lead object everywhere a lead is created:
- scraper-created leads (`scraper.js`)
- imported leads (`import.js`)
- demo data (`demo-data.js`) — existing demo leads get `country:'Colombia'`

**Migration (one-time, on load):** in `js/core/storage.js`, when loading leads from
localStorage, any lead missing a truthy `country` is set to `'Colombia'`. This runs
transparently on the next load and is idempotent. Server-pulled leads are likewise
defaulted to `'Colombia'` if the field is absent.

### 3. Scraper (`scraper.js` + `index.html`)

- New `sc-country` `<select>` placed above `sc-city` in the scraper form.
- New helpers: `fillCountries(selId)` and `onCountryChange()`.
- Cascade: `onCountryChange()` repopulates the city dropdown for the chosen country,
  which in turn repopulates barrios; the category/keyword dropdown is repopulated
  from the country's keyword tree.
- `fillCities(selId, country)`, `fillBarrios(selId, country, city, onch)`, and
  `fillCats(selId, kwSelId, country)` gain a `country` argument. `fillKws` reads from
  `KEYWORDS[country][cat]`.
- `runScraper()`:
  - reads the selected country, stamps `country` on each created lead.
  - sends an optional `region` param to the backend (`'co'` for Colombia, `'us'` for
    Estados Unidos) to bias Places results. Backward-compatible — omitting it leaves
    backend behavior unchanged.
  - scrape-history entries include the country.

### 4. Import + Scheduled jobs

- `imp-country` selector on the Import screen and `sj-country` on the Scheduled-jobs
  form, each with the same country → city → barrio cascade
  (`onImpCountryChange()`, and `sj-country` wired inline like the existing `sj-city`).
- **Inline-handler signature updates:** because `fillBarrios` and `fillCats` gain a
  `country` argument (Section 3), the existing inline `onchange` for `sj-city` at
  index.html line 568 (`fillBarrios('sj-barrio', this.value, null)`) and the `fillCats`
  call sites in main.js (lines 87, 91) and its internal `onchange` closure (scraper.js
  line 59) must all be updated to pass the selected country.
- Imported leads are stamped with the selected country.
- Scheduled scrape jobs persist the country alongside city/barrio/keyword (see
  Section 7 for the corresponding backend write sites).

### 5. Leads table (`leads.js`, `main.js` + `index.html`)

**Important:** `f-city` is **not** built from `LOCATIONS`. It is populated in
`main.js` → `populateFilters()` (line 5/17) from the distinct `l.city` values present
on existing leads. The country filter must follow the same lead-derived model, not the
`LOCATIONS` keys.

- New `f-country` filter dropdown ("Todos los países"), placed before `f-city`,
  populated in `populateFilters()` from the distinct `l.country` values on leads
  (after migration this is at least `Colombia`).
- **Cascade:** selecting a country recomputes the `f-city` options from the distinct
  cities of leads **whose `country` matches the selection** (i.e. re-run the same
  `[...new Set(S.leads.filter(l => !c || l.country === c).map(l => l.city))]` logic).
  "Todos los países" restores the full lead-derived city list. A small helper invoked
  from `f-country`'s `onchange` does this and then calls `renderTable()`.
- The filter predicate in `renderTable()` (the block around leads.js line 73-80)
  excludes leads whose `country` doesn't match the selected `f-country`.
- `f-country` must be added to **both** filter lists, which are separate arrays:
  - `clearFilters()` reset list — leads.js line 217 (note: this list currently omits
    `f-mine`; add `f-country` here).
  - the `hasFilters` "active filters" check — leads.js line 143.
- **Display (no new table column):** the table keeps its existing `city`/`barrio`
  `<td>`s and `colspan="13"` empty-state **unchanged**. Country is added only to:
  - the lead detail **modal** meta line (leads.js line ~318-319), rendered as
    `país · ciudad · barrio`; and
  - the table-row **search string** (leads.js line 91), so country is searchable.
    (For consistency, `city` is also added to that search string, which currently
    includes only `barrio`.)

### 6. Export (`export.js`)

Add a `country` column to the leads CSV export (positioned next to `city`).

### 7. Backend (`apps-script/Code.gs`)

- The `scrape` action accepts an optional `region` parameter and forwards it to the
  Google Places request (e.g. as the `region` bias). Purely additive: if `region` is
  absent, behavior is identical to today.
- **`country` persistence on row writes:** the lead-row and scheduled-job-row writers
  (Code.gs around lines 327 and 490, which currently write `city`/`barrio` with no
  `country`) gain a `country` field so server-stored rows carry country too. Also
  additive — older rows without the column read back as empty and are defaulted to
  `Colombia` by the load migration (Section 2). The lead header constant
  (`LEAD_HDR`/equivalent) is extended with `country` accordingly.

### 8. Init wiring (`main.js`)

- Call `fillCountries()` for `sc-country`, `imp-country`, `sj-country`, and
  `f-country` during section init.
- Default every country selector to `'Colombia'` so the app's current behavior is
  unchanged on first load.

## Labels & Conventions

- US country label: **`Estados Unidos`** (consistent with the Spanish UI).
- Colombia label: **`Colombia`**.
- Country keys are the human-readable labels (no separate code), matching the existing
  city-key convention in `LOCATIONS`.

## Data Flow

```
sc-country ─┐
            ├─► fillCities(country) ─► fillBarrios(country, city) ─► sc-barrio (barrio|lat|lng)
            └─► fillCats(country)   ─► fillKws(country, cat)      ─► sc-kw

runScraper() ─► sheetsCall({action:'scrape', keyword, lat, lng, radius, maxResults, region})
            └─► lead { country, city, barrio, ... } ─► S.leads ─► push to Sheets

storage load ─► lead.country ||= 'Colombia'   (migration)

populateFilters() ─► f-country options = distinct l.country on leads
f-country ─► recompute f-city options from leads where l.country === sel
          └─► renderTable() filters leads by country
```

Note: the Leads filters (`f-country`, `f-city`, `f-barrio`) are **lead-derived**
(distinct values present on `S.leads`), distinct from the scraper selectors
(`sc-*`), which are **`LOCATIONS`-derived**.

## Error Handling

- Unknown / missing country in a lead → treated as `Colombia` (migration default);
  never throws.
- `LOCATIONS[country]` missing → selectors render empty rather than erroring (guarded
  the same way the current `LOCATIONS[city]` lookups are).
- Backend `region` omitted or unrecognized → Places call proceeds without region bias.

## Testing / Verification

Manual verification against the locally served app (`index.html`):

1. **Migration:** load with existing/demo leads → every lead shows `Colombia`; no
   console errors.
2. **Scraper cascade:** switch country Colombia ↔ Estados Unidos → city list, barrio
   list, and keyword tree all update correctly; GPS field populates for a US barrio.
3. **Scrape stamping:** run a (demo-mode) scrape with Estados Unidos selected → new
   leads carry `country:'Estados Unidos'` and the chosen city/barrio.
4. **Leads filter:** `f-country` narrows `f-city`; filtering by Estados Unidos shows
   only US leads; "Todos los países" restores all.
5. **Import:** importing with a country selected stamps that country on the leads.
6. **Export:** CSV includes the `country` column with correct values.
7. **Regression:** a Colombia-only workflow (scrape → leads → export) behaves exactly
   as before.

## Files Touched

| File | Change |
|------|--------|
| `js/data/locations.js` | Nest by country; add Estados Unidos (Miami, Orlando, Tampa, Jacksonville) |
| `js/data/keywords.js` | Nest by country; add English US keyword tree |
| `js/core/storage.js` | One-time `country` backfill on load |
| `js/features/scraper.js` | Country selector, cascade helpers, stamp + region param |
| `js/features/import.js` | Country selector + stamp on import |
| `js/features/leads.js` | `f-country` filter predicate, cascade helper, both filter-list arrays (lines 143 & 217), modal meta + search-string display |
| `js/features/export.js` | `country` CSV column |
| `js/main.js` | `fillCountries` wiring + defaults; `populateFilters()` builds `f-country` (lead-derived); updated `fillCats` call sites (lines 87, 91) |
| `index.html` | `sc-country`, `imp-country`, `sj-country`, `f-country` selects; updated `sj-city` inline handler (line 568) |
| `js/data/demo-data.js` | Add `country:'Colombia'` to demo leads |
| `apps-script/Code.gs` | `scrape` accepts optional `region`; `country` field on lead/scheduled-job row writes (lines ~327, ~490) + header constant |
