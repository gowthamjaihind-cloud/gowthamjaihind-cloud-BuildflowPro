# Real Telegram screens

The three plates live in `../remotion/public/` — the launch film reads them from
there as static assets, and `build-walk-plate.mjs` composes the walkthrough's
still from the same copies.

Crops of actual screenshots of the Sitetru bot, taken on iOS by the product's
author. They replace `build-beat.mjs`, which draws an *imitation* of Telegram
in HTML — and drew it wrong: Save at the foot of the log menu instead of alone
at its head, no Cancel at all, and labour roles in a 2×2 grid the bot has never
rendered (`handlers/log.ts` puts one per row, from the project's own rate cards).

| plate | what it shows |
|---|---|
| `p-help.png` | the `/help` command list — the whole surface, including `/language` (English / தமிழ்) |
| `p-menu.png` | the log menu: `✅ Save`, `+ Materials`, `+ Labour`, `+ Equipment`, `+ Photo`, `+ Note`, `✖ Cancel` |
| `p-mats.png` | the material picker, drawn from the project's own material master |

## Why these are crops, and why the originals are not here

The full screenshots carry live data that must not ship: one names a real
project, and another lists a real project's work breakdown. Neither region is in
any plate, and neither original is in this repository.

What remains is generic construction vocabulary — a damp-proof course, steel by
diameter, AAC block sizes, binding wire. Nothing that identifies a client or a
site.

The unread-count badge in the chat header is likewise cropped away.

## Re-cutting them

There is no script, because the sources are not here and should not be. If the
plates are ever re-cut, the rules are: no project name, no work-breakdown list,
no chat-header badge, and cut on clean wallpaper rather than through a bubble.
