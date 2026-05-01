# Review session: save / publish race



This document captures the reviewer’s feedback, how we engaged with each point, and what changed in the codebase as a result.

---

## Reviewer session (summary)

The reviewer looked at:

1. **Instrumentation and harness** — whether tracing was accurate, opt-in, and useful for proving ordering between `/draft` and `/publish`.
2. **Proposed fix** — wait on the server for in-flight saves before publish reads `currentDraft`, with attention to **snapshotting** which saves to wait for so a publish does not accidentally wait for saves that start *after* publish arrives.
3. **Follow-up correctness** — whether the first implementation of the wait had subtle bugs (e.g. timers, semantics).

---

## Point-by-point engagement and outcomes

### 1. Instrumentation correctness (server)

**Reviewer concern:** Trace payload construction could let `details` overwrite snapshot fields if someone passed keys like `currentDraft` in the future; minor footgun.

**Engagement:** Acknowledged as a real maintainability risk, low severity today because callers only pass controlled keys.

**What changed:** No structural change to `trace()` yet; noted for a possible future hardening (e.g. nest unknown fields under `extra` or spread `details` before snapshots). Current traces remain trustworthy for this assignment.

---

### 2. Instrumentation overhead when `RACE_TRACE` is off

**Reviewer concern:** Some counters or IDs might still mutate when tracing is disabled.

**Engagement:** Agreed it is a small divergence from “zero overhead” but harmless for this repo size.

**What changed:** Left as-is; acceptable tradeoff for readable trace IDs across save and publish.

---

### 3. Harness semantics after a fix exists

**Reviewer concern:** A harness that exits success when the bug reproduces becomes misleading once the bug is fixed.

**Engagement:** Agreed — post-fix, the harness should fail if stale publish appears again.

**What changed:** `harness/race-trace.js` was updated so a detected race sets a non-zero exit code and a clear “Race detected” message; when fixed, it prints “Race not reproduced” and exits successfully.

---

### 4. Proposed fix: wait for in-flight saves — is it a good idea?

**Reviewer position:** Server-side coordination is the right layer; client-only fixes are insufficient. A naive “always await latest save promise” can pull in saves that **start after** publish, which is wrong.

**Engagement:** Agreed fully. Implemented publish so it **snapshots** the set of pending draft commit promises at the moment `/publish` is handled, awaits only those, then reads `currentDraft`. That matches “publish should not see stale state for a save already in flight when publish was clicked,” without waiting for unrelated later saves.

**What changed:** `app/server.js`: `pendingDraftCommits` set, per-save `commitPromise`, `/publish` is `async`, copies `Array.from(pendingDraftCommits)` at receive time, `await waitForDraftCommits(...)`, then assigns `publishedDraft = currentDraft`.

---

### 5. Timeout and failure mode for publish while waiting

**Reviewer concern:** Publish must not hang forever if a save never completes.

**Engagement:** Agreed; added bounded wait with HTTP error response.

**What changed:** `PUBLISH_WAIT_TIMEOUT_MS` (default 5000, overridable via env). On timeout, `/publish` responds with **503** and a JSON error; trace logs `publish:wait:timeout`.

---

### 6. Timer leak in `waitForDraftCommits` (correctness bug in first fix)

**Reviewer finding:** The original `Promise.race` with `setTimeout` did not clear the timer when saves won the race, leaving a pending timer that kept the Node event loop alive for the full timeout duration (observed ~5s extra on harness and tests).

**Engagement:** Confirmed by runtime behavior; treated as a real bug.

**What changed:** `waitForDraftCommits` now stores the timeout handle and **`clearTimeout` in `.finally()`** after the race completes, so no leaked timer.

---

### 7. Test script picking up duplicate tree

**Context:** `node --test` with no path was discovering a nested duplicate `week_4_506/` tree and running tests twice against inconsistent copies.

**Engagement:** Scoped tests to the intended directory only.

**What changed:** `package.json` — `"test": "node --test tests"` and added `"harness:race": "node harness/race-trace.js"`.

---

### 8. Client-side tracing (`app/static/index.html`)

**Reviewer note:** Optional UX tweak — friendlier wording vs pure “fetch start/settled” labels.

**Engagement:** Kept the clearer timing-oriented labels for debugging; acceptable for this assignment’s demo page.

**What changed:** Client logs include elapsed ms and `console.log` lines for correlation with server `[race-trace]` lines.

---

## Files touched (high level)

| Area | Files |
|------|--------|
| Fix + trace | `app/server.js` |
| Client trace | `app/static/index.html` |
| Harness | `harness/race-trace.js` |
| Scripts | `package.json` |
| Evidence | `trace.txt` (captured harness output with tracing on) |

---

## Verification

- `npm test` — regression tests under `tests/` pass.
- `npm run harness:race` — prints timeline; after fix, shows publish waiting until draft commit completes, then `published` matches latest save.

---

## Items explicitly not done (optional follow-ups)

- Harden `trace()` so `details` cannot shadow snapshot fields.
- Remove redundant `pendingDraftSaves` if it is fully represented by `pendingDraftCommits.size`.
- API-level fix: `POST /publish` with explicit `content` or `saveId` to avoid shared mutable “current draft” entirely (stronger long-term design).
