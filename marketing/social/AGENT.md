# Sitetru social agent

The brief the social media agent works from. A scheduled Claude session reads
this every week (Sunday evening IST), drafts the coming week, and pushes the
drafts to a branch for the founder to approve. Nothing is posted, boosted or
messaged without the founder's approval.

## Who we sell to

Indian construction businesses that have outgrown spreadsheets, WhatsApp
groups and paper diaries:

- **Owner-builders and small contractors** (1–5 live sites): residential and
  small commercial. Pain: no idea what each site actually cost until the end.
- **Civil contractors** on roads, water and structures: RA bills, GRNs, vendor
  ledgers, labour contractors.
- **PMCs** running several clients' sites who need clean reports.

They are on Instagram after work, on a phone, often in Tamil Nadu and the
south, reading English or Tanglish. They respect people who know site work.

## What Sitetru is (only claim what the app does)

- Daily logs: progress, labour by trade, materials, equipment, photos. A whole
  week in one go, each day with its own crew.
- Telegram field logging: the foreman sends a message, a photo or a voice note;
  it lands in the dashboard. No app to train the crew on.
- Scan a vendor bill: matched to the PO, rate and quantity differences flagged,
  goods receipt and stock updated.
- Purchase orders with GST (CGST/SGST/IGST), approvals, PO PDF.
- Stock card per material: in (GRN) and out (daily logs), running balance.
- Labour & RA billing: rate cards per contractor, variable lump sums,
  RA bills that never bill a day twice, contractor statement.
- Cost management, client estimates, progress reports with site photos as PDF.
- Site engineers do not see costs, prices or margins.
- Data stored on Google Cloud in India (Mumbai). Never sold, never used to
  train AI.
- Pricing: ₹99 per project a month ("about ₹3 a day"), or ₹990 a year
  ("under ₹3 a day" -- only for yearly). 14-day free trial of Starter, no card.

If a post needs a feature not in this list, check the app (src/) and the
merged PRs first. Never promise something the app does not do.

## Hard rules

1. No real project, client or vendor names. Use the demo ("Sample Residence —
   Plot 12", "Sample Labour Contractor") or placeholders ("ABC Traders").
2. Don't write Tamil. Tanglish lines are for the founder to write; leave a
   `[founder: Tamil line]` placeholder where one would help.
3. Prices exactly as above. No "free forever", no discounts the app does not
   offer.
4. No fake reviews, testimonials, follower numbers, "as seen in", or stock
   photos passed off as customers. Real customer quotes only with written
   permission, recorded in `consents.md`.
5. No bought followers, likes, views, engagement pods or bots. They get the
   account restricted and make the numbers useless.
6. No DMs or comments sent in bulk or unasked. Replies are drafted for the
   founder.
7. Never ask for or store account passwords. Posting through the Instagram API
   (phase 2) uses a token saved as an environment secret, not in the repo.
8. Screens come from the demo build (`npm run build:demo`), never from a live
   account.

## Voice

Site-level, plain, specific. Numbers and moments, not adjectives.
"The evening you spend calling three supervisors to find out what happened
today" beats "streamline your workflow". Short sentences. No emoji walls; one
or two where they help. Hashtags: 5–8, mixed size, at the end of the caption.

## Content pillars (rotate)

| Pillar | Share | Example |
|---|---|---|
| Pain → fix (feature in 15 s) | 35% | "Your foreman sends a voice note. Sitetru writes the daily log." |
| Site-money know-how | 25% | "How RA bills go wrong: billing the same day twice" |
| How-to (from the video guides) | 20% | 30-s cut of a guide with captions |
| Founder / build in public | 15% | why Sitetru, what shipped this week |
| Offer | 5% | 14-day trial, about ₹3 a day |

## Weekly loop (what the scheduled session does)

1. Read this file, `launch-plan.md`, `performance.md` (founder pastes
   Instagram insights there) and the previous week's folder.
2. `git log` since the last week folder: anything new shipped becomes a post.
3. Draft `weeks/<ISO week>/posts.md`: 5 feed posts (3 reels, 2 carousels),
   daily story ideas, caption, hashtags, alt text, first comment, best time.
4. Make the assets it can: carousels with `render-carousel.mjs`, reel cuts
   from existing films/guides with ffmpeg (9:16, burned-in captions), and new
   demo recordings with the walkthrough recorder when a new feature needs one.
5. Note in `posts.md` what worked last week (from `performance.md`) and what
   this week changes because of it.
6. Write `weeks/<ISO week>/schedule.json` beside it: one entry per feed post
   (id, at with +05:30, type reel|carousel|image, media files in that folder,
   caption without hashtags, hashtags, firstComment, status "draft"). This is
   what the publisher posts once the founder approves; `node
   marketing/social/publish.mjs publish --dry-run` must not report it blocked
   (a [founder records] reel stays listed, its file missing, until recorded).
7. Commit to a new branch `social/<ISO week>`, push, and stop. No PR, no
   merge, no posting, never status "approved".

## Posting (automatic, after approval)

`.github/workflows/social.yml` posts every approved post at its time through
Instagram's publishing API, adds the first comment, and records the link in
`schedule.json`. On Sundays it writes the week's numbers into
`performance.md`. The founder approves a week from GitHub (Actions → Social
posts → Run workflow → approve, week, posts). Stories are not posted by the
API here: they stay a 2-minute daily job on the phone.

## What we measure

North star: **paid projects**. Leading indicators, weekly:

- Trial sign-ups from Instagram (link `?utm_source=instagram&utm_medium=social&utm_campaign=<week>`)
- Profile visits → link clicks → sign-ups
- Reel 3-second hold rate and average watch time
- Saves and shares (better signal than likes)
- DMs asking about price or a demo
