/**
 * Translating a Telegram keyboard into what WhatsApp will actually accept.
 *
 * The Telegram bot drives everything from `InlineButton[][]` -- arbitrary grids,
 * any number of rows, any label length. WhatsApp Cloud API has nothing like it.
 * It offers exactly two interactive shapes, both narrow:
 *
 *   reply buttons   at most 3, title at most 20 characters
 *   list            at most 10 rows, row title at most 24 characters
 *
 * So this is where the two channels are reconciled, kept as a pure function
 * with no network in it, because every rule here is a place a message gets
 * silently rejected by Meta with a 400 that says very little.
 *
 * Three things are deliberate:
 *
 * TRUNCATION CAN COLLIDE. Task names in this app routinely share a long prefix
 * -- "Ground floor slab — reinforcement" and "Ground floor slab — shuttering"
 * are both "Ground floor slab —" once cut to 20. Two buttons with the same
 * visible label are not a cosmetic problem: the engineer cannot tell which one
 * logs which task. Labels are disambiguated rather than blindly cut.
 *
 * IDs ARE NEVER TRUNCATED. The label is what the user reads; the id is what the
 * handler switches on. Shortening an id silently routes a tap to the wrong
 * branch, so an over-long id is an error rather than a trim. Telegram caps
 * callback_data at 64 bytes and WhatsApp allows 256, so anything the existing
 * handlers produce already fits.
 *
 * OVERFLOW PAGINATES. More than 10 options cannot be shown at once, and
 * dropping the tail would quietly hide tasks. The last row becomes "More…"
 * carrying a page cursor.
 */

export interface InlineButton {
  text: string;
  callback_data: string;
}

export const BUTTON_MAX = 3;
export const BUTTON_TITLE_MAX = 20;
export const LIST_ROWS_MAX = 10;
export const LIST_TITLE_MAX = 24;
export const ID_MAX = 256;

/** The page cursor "More…" carries, e.g. `wa:page:2`. */
export const MORE_PREFIX = "wa:page:";

export type Interactive =
  | { kind: "text"; body: string }
  | { kind: "buttons"; body: string; buttons: { id: string; title: string }[] }
  | {
      kind: "list";
      body: string;
      button: string;
      rows: { id: string; title: string }[];
    };

/**
 * Cut to `max`, keeping the labels in a set distinguishable from one another.
 *
 * Plain truncation is the obvious implementation and it is wrong here often
 * enough to matter: a WBS list is full of names that differ only at the end. If
 * a cut label would duplicate one already produced, the tail of the original is
 * kept instead of the head, since the tail is where these names differ.
 */
export function fitLabels(labels: string[], max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of labels) {
    const label = raw.trim();
    let fitted = label.length <= max ? label : label.slice(0, max - 1) + "…";
    if (seen.has(fitted) && label.length > max) {
      // Head collided. The distinguishing part of these names is at the end.
      fitted = "…" + label.slice(-(max - 1));
    }
    // Still colliding (genuinely identical labels): number them, so two rows
    // are never indistinguishable to the person tapping one.
    if (seen.has(fitted)) {
      let n = 2;
      const stem = fitted.slice(0, max - 3);
      while (seen.has(`${stem} (${n})`)) n++;
      fitted = `${stem} (${n})`;
    }
    seen.add(fitted);
    out.push(fitted);
  }
  return out;
}

/**
 * Pick the shape WhatsApp will accept for this set of buttons.
 *
 * `page` is 1-based and only consulted when the options overflow a list.
 */
export function toInteractive(
  body: string,
  buttons?: InlineButton[][],
  opts: { listButton?: string; page?: number } = {},
): Interactive {
  const flat = (buttons ?? []).flat().filter((b) => b && b.text != null);

  for (const b of flat) {
    if (b.callback_data.length > ID_MAX) {
      throw new Error(
        `callback_data too long for WhatsApp (${b.callback_data.length} > ${ID_MAX}): ` +
          `${b.callback_data.slice(0, 40)}… — shorten the id, never truncate it`,
      );
    }
  }

  if (flat.length === 0) return { kind: "text", body };

  if (flat.length <= BUTTON_MAX) {
    const titles = fitLabels(flat.map((b) => b.text), BUTTON_TITLE_MAX);
    return {
      kind: "buttons",
      body,
      buttons: flat.map((b, i) => ({ id: b.callback_data, title: titles[i] })),
    };
  }

  // A list. Reserve the last row for "More…" whenever there is an overflow.
  const page = Math.max(1, opts.page ?? 1);
  const perPage = LIST_ROWS_MAX - 1;
  const needsPaging = flat.length > LIST_ROWS_MAX;

  let slice: InlineButton[];
  let more = false;
  if (!needsPaging) {
    slice = flat;
  } else {
    const start = (page - 1) * perPage;
    slice = flat.slice(start, start + perPage);
    more = start + perPage < flat.length;
  }

  const titles = fitLabels(slice.map((b) => b.text), LIST_TITLE_MAX);
  const rows = slice.map((b, i) => ({ id: b.callback_data, title: titles[i] }));
  if (more) rows.push({ id: `${MORE_PREFIX}${page + 1}`, title: "More…" });

  return { kind: "list", body, button: opts.listButton ?? "Choose", rows };
}

/** Build the Cloud API request body for a resolved shape. */
export function toCloudApiPayload(to: string, shape: Interactive): Record<string, unknown> {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to };

  if (shape.kind === "text") {
    return { ...base, type: "text", text: { preview_url: false, body: shape.body } };
  }

  if (shape.kind === "buttons") {
    return {
      ...base,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: shape.body },
        action: {
          buttons: shape.buttons.map((b) => ({
            type: "reply",
            reply: { id: b.id, title: b.title },
          })),
        },
      },
    };
  }

  return {
    ...base,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: shape.body },
      action: {
        button: shape.button,
        sections: [{ title: "Options", rows: shape.rows }],
      },
    },
  };
}
