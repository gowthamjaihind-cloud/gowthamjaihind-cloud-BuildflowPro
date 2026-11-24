#!/usr/bin/env bash
# Local Firebase Emulator Suite: auth, Firestore (the app's NAMED database),
# every callable and trigger, and storage -- with no credentials, no production
# data, and no contact with live Razorpay.
#
#   npm run emulators        # terminal 1: the backend
#   npm run build:emulators  # terminal 2: a client build wired to it
#
# Three things have to be true or the suite starts but does not work. Each cost
# real debugging time, so none of them should be removed without reading why.
set -euo pipefail
cd "$(dirname "$0")/.."

# 1. A FAKE project id. firebase-tools treats a project whose id starts with
#    "demo-" as offline and skips every production call, which is what lets the
#    suite run unauthenticated. It MUST match EMULATOR_PROJECT_ID in
#    src/firebase.ts, or the client talks to a project the emulator isn't
#    serving. With a real project id you get:
#      "Unable to look up project number ... use a project ID starting with 'demo-'"
PROJECT_ID="demo-sitetru"

# 2. No HTTP proxy. The suite is entirely loopback, but firebase-tools routes
#    even its own 127.0.0.1 calls through a configured proxy. Behind one, trigger
#    registration dies on a non-JSON error body:
#      "request blocked: no rule allows host 127.0.0.1"
#    Scoped to this process; your shell's settings are untouched.
unset HTTPS_PROXY HTTP_PROXY https_proxy http_proxy \
      GLOBAL_AGENT_HTTPS_PROXY GLOBAL_AGENT_HTTP_PROXY \
      npm_config_https_proxy npm_config_http_proxy
export NO_PROXY="*"

# 3. No JAVA_TOOL_OPTIONS. The JVM prints a "Picked up JAVA_TOOL_OPTIONS: ..."
#    banner on stdout, and the Firestore rules runtime parses that stream. The
#    banner crashes it ("Unexpected rules runtime error") and rules then stop
#    being enforced WHILE THE EMULATOR STILL LOOKS HEALTHY -- queries that should
#    be denied quietly succeed. Any security test run with this set is worthless.
#    After starting, confirm with:
#      grep -c 'rules runtime error' <log>   # must be 0
unset JAVA_TOOL_OPTIONS

# 4. Storage as a single rules file. firebase.json lists storage as an array
#    with the named bucket (sitetru-india-files), which is right for deploys
#    but the emulator refuses an array entry without a deploy "target":
#      "Error: Must supply 'target' in Storage configuration"
#    So the emulator gets a copy of the config with storage as { rules } and
#    everything else unchanged. The copy sits beside firebase.json (paths in it
#    are relative) and is git-ignored.
CONFIG=firebase.emulators.json
node -e '
  const fs = require("fs");
  const c = JSON.parse(fs.readFileSync("firebase.json", "utf8"));
  if (Array.isArray(c.storage)) c.storage = { rules: c.storage[0].rules };
  fs.writeFileSync(process.argv[1], JSON.stringify(c, null, 2));
' "$CONFIG"

exec firebase emulators:start --project "$PROJECT_ID" --config "$CONFIG" "$@"
