# Tests

Zero-dependency unit tests for the high-risk core logic (commission math, lead
scoring, PIN strength, hashing, session signing, CSV parsing). No npm, no build.

## Run

```bash
node tests/harness.js
```

Exit code `0` = all pass, `1` = a failure, `2` = harness error.

## How it works

`harness.js` loads the **real** app source (`js/**`) into a small stubbed
sandbox (a fake `document`, `localStorage`, `crypto`, etc.) so the actual
functions run — no copies. `cases.js` then calls those functions and asserts.

Pure logic only: anything needing a live DOM or the network (sync round-trips,
Twilio, the scraper backend) is covered by the browser harnesses used during
development, not here.

## Add a test

Edit `tests/cases.js`:

```js
test('my behavior', () => {
  eq(myFunction(input), expected, 'message');
  assert(condition, 'message');
});
// async is supported:
test('hashing', async () => { eq(await sha256('x'), '...'); });
```

If your function lives in a file not yet loaded, add it to `APP_FILES` in
`harness.js` (dependency order; avoid `main.js` — its init runs at load).
