# Sitetru — Tamil translation brief

Two CSVs in this folder. Open in Excel or Google Sheets, fill in the **`tamil`**
column, send the files back. Change nothing else — the other columns are how the
text gets put back into the app.

| file | rows | what it is |
|---|---|---|
| `ui-strings.csv` | 570 | Buttons, labels, table headings, placeholder text |
| `wbs-template-names.csv` | 240 | Construction work-breakdown task names |

The two are different jobs. The first is interface language. The second is trade
vocabulary — the names of activities on a building site — and is better done by
someone who has been on one.

---

## Who reads this

Small and mid-size building contractors in Tamil Nadu, and the site engineers
who work for them. On site, on a phone, often in a hurry. Many switch between
Tamil and English for technical words without thinking about it.

So: **ordinary working Tamil, not formal or literary Tamil.** If a site engineer
would say the English word out loud on site, the English word — written in Tamil
script or left in Latin script, your judgement — is usually the better
translation than a coined pure-Tamil equivalent nobody uses.

The app already has 478 translated strings in this register. Please skim
`src/i18n/translations.ts` (or ask for a sample) and match it. Consistency with
what is already there matters more than any individual word being ideal.

## Columns in `ui-strings.csv`

| column | meaning |
|---|---|
| `key` | Internal name. **Do not edit.** |
| `english` | The text as it appears now. **Do not edit.** |
| `tamil` | **Empty — this is your column.** |
| `translate` | `YES` = translate. `NO` = leave `tamil` blank, see `note`. |
| `note` | A warning where one applies. Read it. |
| `screen` | Which screen the text appears on. Your main context clue. |
| `occurrences` | How many places it appears. High numbers are worth extra care. |
| `first_seen` | For the developer. Ignore. |

## Things that must not be translated

- **`Sitetru`** — the product name. Never translated, never transliterated. One
  name everywhere.
- **Units** — `MT`, `Bag`, `Nos`, `Cum`, `Sqm`, `Kg`. These appear on the
  vendor's own paperwork. A translated unit makes a quantity impossible to check
  against the delivery note.
- **Statutory and trade codes** — `GST`, `GSTIN`, `HSN`, `PO`, `GRN`, `TDS`,
  `RA`, `WBS`. Where a row's note says *"Translate, but keep PO as-is"*, please
  translate the sentence around the code and leave the code in Latin letters.
  These end up on documents an auditor reads.
- **`₹`** — keep the symbol.

## Things worth knowing

- **Length.** These are buttons and table headings on a phone. Where a Tamil
  phrase runs much longer than the English, a shorter everyday word beats an
  exact one. If nothing short works, translate it properly and flag the row —
  we will make the column wider.
- **One row, several screens.** The `screen` column often lists more than one,
  because the same English label is used in more than one place — `Type` appears
  on both Cost Management and Document Vault, `Value` on Inventory and
  Procurement. There is only one cell for it, so the Tamil has to make sense in
  every screen listed. Where it genuinely cannot, say so and we will split the
  row rather than have you compromise.
- **A few labels appear as two rows.** `Edit task` is on the Gantt chart and on
  the WBS screens, and comes through as two separate rows. Please give them the
  same Tamil unless there is a reason not to.
- **Sentence case.** English here uses Title Case for headings, which Tamil does
  not need. Write it as Tamil normally would.
- **Not sure?** Leave the row blank and add a note in a spare column rather than
  guessing. A blank is easy to spot. A confident wrong answer is not.

## `wbs-template-names.csv`

These are standard construction activities — *Site clearing & levelling*,
*Anti-termite treatment*, *Footing reinforcement*. They become the
default task list when a contractor starts a project, so they are read by people
planning and costing real work.

Use the words used on site in Tamil Nadu. Where the trade genuinely uses the
English term, keep it. An invented Tamil word for a thing every mason calls by
its English name helps nobody.

## What happens after you send it back

For the developer, not the translator:

1. `node scripts/i18n-apply.mjs i18n-handoff/ui-strings.csv` — dry run. It
   refuses rows whose Tamil column holds no Tamil characters, rows whose English
   has changed since the CSV went out, and any key that would conflict.
2. Re-run with `--write` to add the keys to `src/i18n/translations.ts`.
3. **`src/i18n/reuse.test.ts` will then fail, on purpose.** Its rule is that no
   hardcoded JSX string may duplicate a translated key — which is precisely what
   step 2 creates. Red means "the keys exist, now wire them up".
4. `npm run i18n:report -- --all` lists every file and line. Replace the text
   with `t("key")` in batches; the typecheck catches misses. Green when done.

## Sending it back

Return both CSVs with the `tamil` column filled. Keep the file format (UTF-8
CSV) and the column order. Tell us which rows you were unsure about.

---

*Nothing in the `tamil` columns was pre-filled, on purpose. Machine-translated
Tamil has been tried in this codebase three times and reverted each time: once a
wrong word is sitting in the cell, a reviewer corrects it instead of translating
it fresh, and the mistake survives. Blank cells produce better work.*
