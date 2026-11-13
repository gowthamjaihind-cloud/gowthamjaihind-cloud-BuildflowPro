import { useState } from "react";
import { callCreateRazorpayOrder, callCreateSlotSubscription, callVerifyRazorpayPayment, callCreateSubscription } from "../services/firebaseFunctions";
import { db, doc, getDocFromServer } from "../firebase";
import { useAuthStore } from "../store";

declare global {
  interface Window {
    Razorpay?: any;
  }
}

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

function loadScript(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve(true);
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

// Drives a Razorpay Checkout: creates a server-priced order, opens the payment
// window, and verifies the result (which auto-activates the plan). The webhook
// is the authoritative activation; this verify is the immediate/backup path.
/** Poll the org until the webhook has recorded this slot subscription's first charge. */
async function waitForSlotSub(orgId: string, subscriptionId: string, timeoutMs = 45000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const snap = await getDocFromServer(doc(db, "organizations", orgId));
      const s = (snap.data() as any)?.slotSubs?.[subscriptionId];
      if (s && Number(s.until) > Date.now()) return true;
    } catch {
      /* keep waiting */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

export function useRazorpayCheckout() {
  const user = useAuthStore((s) => s.user);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Shared checkout runner: given a created order, open the Razorpay window and
  // verify the result (which auto-activates on the server).
  const runCheckout = async (
    order: { orderId: string; amount: number; currency: string; keyId: string },
    description: string,
    onSuccess?: () => void,
  ) => {
    const ok = await loadScript(CHECKOUT_SRC);
    if (!ok || !window.Razorpay) {
      throw new Error("Couldn't load the payment window. Check your connection and try again.");
    }
    await new Promise<void>((resolve, reject) => {
      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "Sitetru",
        description,
        order_id: order.orderId,
        prefill: { email: user?.email || "", name: user?.displayName || "" },
        // Razorpay renders its own iframe, so this cannot be a CSS variable.
        // It must stay equal to --primary in index.css; palette.test.ts checks.
        theme: { color: "#1D4ED8" },
        handler: async (resp: any) => {
          try {
            await callVerifyRazorpayPayment({
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            });
            resolve();
          } catch (e) {
            reject(e);
          }
        },
        modal: { ondismiss: () => reject(new Error("Payment cancelled.")) },
      });
      rzp.open();
    });
    onSuccess?.();
  };

  const pay = async (
    plan: string,
    period: "monthly" | "annual",
    onSuccess?: () => void,
    orgId?: string,
  ) => {
    setBusy(true);
    setError(null);
    try {
      const order = await callCreateRazorpayOrder({ plan, period, orgId });
      await runCheckout(order, `${plan} plan · ${period}`, onSuccess);
    } catch (e: any) {
      setError(e?.message || "Payment failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  /**
   * Start a recurring subscription for the plan fee.
   *
   * Different from `pay` in a way that matters to the customer: checkout here
   * authorises a MANDATE, so the bank asks them to approve future debits, not
   * just this one. Nothing is verified client-side afterwards because nothing
   * can be -- the authorisation payment and every renewal are confirmed by
   * webhook, which is also what moves the org to active. The modal closing is
   * not proof of payment, so the caller refreshes and waits for the server.
   */
  const subscribe = async (
    plan: string,
    period: "monthly" | "annual",
    onSuccess?: () => void,
    orgId?: string,
  ) => {
    setBusy(true);
    setError(null);
    try {
      const sub = await callCreateSubscription({ plan, period, orgId });
      const ok = await loadScript(CHECKOUT_SRC);
      if (!ok || !window.Razorpay) {
        throw new Error("Couldn't load the payment window. Check your connection and try again.");
      }
      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: sub.keyId,
          name: "Sitetru",
          description: `${plan} plan · billed ${period === "annual" ? "yearly" : "monthly"}`,
          // subscription_id, not order_id: this is what puts Razorpay into
          // mandate mode rather than taking a single payment.
          subscription_id: sub.subscriptionId,
          prefill: { email: user?.email || "", name: user?.displayName || "" },
          theme: { color: "#1D4ED8" },
          handler: () => resolve(),
          modal: { ondismiss: () => reject(new Error("Payment cancelled.")) },
        });
        rzp.open();
      });
      onSuccess?.();
    } catch (e: any) {
      setError(e?.message || "We couldn't start your subscription. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // Buy N extra project slots (₹99 each) for a paid org. Payment raises the cap.
  /**
   * Buy extra project slots as a RECURRING subscription (₹99 each a month).
   *
   * Like `subscribe`, checkout authorises a mandate and nothing is verified
   * here: the first charge is confirmed by webhook, which is what raises the
   * project cap. So this WAITS for the cap to rise before calling onSuccess --
   * the caller's next step is usually to create the project, and the database
   * would refuse that until the server has recorded the payment.
   */
  const paySlots = async (quantity: number, onSuccess?: () => void, orgId?: string) => {
    setBusy(true);
    setError(null);
    try {
      const sub = await callCreateSlotSubscription({ quantity, orgId });
      const ok = await loadScript(CHECKOUT_SRC);
      if (!ok || !window.Razorpay) {
        throw new Error("Couldn't load the payment window. Check your connection and try again.");
      }
      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: sub.keyId,
          name: "Sitetru",
          description: `${quantity} extra project${quantity === 1 ? "" : "s"} · billed monthly`,
          subscription_id: sub.subscriptionId,
          prefill: { email: user?.email || "", name: user?.displayName || "" },
          theme: { color: "#1D4ED8" },
          handler: () => resolve(),
          modal: { ondismiss: () => reject(new Error("Payment cancelled.")) },
        });
        rzp.open();
      });
      const target = orgId || user?.currentOrgId;
      const granted = target ? await waitForSlotSub(target, sub.subscriptionId) : false;
      if (!granted) {
        setError("Payment received. Your extra project capacity is being added and will appear within a minute — then try again.");
        return;
      }
      onSuccess?.();
    } catch (e: any) {
      setError(e?.message || "Payment failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return { pay, subscribe, paySlots, busy, error };
}
