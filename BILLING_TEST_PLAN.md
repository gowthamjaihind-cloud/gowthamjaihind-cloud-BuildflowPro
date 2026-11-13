# Billing test plan — Razorpay test mode

Everything in `rzpSubscription.ts` is unit-tested and the callables run against
the Firebase emulator, but **no part of this has ever talked to Razorpay**.
Mandates, webhooks and renewal dates are their behaviour, not
ours, and the only way to know what they do is to watch them do it.

Work through this in **test mode**. It takes about an hour, minus the waiting in
Test 3.

Record the result of each step in the box at the end. If something behaves
differently from "expected", that is the finding — write down what actually
happened rather than making it fit.

---

## 0. Before you start

| | |
|---|---|
| Razorpay dashboard | Switch to **Test mode** (toggle, top of the page) |
| Keys | Settings → API Keys → generate **test** keys (`rzp_test_…`) |
| In Sitetru | Settings → Operator panel → paste the **test** keys |
| GST | Leave the GSTIN **empty** for Tests 1–6; Test 7 turns it on |
| Webhook | Razorpay → Settings → Webhooks → add `https://<your-domain>/api/razorpay-webhook` |

**Webhook events to tick** — all of these, or later tests silently do nothing:

```
subscription.activated
subscription.charged
subscription.pending
subscription.halted
subscription.cancelled
subscription.completed
payment.captured          (older one-off slot purchases)
order.paid                (same)
```

Copy the webhook **signing secret** into the operator panel alongside the keys.
Without it the handler rejects every delivery — by design, since an unsigned
webhook could be anyone.

> **Do not put live keys in while testing.** Test mode uses separate keys and
> separate webhooks; a live key here charges real cards.

---

## 1. First subscription — does money start moving at all?

**Do:** sign up a fresh account → create a workspace → one project → subscribe
to Starter monthly.

**Expect:**

- Checkout asks you to approve **future payments**, not just one — that's the
  mandate, and it's the whole difference from the old flow
- The paywall shows *"Billed automatically every month until you cancel"*

**Then check Firestore** (`organizations/{orgId}`):

| field | expected |
|---|---|
| `subscriptionStatus` | `active` |
| `razorpaySubscriptionId` | `sub_…` |
| `currentPeriodEnd` | about a month out, **in milliseconds** |

**And in Razorpay** → Subscriptions: one subscription, status **active**,
quantity **1**, amount **₹99**.

> If `subscriptionStatus` is still `trialing`, the webhook did not arrive.
> Check Razorpay → Webhooks → delivery log before going further — every later
> test depends on this one.

---

## 2. The renewal date — anniversary, not month-end

This confirms the thing I could not verify from documentation.

**Do:** look at the subscription's next charge date in Razorpay.

**Expect:** the **same day of month you subscribed on**. Subscribe on the 12th →
next charge the 12th. Not the 1st, not the last day, not 30 days later.

---

## 3. The 29th/30th/31st question — the real unknown

**Razorpay does not document what happens when the anniversary falls on a date
the month does not have.** The industry norm is to bill on the last day of the
short month, but norm is not documentation, and this is your money.

**Do:** create a subscription with `start_at` set to **31 January** (any year —
test mode lets you set a future start). Then look at the schedule Razorpay shows
for February and March.

**Record exactly what you see:**

- February charge date: `________`
- March charge date: `________`

**Interpreting it:**

- Feb 28 → Mar 31 means Razorpay clamps to month end and **recovers** the 31st.
  Best case.
- Feb 28 → Mar 28 means the date **walks backwards** permanently. Worth knowing
  — tell customers the date may shift, or avoid month-end starts.

**Either way your app stays correct**, because `subscriptionPatch` stores
Razorpay's own `current_end` rather than computing a date. Access always matches
billing. This test is to know what to *tell customers*, not to find a bug.

---

## 4. Adding a project — the recurring slot subscription

Extra projects are **not** part of the plan's subscription. Each purchase of
extra projects is its **own Razorpay subscription**: ₹99 per project per month,
quantity fixed when it is created, renewing by itself until cancelled. This is
the same on Starter and on Business — see "Why extra projects are a separate
subscription" below.

**Do:** on the Starter workspace (plan already active), add a second project.

**Expect:** the add-capacity modal, a ₹99 mandate + first charge, and the
project created once the charge is confirmed.

**Check:**

- Razorpay shows **two** subscriptions for the customer: the plan (untouched,
  still ₹99) and a new one on the "extra project" plan with quantity 1.
- On the org: `slotSubs.<sub id>` = `{ qty: 1, status: "active", until: … }`,
  `recurringSlots` = 1, `recurringSlotsUntil` a few days after `until`.
- Settings → Your plan lists it under **Extra projects** with a renewal date.
- A third project is refused until another slot is bought.

**Also try:** buying 2 slots in one go (one subscription, quantity 2, ₹198),
and buying a slot on a workspace that is still on trial (must be refused: a
plan has to be active first).

## 5. Slot renewal, cancel, failure — the parts that touch money

**Renewal.** Let the slot subscription charge again (or use a daily test plan).
`until` must move forward one cycle; `recurringSlots` unchanged; the plan's own
`currentPeriodEnd` must **not** change.

- Plan renews: `________` (from `currentPeriodEnd`)
- Slot renews: `________` (from `slotSubs.<id>.until`)

The two dates differ unless both were bought the same day. Both collect
themselves.

**Cancel one slot.** Settings → Extra projects → Cancel.
Razorpay must show that subscription cancelled; the org shows it as "ends
<date>"; the slot keeps working until that date; **the plan stays active** and
nobody is locked out. After the date, a new project is refused but existing
projects stay editable.

**Failed slot payment.** With a card that fails on renewal: while Razorpay
retries (`pending`) nothing changes. On `halted` the slot stops extending and
lapses 3 days after `until`. The plan must stay `active` throughout.

**Cancel the plan.** Cancel plan must also cancel every live slot subscription
at Razorpay. Check the Razorpay dashboard: **no** subscription for that
customer is left active.

**Delete the workspace.** Deleting the organisation must cancel the plan and
all slot mandates first. With Razorpay unreachable (wrong key) the delete must
be refused rather than leave a mandate charging an account that no longer
exists.

## 6. Cancelling — does it actually stop the money?

**Do:** Settings → Cancel subscription.

**Expect:** Razorpay shows the subscription **cancelled at cycle end**, and
`cancelAtPeriodEnd: true` on the org.

**The important half:** confirm in Razorpay that **no further charge is
scheduled**. The old code set a local flag only, so a customer could cancel in
the app and still be debited next month. If you see a future charge still
queued, stop and tell me — that is the worst failure mode in the whole system.

Access should continue until `currentPeriodEnd`, then stop.

---

## 7. A failed payment — does dunning behave?

Use Razorpay's test cards for a **failed** recurring charge (their docs list
which card forces a failure; test mode can also charge a subscription manually).

**Expect, in order:**

1. `subscription.pending` → **nothing changes.** Still `active`, no banner.
   Razorpay is still retrying and the customer has lost nothing yet.
2. `subscription.halted` (retries exhausted) → `subscriptionStatus: past_due`,
   grace banner appears, 7 days of access remain.
3. After grace → `expired`, access blocked.

Step 1 is the one to watch. Flipping someone to `past_due` on the first retry
would tell a customer who has lost nothing that their account is overdue.

---

## 8. GST — only when you're registered

Skip until you have a GSTIN.

**Do:** operator panel → enter the GSTIN → start a **new** subscription.

**Expect:** checkout charges **₹116.82** (₹99 + 18%), and a **new Razorpay
plan** is created rather than the old one reused. Razorpay plans are immutable,
so reusing the 0% plan would keep charging ₹99 forever with nothing to show it
was wrong — the plan cache key carries the tax rate specifically to prevent
that.

Existing subscriptions keep their old amount. That is correct: you cannot raise
someone's mandate without their consent. They move when they next change plan.

---

## Record your results

| # | Test | Pass? | What actually happened |
|---|---|---|---|
| 1 | First subscription activates | | |
| 2 | Renews on the anniversary date | | |
| 3 | 31 Jan → Feb / Mar dates | | Feb: ____ Mar: ____ |
| 4 | Extra project = its own ₹99/month subscription | | |
| 4b | Slot refused while on trial | | |
| 5a | Slot renews by itself; plan date untouched | | Plan: ____ Slot: ____ |
| 5b | Cancelling a slot leaves the plan active | | |
| 5c | Failed slot payment: pending no change, halted lapses | | |
| 5d | Cancel plan stops every slot mandate | | |
| 5e | Delete workspace stops every mandate | | |
| 6 | Cancel stops the money at Razorpay | | |
| 7 | pending ≠ past_due; halted = past_due | | |
| 8 | GST creates a new plan | | |

---

## If something fails

Most failures here are webhook delivery, not logic. Check in this order:

1. **Razorpay → Webhooks → delivery log.** Non-200 means it reached us and was
   rejected — usually a signing-secret mismatch.
2. **Function logs** for `razorpayWebhook` in the Firebase console.
3. **The org document.** `subscriptionStatus` and `currentPeriodEnd` are written
   only by the webhook, so if they are stale, nothing arrived.

Bring me the delivery log entry and the org doc and I can tell you which side
is wrong.

---

## What this does not cover

- **Metered per-project billing.** Not built, and not a simple omission --
  see below.
- **Live mode.** Test-mode mandates do not prove live e-mandate works; that
  needs one real subscription at ₹1, cancelled afterwards.
- **UPI AutoPay vs cards.** They have different mandate limits and approval
  flows. Test whichever your customers will actually use.

---

## Why extra projects are a separate subscription

The obvious design is to put the project count into the subscription's
`quantity`, so Starter at ₹99 a project charges ₹297 for three and collects
itself. It was built, and then removed, for one reason:

> **"You can only update a Subscription authorised using cards and not via UPI
> and Emandate."** — Razorpay FAQ. The update endpoint returns `400` for UPI:
> *"subscriptions cannot be updated when payment mode is UPI."*

Quantity updates work **only for card-authorised subscriptions**. For a ₹99
subscription in India, UPI AutoPay is likely the common choice, so metering
would have worked for a minority of customers and silently failed for the rest
-- their project created, their bill never raised.

So the plan's subscription is never updated. Instead each purchase of extra
projects CREATES a new subscription with its quantity fixed at creation --
creating has no UPI restriction, only updating does. It renews by itself, works
the same for cards and UPI, and can be cancelled on its own without touching
the plan. The cost is more than one mandate per customer and two renewal dates
(Test 5). Slots bought before this change were one-off 30-day purchases; they
are still honoured until they expire.

**If this is revisited**, the thing to check first is whether Razorpay has since
allowed updates on UPI AutoPay mandates. The restriction is theirs, not ours,
and it is the only reason this design was dropped.
