# Billing test plan — Razorpay test mode

Everything in `rzpSubscription.ts` is unit-tested and the callables run against
the Firebase emulator, but **no part of this has ever talked to Razorpay**.
Mandates, webhooks, quantity changes and renewal dates are their behaviour, not
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
payment.captured          (already used by one-off slot purchases)
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
| `billedQuantity` | `1` |

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

## 4. Adding a project — the one-off slot path

Extra projects are **not** part of the subscription. They are bought one at a
time for ₹99 and expire 30 days from purchase. This is the same on Starter and
on Business, deliberately — see "Why extra projects are not metered" below.

**Do:** on the Starter workspace, add a second project.

**Expect:** the add-capacity modal, a one-off ₹99 payment, and the project
created once it succeeds.

**Check:** `purchasedSlots` becomes `1` and `slotsExpireAt` is about 30 days
out. The **subscription is untouched** — still quantity 1, still ₹99 a month,
in Razorpay.

> Note the consequence, because customers will hit it: the plan fee renews on
> its own date and the slot expires on a different one. Two dates, and only one
> of them collects itself.

## 5. Two clocks — confirm it, so you can explain it

**Do:** note both dates for that workspace.

- Subscription renews: `________` (from `currentPeriodEnd`)
- Slot expires: `________` (from `slotsExpireAt`)

They will not match unless you bought the slot on your renewal day. That is
the known cost of keeping billing identical across plans; see below.

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
| 4 | Extra project = one-off ₹99 slot | | |
| 5 | Two separate dates, noted | | Renews: ____ Slot: ____ |
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

## Why extra projects are not metered

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

The alternative was a hybrid: metered for cards, slots for UPI. That was
rejected deliberately. Two customers on the same plan would get different
experiences depending on how they happened to pay, and neither they nor support
could tell which they were on without checking Razorpay.

So extra projects are one-off purchases for everyone, on both plans. The cost
is the two dates in Test 5. The benefit is that billing behaves identically for
every customer and every payment method.

**If this is revisited**, the thing to check first is whether Razorpay has since
allowed updates on UPI AutoPay mandates. The restriction is theirs, not ours,
and it is the only reason this design was dropped.
