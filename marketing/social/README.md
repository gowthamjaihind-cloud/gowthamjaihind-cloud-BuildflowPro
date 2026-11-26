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
