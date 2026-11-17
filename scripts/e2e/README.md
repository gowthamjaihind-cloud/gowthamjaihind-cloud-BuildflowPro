# End-to-end journeys (local emulators only)

Browser tests that drive the real app the way a customer does, against the
local Firebase emulators. Never point them at production.

    bash scripts/emulators.sh                      # terminal 1
    npm run build:emulators
    npx vite preview --outDir dist-emulators --port 4173 --strictPort   # terminal 2
    node scripts/e2e/flow.cjs                      # new customer, sign-up to sign-out (40 steps)
    node scripts/e2e/invite.cjs                    # needs explore@example.com with a "Sample Villa" project

`VIDEO=1` records a video, `OUT=dir` sets where screenshots, `results.json`
and videos go (default: the system temp folder). Each step prints PASS/FAIL;
console errors and failed requests during a step are attached to it.

What `flow.cjs` checks with numbers, not just clicks: a PO of 100 bags at
Rs 380 + 18% GST is Rs 44,840; receiving 100 and accepting 98 leaves 98 in
stock (Rs 37,240); using 10 in a daily log leaves 88; the cost cards add up
to the total; the daily report shows the log.
