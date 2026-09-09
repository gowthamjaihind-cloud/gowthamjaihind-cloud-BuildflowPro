# Deployment Guide: Sitetru

This application is built with a React frontend (Vite) and an optional Express backend (if configured). It uses Firebase for its database and authentication.

## 1. Hosting Options

### A. Deploying to Cloud Run (Recommended)

Since this app is currently running in a containerized environment, Cloud Run is the most direct deployment path.

1.  **Containerize**: The app already has a `package.json` and build scripts.
2.  **Build and Push**: Use Google Cloud Build to build the image and push it to Artifact Registry.
3.  **Deploy**: Create a Cloud Run service using the pushed image.
4.  **Environment Variables**: Ensure you set the following in the Cloud Run configuration:
    - `GEMINI_API_KEY`: Your Google AI SDK key.
    - `VITE_FIREBASE_API_KEY`, etc. (if you prefer environment-based config).

### B. Static Hosting (Frontend Only)

If your app doesn't use a custom server (Express), you can deploy it as a static site.

1.  **Build**: Run `npm run build`.
2.  **Output**: The static files will be in the `dist/` directory.
3.  **Upload**: Upload the `dist/` contents to:
    - Firebase Hosting
    - Vercel
    - Netlify
    - AWS S3 / CloudFront

## 2. Firebase Production Setup

Before moving to production:

1.  **Provision Production Firebase Project**: Create a new project in the [Firebase Console](https://console.firebase.google.com/).
2.  **Update Config**: Replace the contents of `firebase-applet-config.json` with your production project's web configuration.
3.  **Deploy Security Rules**:
    - Ensure your `firestore.rules` are hardened.
    - Run `firebase deploy --only firestore:rules` using the Firebase CLI.
4.  **Enable Authentication**: Enable "Google Login" in the Firebase Auth console and add your production domain to the "Authorized domains" list.

## 3. Environment Variables

Create a `.env` file in your production environment (or set them in your CI/CD provider):

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
GEMINI_API_KEY=your_gemini_key
```

## 4. CI/CD Pipeline

For professional deployment, consider using GitHub Actions:

1.  **Trigger**: On push to `main`.
2.  **Build**: `npm install` and `npm run build`.
3.  **Deploy**: Use the Firebase Hosting Action or a Cloud Run Deploy Action.

---
*Note: Sitetru is designed as a secure, full-stack application. Always ensure your Firebase rules are strictly validated to protect user data.*

---

## 5. Tenant isolation on Cloud Storage — deploy in this order

Storage rules cannot read Firestore, so org membership travels in the ID token
as an `orgIds` custom claim. `functions/src/claims.ts` mints it from
`organizations/{orgId}.members`; `storage.rules` checks it with `memberOf()`.

Before this, `storage.rules` could only ask whether the caller was signed in at
all — so any signed-in user could read another organisation's drawings,
invoices and site photos if they knew the object path.

**The order is not optional.** Functions deploy automatically on a merge to
`main` (paths `functions/**`). Rules deploy only from the manual
**Deploy Firestore Rules** workflow. So:

1. **Merge.** The functions deploy mints claims from then on: on org creation,
   on invite acceptance, on any change to a members map (`onOrgMembersChanged`),
   and on sign-in via `syncMyClaims`, which is what backfills existing accounts.
2. **Wait for clients to pick the claim up.** A signed-in user gets it on their
   next app load; the client forces an ID-token refresh when the claim changes.
3. **Then run Deploy Firestore Rules** (Actions tab → Run workflow).

Do it the other way round and anyone holding an hour-old token is locked out of
their own files until it refreshes.

> The claim is built from the organisation's own members map, never from
> `users/{uid}.orgIds`. `firestore.rules` permits `update` on a user's own
> document, so that mirror is client-writable — minting from it would let a user
> append someone else's orgId and be handed that tenant's files. Pinned by
> `functions/src/claimsPolicy.test.ts`.

**Still open:** the legacy `/projects/{projectId}/**` Storage prefix. Those
paths predate organisations and carry no orgId, so there is nothing to check a
claim against, and the client still writes there when a user has no
`currentOrgId`. They remain signed-in-only until those objects are migrated
under an `organizations/` prefix.

## 6. App Check — monitor before enforcing

App Check is initialised in `src/firebase.ts` with a public reCAPTCHA v3 site
key, so requests already carry an attestation token. Nothing on the server
checked it: all 27 callables accepted any caller with a valid ID token.

Enforcement is now a single deploy-time switch (`functions/src/callable.ts`),
default **off**, because turning it on blind takes the whole product down — if
the site key is not registered for this project, every callable rejects every
user at once.

1. Firebase console → **App Check** → register the web app with reCAPTCHA v3.
2. Leave the Functions / Firestore / Storage providers in **monitoring** mode
   and watch the *verified requests* share climb as clients update.
3. Only once that share is effectively 100%, set the repository **variable**
   `APPCHECK_ENFORCE=true` and re-run the functions deploy. One variable covers
   all 27 callables.
4. To roll back, clear the variable and redeploy. No code change either way.

Monitoring first is the point: it shows what enforcement *would* have broken
before it breaks it.

## 7. Tamil coverage — where the real gap is

The translation table is **complete**: 478 keys, both locales, no missing
entries, guarded by `src/i18n/translations.test.ts` (key parity, no
English-only Tamil value, interpolation placeholders preserved).

The gap is elsewhere, and the table hides it. A large amount of interface text
is written straight into JSX with no key at all, so a Tamil user reads it in
English however the toggle is set. Measure it:

```
npm run i18n:report            # summary
npm run i18n:report -- --all    # every occurrence with file:line
```

At the time of writing: **880 occurrences, 619 distinct strings**. 49 of those
already exist under a translated key and can be swapped for it with no
translation work; **570 distinct strings need Tamil.**

That last number is the launch item, and it needs a Tamil speaker rather than
a code change — which is why the wiring has deliberately not been done ahead of
it. Moving 880 call sites onto keys whose Tamil value is a copy of the English
would make the app *look* translated while still showing English, and turn one
pass into two. Translate from the report, then wire each string once.

Two conventions to keep when adding keys:

- **Sentence-splitting.** Where a sentence wraps a value, use `…Pre` / `…Post`
  halves rather than interpolation. Tamil is postpositional, so the case
  ending attaches to the value and the sentence follows it — which is why
  `paywall.accessPausedPre` is empty in Tamil and `…Post` starts "க்கான…".
  The test allows those empty values explicitly and checks the Post half
  carries the words.
- **Reuse the `common.*` keys** for bare action words. `Cancel`, `Close`,
  `Delete`, `Edit`, `Save`, `Date`, `Status` are already translated; the report
  names the key for each.

## 8. WBS template names

`src/lib/wbsTemplates.ts` holds 267 task names across the built-in templates.
These are **not** UI text: applying a template writes them into Firestore as
task documents that stay editable, so they cannot be looked up at render time.
The language is chosen once, when the project is seeded.

`WbsNode` therefore takes an optional `nameTa`, and `planFromTemplate(template,
start, lang)` prefers it when the active language is Tamil, falling back to
`name` per node. So the templates can be translated incrementally — a node
without `nameTa` still seeds a complete breakdown in English rather than a
blank row. Pinned by `src/lib/wbsTemplates.test.ts`, including that every
shipped template yields non-empty names in both languages.

Adding the Tamil is pure data entry against that one file: `nameTa: "…"` beside
each `name`.
