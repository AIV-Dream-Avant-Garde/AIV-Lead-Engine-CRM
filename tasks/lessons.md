# AIV CRM — Lessons Learned

## Session 2026-05-28

### L9: Node syntax-checks and isolated mocks do NOT prove browser behavior
**Mistake:** Claimed the country-tier feature "verified" after `node --check` + a hand-rolled DOM mock that loaded `scraper.js` in isolation. User reported the País dropdown was empty/non-functional.
**Rule:** For this static app, "functional" means it runs in a real browser. Verify by loading the actual `index.html` in headless Chrome (`/Applications/Google Chrome.app/.../Google Chrome --headless=new --dump-dom`), ideally via a same-origin iframe harness that drives the real `init → renderAll → navigate` path and reads real DOM/option state. jsdom is unreliable against Python's `http.server` (spurious "Could not load script").
**How to apply:** After any frontend change, run an iframe-harness Chrome check that asserts the actual rendered options, with `errs:[]`, before saying "verified."

### L10: Stale browser cache masquerades as a code bug
**Symptom→cause map:** new HTML element present but EMPTY = browser served the new `index.html` but **cached old JS** (old `main.js` never calls the new populate fn). Element entirely absent = cached old HTML.
**Rule:** A plain `python -m http.server` sends no cache headers; browsers heuristically cache JS and won't re-request on a normal reload, so the no-cache header never applies. Fix at the root by **cache-busting asset URLs** (`?v=<stamp>` on every local `css/`+`js/` ref) — changing the URL forces a fresh fetch regardless of cache state. Also run the dev server with `Cache-Control: no-store` (see gitignored `.devserver.py`).
**How to apply:** Bump the `?v=` stamp in `index.html` whenever JS/CSS changes during a session where the user already loaded the page.

### L11: macOS has no `timeout` command
**Mistake:** Wrapped headless-Chrome runs in `timeout 30 ...`; exited 127 ("command not found") and produced no output, briefly looking like the app failed.
**Rule:** Don't use `timeout`/`gtimeout` on macOS. Chrome `--dump-dom` exits on its own; rely on `--virtual-time-budget`.

## Session 2026-03-19

### L1: Grep tool parameter name
**Mistake:** Called Grep with `file_path` parameter instead of `path`.
**Rule:** Always use `path` (not `file_path`) for the Grep tool's directory/file argument.

### L2: Read tool offset must be a number
**Mistake:** Passed offset as `"1,"` (string with comma) instead of `1` (integer).
**Rule:** Read tool `offset` and `limit` are integers. Never include commas or quotes.

### L3: HTML pre block code requires entity decoding for Code.gs
**Mistake:** GAS code in the HTML `<pre>` uses `&lt;`, `&gt;`, HTML spans for syntax highlighting.
**Rule:** Strip all span tags and decode HTML entities when extracting to .gs file.
**Entities to handle:** `&lt;` → `<`, `&gt;` → `>`, `&amp;` → `&`, `&iquest;` → `¿`, `&rarr;` → `→`

### L4: Missing header constants in GAS code
**Mistake:** Original code referenced `TEAM_HDR` and `COMM_HDR` but never defined them.
**Rule:** Cross-reference all constants used in doGet/doPost. If missing, infer from feature files' data shapes.

### L5: CLAUDE.md must be at project root
**Observation:** CLAUDE.md was placed in css/ subdirectory — Claude Code only auto-loads it from the project root.
**Rule:** Always place CLAUDE.md at the git repo root.

### L6: Write tool requires prior Read on new files
**Mistake:** Write tool rejected new file writes with "File has not been read yet."
**Rule:** For brand-new files with no prior content to preserve, use Bash heredoc instead of Write tool.

### L7: Cross-reference state declarations against all consumers before shipping
**Mistake:** The CALL object in state.js was written with 4 wrong property names (`conn`, `leadId`, `startTime`, `consentGiven`) and was missing 5 properties (`activeCall`, `muted`, `callSid`, `outcome`, `incomingCall`, `curLeadId`). JavaScript's silent dynamic property addition meant it didn't crash, but the declared properties were dead weight.
**Rule:** For any shared state object, grep every `OBJECT.propertyName` access across ALL files that touch it and verify each property is declared with the correct name and type.
**How to apply:** After writing a state module, run: `grep -r "CALL\." js/` and cross-check every property against the state declaration. Same for `S.` properties.

### L8: Declare all dynamic properties on state objects upfront
**Mistake:** `S.failCount` and `S.lockoutUntil` were written by auth.js but not declared in state.js. They worked due to JS dynamic property addition but created implicit state that wasn't visible in the state definition.
**Rule:** Every property that any module writes onto a shared const object must be declared in that object's initial definition, even if just as `null` or `0`.
**How to apply:** After writing feature modules, grep for assignments like `S.newProperty = ...` and ensure each `newProperty` exists in state.js.
