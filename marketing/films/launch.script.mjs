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
 *
 * The holds are SHORT through the middle now. They were written when each beat
 * was one continuous shot and the hold was the only thing giving the picture
 * room to breathe; the chain beats carry two or three cuts each, so the same
 * pause reads as the film stopping to wait. They stay long in exactly three
 * places -- after the opening question, after the thesis, and on the mark --
 * where the silence is the point.
 */
export const LAUNCH = {
  id: "launch",
  /**
   * Kokoro reads at a natural pace at 1.0, so nothing is stretched here.
   * This was 1.04 to slow Piper down, which was papering over a voice that
   * read like a form rather than a person.
   */
  speed: 1.0,
  /**
   * The tempo the PICTURE is cut to, not just the music. At 30fps a 100 BPM
   * beat is exactly 18 frames and a bar is 72, so every cut can land on the
   * grid without rounding. The score is rendered at the same number, which is
   * the whole point: cuts that land on the music read as driven, and cuts a
   * frame either side of it read as merely quick.
   */
  bpm: 100,
  beats: [
    {
      id: "open",
      shot: "cold-open",
      vo: "It's six in the evening. Do you know what happened on your site today?",
      hold: 0.9,
    },
    {
      id: "honest",
      shot: "cold-open-2",
      vo: "Most days you find out by calling. A photo on WhatsApp. A number in somebody's notebook.",
      hold: 0.3,
    },
    {
      id: "money",
      shot: "cold-open-3",
      vo: "And where the money went, you find out next month.",
      hold: 1.0,
    },
    {
      id: "title",
      shot: "title",
      vo: "This is Sitetru.",
      hold: 1.1,
    },
    {
      id: "mechanism",
      shot: "mechanism",
      vo: "It doesn't start in your office. It starts on your site engineer's phone.",
      hold: 0.3,
    },
    {
      id: "telegram",
      shot: "telegram",
      vo: "He already has Telegram. He taps what he's logging — progress, labour, material — and sends it. Nothing to install. Nobody to train.",
      hold: 0.3,
    },
    {
      id: "lands",
      shot: "logs",
      vo: "It arrives as today's log, against the task it belongs to.",
      hold: 0.3,
    },
    {
      id: "chain-1",
      shot: "wbs",
      vo: "And then it moves. The task advances. The phase timeline moves with it.",
      hold: 0.3,
    },
    {
      id: "chain-2",
      shot: "inventory",
      vo: "The material comes out of stock.",
      hold: 0.3,
    },
    {
      id: "chain-3",
      shot: "procurement",
      vo: "The order it was bought on is reconciled, and the supplier's account with it.",
      hold: 0.3,
    },
    {
      id: "chain-4",
      shot: "cost",
      vo: "The cost lands against the budget for that task. Not the project. The task.",
      hold: 0.3,
    },
    {
      id: "variance",
      shot: "insights",
      vo: "Which is why the variance on this screen is today's, and not last month's.",
      hold: 0.3,
    },
    {
      id: "client",
      shot: "estimates",
      vo: "Bill your client off the same breakdown you already built. No re-typing, and no second version of the truth.",
      hold: 0.3,
    },
    {
      id: "scale",
      shot: "portfolio",
      vo: "One job, or all of them.",
      hold: 0.3,
    },
    {
      id: "thesis",
      shot: "thesis",
      vo: "A building site doesn't stop for paperwork. So the paperwork has to keep up with the site.",
      hold: 1.3,
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
