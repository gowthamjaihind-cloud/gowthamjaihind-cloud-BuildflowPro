/**
 * The launch film. Script, and the timeline that follows from it.
 *
 * ANGLE. Every construction tool sells "manage your projects", which is a
 * category, not a reason. The reason this product exists is narrower and much
 * easier to feel: a contractor spends his evenings finding out what happened
 * today, and finds out where the money went a month after it went. So the film
 * opens on that evening, names the one mechanism that fixes it -- the site
 * engineer's own phone, over Telegram, an app he already has -- and then spends
 * its middle on the thing a spreadsheet can never do: showing a single log
 * from site travelling through the plan, the stock, the purchase order, the
 * cost and the client bill. That chain IS the product. The features are just
 * where it surfaces.
 *
 * It closes without a single superlative, because the audience is people who
 * are sold to badly and often.
 *
 * SHAPE. Question -> honest answer -> name -> mechanism -> proof -> the chain
 * -> the money -> scale -> the line the film was built to earn -> the mark.
 *
 * Nothing in here asserts a number the product does not show. The figures are
 * read off the captured screens (₹53.7L spent against ₹1.08Cr, 43% built, one
 * task at risk) and the price is the Starter tier in src/lib/plans.ts. On-screen
 * figures drifting away from the script has bitten this pipeline before.
 *
 * `hold` is dead air AFTER the line, in seconds -- room for the picture to
 * land before the next line starts. Beat length is the measured length of the
 * synthesised line plus its hold, so a rewrite retimes the film instead of
 * drifting out of sync with it.
 */
export const LAUNCH = {
  id: "launch",
  /** Slightly under natural pace: this is a film, not an announcement. */
  length: 1.04,
  beats: [
    {
      id: "open",
      shot: "cold-open",
      vo: "It's six in the evening. Do you know what happened on your site today?",
      hold: 1.1,
    },
    {
      id: "honest",
      shot: "cold-open-2",
      vo: "Most days you find out by calling. A photo on WhatsApp. A number in somebody's notebook.",
      hold: 0.7,
    },
    {
      id: "money",
      shot: "cold-open-3",
      vo: "And where the money went, you find out next month.",
      hold: 1.3,
    },
    {
      id: "title",
      shot: "title",
      vo: "This is Sitetru.",
      hold: 1.5,
    },
    {
      id: "mechanism",
      shot: "mechanism",
      vo: "It doesn't start in your office. It starts on your site engineer's phone.",
      hold: 0.8,
    },
    {
      id: "telegram",
      shot: "telegram",
      vo: "He already has Telegram. He taps what he's logging — progress, labour, material — and sends it. Nothing to install. Nobody to train.",
      hold: 0.9,
    },
    {
      id: "lands",
      shot: "logs",
      vo: "It arrives as today's log, against the task it belongs to.",
      hold: 0.8,
    },
    {
      id: "chain-1",
      shot: "wbs",
      vo: "And then it moves. The task advances. The phase timeline moves with it.",
      hold: 0.7,
    },
    {
      id: "chain-2",
      shot: "inventory",
      vo: "The material comes out of stock.",
      hold: 0.5,
    },
    {
      id: "chain-3",
      shot: "procurement",
      vo: "The order it was bought on is reconciled, and the supplier's account with it.",
      hold: 0.7,
    },
    {
      id: "chain-4",
      shot: "cost",
      vo: "The cost lands against the budget for that task. Not the project. The task.",
      hold: 1.0,
    },
    {
      id: "variance",
      shot: "insights",
      vo: "Which is why the variance on this screen is today's, and not last month's.",
      hold: 1.0,
    },
    {
      id: "client",
      shot: "estimates",
      vo: "Bill your client off the same breakdown you already built. No re-typing, and no second version of the truth.",
      hold: 0.8,
    },
    {
      id: "scale",
      shot: "portfolio",
      vo: "One job, or all of them.",
      hold: 1.0,
    },
    {
      id: "thesis",
      shot: "thesis",
      vo: "A building site doesn't stop for paperwork. So the paperwork has to keep up with the site.",
      hold: 1.4,
    },
    {
      id: "end",
      shot: "end",
      vo: "Sitetru. Free to start, nine hundred and ninety nine rupees a month. Sitetru dot com.",
      hold: 2.2,
    },
  ],
};

export default LAUNCH;
