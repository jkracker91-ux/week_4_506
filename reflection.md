# Reflection: harness, isolation, modular design, and review

## Why do we create a harness? Why is it worth the time, instead of just asking AI to fix the bug directly?

I believe this is to understand the overall process: to better walk through how AI can help diagnose and potentially fix the problem. I think it is worth the time once you understand how to go through the process.

---

## Why is isolation important? Why does the harness drive the failing code path under controlled conditions instead of running the full app and hoping the bug fires?

It is important to isolate in order to completely understand where the bug and/or code is failing. Simply firing the app will not show you where you need to direct your attention; you will just be scanning and hoping to find it.

---

## How does modular design help in debugging? This bug had a clear seam between "save" and "publish." How would the debugging have been different if the same logic were buried in a 500-line monolithic handler with no clear boundaries?

I think had the bug not been identified and clear I would have had to rely on the AI to go through more broadly and come back with potential problems to fix, and then hope that one of those fixes was the correct one to address.

---

## On the review: What kinds of problems with a fix can a code review catch that an automated test cannot?

**Category (be specific):** Resource lifecycle and runtime side effects — non-functional correctness around timers, process lifetime, and the event loop.

Automated tests usually assert outputs for a fixed scenario (status codes, JSON bodies, a single interleaving). They rarely assert that the implementation leaves no dangling timers, that wall-clock / process lifetime stay reasonable, or that the event loop is not held open by implementation detail. A human reading `Promise.race` + `setTimeout` can spot “we must clear this timer in all outcomes” even when every assertion still passes.

---

## Quote from the review session — and why testing alone would not have surfaced it

**Quote (most substantive — timer leak after the fix):**

> The original `Promise.race` with `setTimeout` did not clear the timer when saves won the race, leaving a pending timer that kept the Node event loop alive for the full timeout duration (observed ~5s extra on harness and tests).

The regression test still passed; it only checks `published === 'draft B'`. Nothing in that test asserts “publish returns within X ms” or “no spurious timer remains for `PUBLISH_WAIT_TIMEOUT_MS`.” The bug showed up as elapsed time and harness slowness, not a failed assertion — exactly the kind of issue code review (or profiling, or lint rules for timers) catches more reliably than a narrow functional test.
