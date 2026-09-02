import { create } from "zustand";

/**
 * Toasts and confirmations, replacing the browser's alert() and confirm().
 *
 * A native dialog renders in the browser's own chrome ("sitetru.com says…"),
 * blocks the thread, cannot be styled, and on a phone reads as a security
 * warning. This is the same thing in the product's own voice.
 *
 * The API is imperative on purpose. There were 71 call sites, most of them
 * inside async handlers rather than components, so a hook would have meant
 * restructuring all of them. `toast.error(msg)` drops straight in where
 * `alert(msg)` was; `await confirmDialog({...})` replaces `confirm(...)`.
 */

export type ToastKind = "success" | "error" | "info";

export type Toast = {
  id: number;
  kind: ToastKind;
  message: string;
};

export type ConfirmRequest = {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Colours the confirm button as destructive and focuses Cancel instead. */
  destructive?: boolean;
};

type FeedbackState = {
  toasts: Toast[];
  confirm: (ConfirmRequest & { resolve: (ok: boolean) => void }) | null;
  push: (kind: ToastKind, message: string) => void;
  dismiss: (id: number) => void;
  ask: (req: ConfirmRequest) => Promise<boolean>;
  answer: (ok: boolean) => void;
};

let nextId = 1;

/** Errors stay up longer — they are usually the ones worth reading twice. */
const LIFETIME: Record<ToastKind, number> = {
  success: 4000,
  info: 5000,
  error: 8000,
};

export const useFeedback = create<FeedbackState>((set, get) => ({
  toasts: [],
  confirm: null,

  push: (kind, message) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }));
    setTimeout(() => get().dismiss(id), LIFETIME[kind]);
  },

  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  ask: (req) =>
    new Promise<boolean>((resolve) => {
      // A second request while one is open would strand the first promise, so
      // answer it as a cancel before replacing it.
      const open = get().confirm;
      if (open) open.resolve(false);
      set({ confirm: { ...req, resolve } });
    }),

  answer: (ok) => {
    const open = get().confirm;
    set({ confirm: null });
    open?.resolve(ok);
  },
}));

const say = (kind: ToastKind) => (message: unknown) => {
  const text =
    message instanceof Error
      ? message.message
      : typeof message === "string"
        ? message
        : String(message ?? "");
  if (text.trim()) useFeedback.getState().push(kind, text.trim());
};

export const toast = {
  success: say("success"),
  error: say("error"),
  info: say("info"),
};

/** Resolves true if the user confirmed. Replaces `window.confirm`. */
export const confirmDialog = (req: ConfirmRequest): Promise<boolean> =>
  useFeedback.getState().ask(req);
