import { useState } from "react";
import { callCreateRazorpayOrder, callCreateSlotOrder, callVerifyRazorpayPayment } from "../services/firebaseFunctions";
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
        theme: { color: "#D97D54" },
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

  // Buy N extra project slots (₹99 each) for a paid org. Payment raises the cap.
  const paySlots = async (quantity: number, onSuccess?: () => void, orgId?: string) => {
    setBusy(true);
    setError(null);
    try {
      const order = await callCreateSlotOrder({ quantity, orgId });
      await runCheckout(
        order,
        `${quantity} extra project slot${quantity === 1 ? "" : "s"}`,
        onSuccess,
      );
    } catch (e: any) {
      setError(e?.message || "Payment failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return { pay, paySlots, busy, error };
}
