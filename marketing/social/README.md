# Social media

- `AGENT.md`: the agent's brief (audience, what Sitetru does, hard rules, weekly loop).
- `launch-plan.md`: the 30-day Instagram launch plan and profile setup.
- `weeks/<ISO week>/posts.md`: that week's posts, captions, assets and stories.
- `performance.md`: weekly numbers you paste in; the agent plans from them.
- `consents.md`: permission to quote or show a customer.
- `render-carousel.mjs`: 4:5 carousels from a slide list.

    CHROME_PATH=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux64/chrome | tail -1) \
      node marketing/social/render-carousel.mjs marketing/social/weeks/2026-W49/carousel-pricing.json

A scheduled session drafts the next week every Sunday evening (IST) on a
branch `social/<ISO week>`. Nothing is posted without your approval.

## Automatic posting

`publish.mjs` + `.github/workflows/social.yml`:

- Every 30 minutes: posts each **approved** post in `weeks/*/schedule.json`
  whose time has come (up to 12 hours late; later than that, change its time).
  Reels, carousels and single images, caption, hashtags, first comment. It
  checks the account first, so a retried run never posts twice.
- Sundays 4:45 pm IST: reach, plays, saves, shares, followers into
  `performance.md` (profile visits, link clicks, trials stay yours to fill).
- Approve: GitHub → Actions → **Social posts** → Run workflow → `approve`,
  week `2026-W50`, posts `all` or `1,2,4`. Works from the GitHub phone app.
  It brings the week over from its `social/<week>` branch.

### One-time setup (about 30 minutes, by you)

1. Instagram account set to **Business**, linked to a **Facebook Page**.
2. developers.facebook.com → Create app → type *Business* → add the
   **Instagram** product ("API setup with Facebook login").
3. In Graph API Explorer, pick the app, add permissions
   `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`,
   `instagram_manage_comments`, `pages_show_list`, `pages_read_engagement`,
   generate a token, then exchange it for a **long-lived** token (60 days;
   the Access Token Debugger has "Extend").
4. GitHub repo → Settings → Secrets and variables → Actions → add
   `IG_ACCESS_TOKEN`. Paste it there only, never in a chat, file or commit.
   The Instagram account is found from the token's Page; `IG_USER_ID` is
   needed only if the token reaches more than one account.
6. Renew the token before 60 days (a reminder is worth setting); the
   workflow log says "Error validating access token" when it has expired.

Media is put in the project's storage bucket under `social/` and given to
Instagram as a 3-hour signed link, using the existing deploy credentials.
