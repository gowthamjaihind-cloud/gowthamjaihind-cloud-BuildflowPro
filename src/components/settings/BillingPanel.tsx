import React, { useEffect, useState } from "react";
import { ArrowSquareOut, DownloadSimple, ArrowsClockwise } from "@phosphor-icons/react";
import { useAuthStore } from "../../store";
import { PLANS, PlanId, billableProjectCount, projectCapState } from "../../lib/plans";
import { useTaxRate, gstNote } from "../../hooks/useTaxRate";
import { ManagePlanModal } from "../ManagePlanModal";
import { callGetBillingHistory, type BillingHistory, type BillingPayment } from "../../services/firebaseFunctions";
import { useProjectBilling, fmtBillDate } from "./useProjectBilling";

/**
 * Settings → Projects & Billing.
 *
 * One place that answers, without any arithmetic by the reader: what plan am I
 * on, what will I be charged next and when, how is each project paid for and
 * what is about to happen to it, and what have I already paid (with receipts).
 *
 * Before this the same facts were spread over a one-line summary, a "billing
 * history" that listed only the old one-off orders, and a count of "extra
 * projects" that named no project.
 */

const rupee = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const Chip: React.FC<{ tone: "ok" | "warn" | "bad" | "muted"; children: React.ReactNode }> = ({ tone, children }) => {
  const cls =
    tone === "ok" ? "bg-success/15 text-success"
    : tone === "warn" ? "bg-warning/15 text-warning"
    : tone === "bad" ? "bg-danger/10 text-danger"
    : "bg-panel text-ink-muted border border-divider";
  return <span className={`inline-block text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full ${cls}`}>{children}</span>;
};

const Section: React.FC<{ title: string; hint?: string; children: React.ReactNode; action?: React.ReactNode }> = ({ title, hint, children, action }) => (
  <section className="soft-card p-6 squircle-24">
    <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
      <div>
        <h3 className="text-lg font-bold text-ink">{title}</h3>
        {hint && <p className="text-sm text-ink-muted mt-0.5">{hint}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>
);

/** A label/value pair that stacks on a phone and sits in a grid on a desktop. */
const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <p className="text-[10px] font-black uppercase tracking-widest text-ink-muted">{label}</p>
    <div className="text-sm text-ink mt-0.5">{children}</div>
  </div>
);

export const BillingPanel: React.FC = () => {
  const b = useProjectBilling();
  const { plan, projects, isOwnerAdmin, rows, unusedSubs, pending } = b;
  const orgId = useAuthStore((s) => s.user?.currentOrgId);
  const taxRatePct = useTaxRate();
  const [showManage, setShowManage] = useState(false);
  const [history, setHistory] = useState<BillingHistory | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyErr, setHistoryErr] = useState<string | null>(null);

  const loadHistory = async () => {
    setHistoryBusy(true);
    setHistoryErr(null);
    try {
      const h = await callGetBillingHistory();
      // Newest first, whatever order the server sent.
      setHistory({ ...h, payments: [...(h.payments || [])].sort((x, y) => (y.paidAt || 0) - (x.paidAt || 0)), subscriptions: h.subscriptions || [] });
    } catch (e: any) {
      setHistoryErr(e?.message || "Couldn't load your payments. Please try again.");
    } finally {
      setHistoryBusy(false);
    }
  };
  useEffect(() => {
    if (isOwnerAdmin && orgId) loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwnerAdmin, orgId]);

  if (plan.loading) return null;
  if (plan.unavailable) {
    return (
      <Section title="Projects & Billing">
        <p className="text-sm text-ink-muted">{"We couldn't load your plan just now. This page will fill in by itself once the connection is back."}</p>
      </Section>
    );
  }

  const def = plan.plan ? PLANS[plan.plan as PlanId] : undefined;
  const planName = def?.name || plan.plan || "No plan";
  const status = plan.subscriptionStatus;
  const cap = projectCapState(plan, billableProjectCount(projects));
  // What Razorpay holds for the plan's own subscription, when it has been loaded.
  const planSub = history?.subscriptions.find((s) => s.kind === "plan" && ["active", "authenticated", "pending", "halted"].includes(s.status));
  const period: "monthly" | "annual" = planSub?.period === "annual" ? "annual" : "monthly";
  const planPrice = def ? (period === "annual" ? def.annual : def.monthly) : null;
  const trialDays = status === "trialing" && plan.trialEndsAt ? Math.max(0, Math.ceil((plan.trialEndsAt - Date.now()) / 86400000)) : null;
  const pendingDef = pending ? PLANS[pending.plan as PlanId] : undefined;

  const statusChip =
    !status ? <Chip tone="muted">{"No billing"}</Chip>
    : status === "trialing" ? <Chip tone="warn">{trialDays !== null ? `Free trial · ${trialDays} day${trialDays === 1 ? "" : "s"} left` : "Free trial"}</Chip>
    : status === "active" ? (plan.cancelAtPeriodEnd ? <Chip tone="warn">{"Cancelled · ends soon"}</Chip> : <Chip tone="ok">{"Active"}</Chip>)
    : status === "past_due" ? <Chip tone="bad">{"Payment overdue"}</Chip>
    : status === "internal" || status === "free" ? <Chip tone="muted">{"Not billed"}</Chip>
    : <Chip tone="bad">{"Ended"}</Chip>;

  // ---- Upcoming payments ---------------------------------------------------
  type Due = { key: string; what: string; when: number | null; amount: number | null; note?: string };
  const dues: Due[] = [];
  if (status === "active" && !plan.cancelAtPeriodEnd && def) {
    const when = planSub?.nextChargeAt || plan.currentPeriodEnd || null;
    const switching = pending && pendingDef && when && pending.effectiveAt <= when + 86400000;
    dues.push({
      key: "plan",
      what: switching ? `${pendingDef!.name} plan (after your scheduled switch from ${planName})` : `${planName} plan · ${period === "annual" ? "yearly" : "monthly"}`,
      when,
      amount: switching ? pendingDef!.monthly : planPrice,
    });
  }
  for (const { p, sub } of rows) {
    if (!sub || p.billingLocked) continue;
    if (sub.status === "active") dues.push({ key: `p-${p.id}`, what: `${p.name} · extra project`, when: sub.until, amount: plan.overageRate });
    if (sub.status === "halted") dues.push({ key: `p-${p.id}`, what: `${p.name} · extra project`, when: sub.until, amount: plan.overageRate, note: "last payment failed; your bank will be asked again" });
  }
  for (const s of unusedSubs) {
    if (s.status !== "active") continue;
    const spare = s.qty - s.projectIds.length;
    dues.push({ key: `u-${s.id}`, what: `Extra-project subscription not in use (${spare})`, when: s.until, amount: spare * plan.overageRate, note: "not paying for any project; you can cancel it below" });
  }
  dues.sort((a, c) => (a.when || 0) - (c.when || 0));
  const monthlyTotal = dues.reduce((n, d) => n + (d.key === "plan" && period === "annual" ? 0 : d.amount || 0), 0);

  // ---- Projects ------------------------------------------------------------
  const inPlan = rows.filter((r) => !r.sub && !r.p.billingLocked).length;
  const onSub = rows.filter((r) => r.sub && !r.p.billingLocked).length;
  const locked = rows.filter((r) => r.p.billingLocked).length;

  // ---- Payments ------------------------------------------------------------
  const describe = (pay: BillingPayment) => {
    if (pay.kind === "plan") return `${PLANS[pay.plan as PlanId]?.name ?? pay.plan ?? "Plan"} plan${pay.period === "annual" ? " · yearly" : pay.period === "monthly" ? " · monthly" : ""}`;
    const names = pay.projectIds.map(b.projectName).join(", ");
    const n = pay.quantity ?? 1;
    return names ? `Extra project: ${names}` : `${n} extra project${n === 1 ? "" : "s"}`;
  };
  const covered = (pay: BillingPayment) =>
    pay.periodStart && pay.periodEnd ? `${fmtBillDate(pay.periodStart)} to ${fmtBillDate(pay.periodEnd)}` : pay.source === "order" && pay.kind === "slots" ? "30 days from payment" : "";
  const downloadCsv = () => {
    if (!history) return;
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      ["Date", "What for", "Period covered", "Amount (INR)", "Tax included (INR)", "Payment ID", "Receipt"].map(esc).join(","),
      ...history.payments.map((p) => [fmtBillDate(p.paidAt), describe(p), covered(p), p.amount, p.tax ?? "", p.paymentId ?? p.id, p.receiptUrl ?? ""].map(esc).join(",")),
    ];
    const url = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "sitetru-payments.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const smallBtn = "font-bold text-xs px-3 py-1.5 rounded-lg apple-transition disabled:opacity-50";

  return (
    <div className="space-y-6">
      {/* 1. The plan */}
      <Section
        title="Your plan"
        hint="What you are subscribed to and what it includes."
        action={isOwnerAdmin && def && def.monthly !== null ? (
          <button onClick={() => setShowManage(true)} className={`${smallBtn} bg-surface-dark text-white hover:opacity-90`}>{"Change plan"}</button>
        ) : undefined}
      >
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <p className="text-2xl font-bold text-ink">{planName}</p>
          {statusChip}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Fact label="Price">
            {planPrice !== null && planPrice !== undefined
              ? <>{rupee(planPrice)} <span className="text-ink-muted">{period === "annual" ? "per year" : "per month"}</span></>
              : "Custom"}
          </Fact>
          <Fact label="Includes">
            {def
              ? `${def.includedProjects ?? "Unlimited"} project${def.includedProjects === 1 ? "" : "s"} · ${def.userLimit ?? "unlimited"} users${def.aiQuota ? ` · ${def.aiQuota} AI scans a month` : ""}`
              : "—"}
          </Fact>
          <Fact label="Projects in use">
            {billableProjectCount(projects)}
            {cap.capped && cap.included !== null ? ` of ${cap.included}` : ""}
            {locked > 0 ? <span className="text-ink-muted">{` · ${locked} read-only, not counted`}</span> : null}
          </Fact>
          <Fact label={status === "trialing" ? "Trial ends" : plan.cancelAtPeriodEnd ? "Plan ends" : "Paid until"}>
            {status === "trialing"
              ? (fmtBillDate(plan.trialEndsAt) || "—")
              : (fmtBillDate(plan.currentPeriodEnd) || "—")}
          </Fact>
        </div>
        {status === "trialing" && (
          <p className="text-sm text-ink mt-4 p-3 rounded-xl bg-warning/8 border border-warning/30">
            {"No payment has been taken yet. Subscribe before the trial ends to keep working; use Change plan above."}
          </p>
        )}
        {plan.cancelAtPeriodEnd && (
          <p className="text-sm text-ink mt-4 p-3 rounded-xl bg-warning/8 border border-warning/30">
            {`You cancelled this plan. No further plan payment will be taken. Everything keeps working until ${fmtBillDate(plan.currentPeriodEnd) || "the end of the paid period"}, and nothing is deleted afterwards. To undo this, use "Keep my plan" at the top of this page.`}
          </p>
        )}
        {pending && (
          <p className="text-sm text-ink mt-4 p-3 rounded-xl bg-primary/5 border border-primary/30">
            {`Scheduled: your plan switches to ${pendingDef?.name ?? pending.plan} on ${fmtBillDate(pending.effectiveAt)}. ${pendingDef?.name ?? "That plan"} includes ${pendingDef?.includedProjects ?? "unlimited"} project${pendingDef?.includedProjects === 1 ? "" : "s"}; the projects marked below will become read-only on that date.`}
          </p>
        )}
        {status === "past_due" && (
          <p className="text-sm text-danger mt-4 p-3 rounded-xl bg-danger/8 border border-danger/30">
            {"Your last plan payment did not go through. Please renew to avoid losing access."}
          </p>
        )}
      </Section>

      {/* 2. What is due next */}
      {isOwnerAdmin && (
        <Section title="Upcoming payments" hint="Every automatic payment that is due next, in date order.">
          {dues.length === 0 ? (
            <p className="text-sm text-ink-muted">
              {status === "trialing" ? "Nothing is due: you are on a free trial." : "No automatic payments are scheduled."}
            </p>
          ) : (
            <div className="divide-y divide-divider">
              {dues.map((d) => (
                <div key={d.key} className="py-2.5 flex items-baseline justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm text-ink font-semibold">{d.what}</p>
                    <p className="text-xs text-ink-muted">
                      {d.when ? `Due ${fmtBillDate(d.when)}` : "Date not available"}
                      {d.note ? ` · ${d.note}` : ""}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-ink">{d.amount !== null ? rupee(d.amount) : "—"}</p>
                </div>
              ))}
              <div className="pt-3 flex items-baseline justify-between gap-3">
                <p className="text-sm font-bold text-ink">{period === "annual" ? "Total each month (yearly plan billed separately)" : "Total each month"}</p>
                <p className="text-base font-bold text-ink">{rupee(monthlyTotal)}</p>
              </div>
            </div>
          )}
          <p className="text-[11px] text-ink-muted mt-3">
            {`Each payment is collected automatically by Razorpay from the payment method you approved.${gstNote(taxRatePct)}`}
          </p>
        </Section>
      )}

      {/* 3. Every project */}
      <Section
        title="Your projects"
        hint={`${projects.length} project${projects.length === 1 ? "" : "s"}: ${inPlan} included in your plan, ${onSub} on ${onSub === 1 ? "its" : "their"} own subscription, ${locked} read-only.`}
      >
        {b.cancelErr && <p className="text-sm text-danger mb-3">{b.cancelErr}</p>}
        {rows.length === 0 ? (
          <p className="text-sm text-ink-muted">{"You have no projects yet."}</p>
        ) : (
          <div className="divide-y divide-divider">
            {rows.map(({ p, sub, willLock }) => {
              const ending = !!sub && (sub.status === "cancelling" || sub.status === "cancelled");
              return (
                <div key={p.id} className="py-3 flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-ink">{p.name}</p>
                      {p.billingLocked ? <Chip tone="bad">{"Read-only"}</Chip>
                        : ending || willLock ? <Chip tone="warn">{"Ending"}</Chip>
                        : sub?.status === "halted" ? <Chip tone="bad">{"Payment failed"}</Chip>
                        : <Chip tone="ok">{"Open"}</Chip>}
                    </div>
                    <p className="text-xs text-ink-muted mt-1">
                      {p.billingLocked
                        ? "Its subscription has ended. Everyone can still open and export it; nothing can be changed. Nothing is deleted."
                        : sub
                          ? ending
                            ? `Own subscription, ${rupee(plan.overageRate)} a month · cancelled · usable until ${fmtBillDate(sub.until)}, then read-only`
                            : sub.status === "halted"
                              ? `Own subscription, ${rupee(plan.overageRate)} a month · payment failed · read-only after ${fmtBillDate(sub.until)} unless it is paid`
                              : `Own subscription, ${rupee(plan.overageRate)} a month · renews ${fmtBillDate(sub.until)}`
                          : willLock
                            ? `Included in your ${planName} plan, no separate charge · becomes read-only on ${fmtBillDate(pending?.effectiveAt)} when you switch to ${pendingDef?.name ?? pending?.plan}`
                            : `Included in your ${planName} plan, no separate charge`}
                    </p>
                  </div>
                  {isOwnerAdmin && p.billingLocked && (
                    <button onClick={() => b.resubscribe(p.id)} disabled={b.payBusy} className={`${smallBtn} bg-primary/10 text-primary hover:bg-primary/15`}>
                      {`Subscribe again · ${rupee(plan.overageRate)} / month`}
                    </button>
                  )}
                  {isOwnerAdmin && !p.billingLocked && sub && !ending && (
                    <button onClick={() => b.cancelSlots(sub)} disabled={b.slotBusy === sub.id} className={`${smallBtn} text-ink-muted hover:text-danger border border-divider`}>
                      {b.slotBusy === sub.id ? "Cancelling…" : "Cancel subscription"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {b.payError && <p className="text-sm text-danger mt-3">{b.payError}</p>}

        {unusedSubs.length > 0 && (
          <div className="mt-5 pt-4 border-t border-divider">
            <p className="text-sm font-bold text-ink">{"Extra-project subscriptions not in use"}</p>
            <p className="text-xs text-ink-muted mb-2">{"These are not paying for any project. If your plan has room for your projects, you can cancel them."}</p>
            <div className="divide-y divide-divider">
              {unusedSubs.map((s) => {
                const ending = s.status === "cancelling" || s.status === "cancelled";
                const spare = s.qty - s.projectIds.length;
                return (
                  <div key={s.id} className="py-2.5 flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-xs text-ink">
                      {`${spare} unused · ${rupee(spare * plan.overageRate)} a month · `}
                      {ending
                        ? s.autoCancelled
                          ? `stopped automatically because your plan has room · no more payments after ${fmtBillDate(s.until)}`
                          : `cancelled · no more payments after ${fmtBillDate(s.until)}`
                        : s.status === "halted"
                          ? `payment failed · ends ${fmtBillDate(s.until)}`
                          : `renews ${fmtBillDate(s.until)}`}
                    </p>
                    {isOwnerAdmin && !ending && (
                      <button onClick={() => b.cancelSlots(s)} disabled={b.slotBusy === s.id} className={`${smallBtn} text-ink-muted hover:text-danger border border-divider`}>
                        {b.slotBusy === s.id ? "Cancelling…" : "Cancel subscription"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Section>

      {/* 4. What has been paid */}
      <Section
        title="Payments and receipts"
        hint="Every payment taken for this workspace, newest first."
        action={isOwnerAdmin ? (
          <div className="flex items-center gap-2">
            <button onClick={loadHistory} disabled={historyBusy} className={`${smallBtn} border border-divider text-ink hover:bg-surface inline-flex items-center gap-1.5`}>
              <ArrowsClockwise className="w-3.5 h-3.5" /> {historyBusy ? "Loading…" : "Refresh"}
            </button>
            {history && history.payments.length > 0 && (
              <button onClick={downloadCsv} className={`${smallBtn} border border-divider text-ink hover:bg-surface inline-flex items-center gap-1.5`}>
                <DownloadSimple className="w-3.5 h-3.5" /> {"Download list"}
              </button>
            )}
          </div>
        ) : undefined}
      >
        {!isOwnerAdmin ? (
          <p className="text-sm text-ink-muted">{"Only an Owner or Admin of this organization can see payments."}</p>
        ) : historyErr ? (
          <p className="text-sm text-danger">{historyErr}</p>
        ) : !history ? (
          <p className="text-sm text-ink-muted">{"Loading your payments…"}</p>
        ) : (
          <>
            {!history.complete && (
              <p className="text-sm text-ink mb-3 p-3 rounded-xl bg-warning/8 border border-warning/30">
                {"We could not reach the payment provider for every subscription, so this list may be missing some payments. Press Refresh to try again."}
              </p>
            )}
            {history.payments.length === 0 ? (
              <p className="text-sm text-ink-muted">{"No payments have been taken yet."}</p>
            ) : (
              <div className="divide-y divide-divider">
                {history.payments.map((pay) => (
                  <div key={`${pay.source}-${pay.id}`} className="py-3 flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{describe(pay)}</p>
                      <p className="text-xs text-ink-muted mt-0.5">
                        {`Paid ${fmtBillDate(pay.paidAt) || "—"}`}
                        {covered(pay) ? ` · covers ${covered(pay)}` : ""}
                      </p>
                      <p className="text-[11px] text-ink-muted mt-0.5 font-mono break-all">
                        {`Payment ID: ${pay.paymentId || pay.id}`}
                      </p>
                      {pay.credit ? (
                        <p className="text-[11px] text-ink-muted mt-0.5">{`List price ${rupee(pay.listAmount || 0)}, less ${rupee(pay.credit)} credit for the unused part of your previous plan.`}</p>
                      ) : null}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-ink">{rupee(pay.amount)}</p>
                      {pay.tax ? <p className="text-[11px] text-ink-muted">{`includes ${rupee(pay.tax)} GST`}</p> : null}
                      {pay.receiptUrl ? (
                        <a href={pay.receiptUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:text-primary-deep mt-1">
                          {"View receipt"} <ArrowSquareOut className="w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <p className="text-[11px] text-ink-muted mt-1">{"Receipt sent by email"}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-ink-muted mt-3">
              {`Payments are collected by Razorpay, our payment provider. "View receipt" opens Razorpay's receipt for that payment, which you can print or save. Razorpay also emails a receipt for each payment.${gstNote(taxRatePct)}`}
            </p>
          </>
        )}
      </Section>

      {/* 5. The rules, in one place */}
      <Section title="How billing works">
        <ul className="text-sm text-ink space-y-2 list-disc pl-5">
          <li>{"Your plan is one automatic payment, monthly or yearly. It covers a set number of projects and users."}</li>
          <li>{`Each project beyond what your plan includes is its own subscription of ${rupee(plan.overageRate)} a month, named after that project. It renews by itself on its own date, which can differ from your plan's date.`}</li>
          <li>{"You can cancel one project's subscription without affecting anything else. The project stays fully usable until the end of the month already paid for, then becomes read-only."}</li>
          <li>{"Read-only means everyone can still open and export the project, but nothing can be added or changed. Nothing is ever deleted. Subscribing again re-opens it at once."}</li>
          <li>{"If you move to a smaller plan, your oldest projects stay open up to the new plan's limit. The newer ones become read-only, and each can be re-opened with its own subscription."}</li>
          <li>{"If you move to a bigger plan that has room for your projects, their separate subscriptions are stopped automatically so you are not charged twice."}</li>
          <li>{"If a payment fails, your bank is asked again over the following days. Nothing changes for you during that time."}</li>
        </ul>
      </Section>

      <ManagePlanModal isOpen={showManage} onClose={() => setShowManage(false)} />
    </div>
  );
};

export default BillingPanel;
