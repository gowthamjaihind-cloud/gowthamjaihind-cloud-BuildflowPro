/**
 * The walkthrough film. Narration, and the beats it is spoken over.
 *
 * A DIFFERENT JOB TO THE LAUNCH FILM. The launch film argues; this one
 * explains, to somebody who has already decided to look. So it is longer,
 * calmer, and it does not sell -- it shows the product actually running and
 * says what is happening. Every frame is the real app being clicked, not a
 * still: that is the whole reason this film exists alongside the other one.
 *
 * The order is a JOB'S ORDER, not the menu's. Plan it, price it, run the day,
 * buy the material, pay the people, watch the money, bill the client, keep the
 * paperwork. A tour that goes down the sidebar teaches the sidebar; a tour that
 * follows the work teaches the work. Where the two disagree, the work wins --
 * which is why Client Estimates comes near the end here and Consumption History
 * sits next to Inventory rather than where the nav puts it.
 *
 * `vo` is the narration. `hold` is dead air after it, in seconds.
 *
 * Beat length is max(what the on-screen action needs, what the line takes to
 * say) -- measured, both of them. The recorder pads a beat whose narration runs
 * longer than its clicks, so the two can never drift; before this, the
 * narration was a text file handed to whoever recorded audio, and the timings
 * were a hope.
 *
 * Figures spoken here must match what the screens show. Beat 4 already drifted
 * once in the old script -- it read ₹6.4L while the cost screen showed ₹53.7L,
 * because the demo dataset grew after the words were written.
 */
export const WALKTHROUGH = {
  id: "walkthrough",
  /** A touch slower than the launch film: this one is being followed, not felt. */
  length: 1.07,
  beats: [
    {
      id: "portfolio",
      vo: "This is Sitetru. Every job you have running, and what stage each one is at, on one screen.",
      hold: 0.6,
      nav: null,
    },
    {
      id: "open",
      vo: "Open one, and everything about it is in the same place.",
      hold: 0.5,
      nav: "open-project",
    },
    {
      id: "dashboard",
      vo: "The dashboard is the answer to how's it going. Forty-three percent built. Fifty percent of the budget used. Fifty-four lakh still uncommitted, and one task that wants looking at.",
      hold: 0.7,
      nav: "Dashboard",
    },
    {
      id: "wbs",
      vo: "It starts with the work breakdown. You split the job the way you'd write it on paper — substructure, ground floor, first floor — and each piece carries its own dates, quantities and budget. You do this once.",
      hold: 0.8,
      nav: "WBS",
      scroll: 380,
    },
    {
      id: "logs",
      vo: "Then the site starts reporting. A daily log is progress, headcount, material used and a photo, filed against the task it belongs to — so the plan and what actually happened stay attached to each other.",
      hold: 0.8,
      nav: "Daily Logs",
      scroll: 300,
    },
    {
      id: "telegram",
      // Telegram is the one part of the product that is not in the browser, and
      // a project has no Telegram screen to navigate to -- it lives in
      // Settings, reachable only from the portfolio. So this beat cuts to the
      // bot itself, composited over exactly the window the beat occupied.
      cutTo: "telegram-beat-full.png",
      vo: "And this is where it comes from. Your engineer doesn't get an app. He gets a Telegram chat, on the phone already in his pocket. He taps what he's logging, types a number, and it's filed. Nothing to install on site. Nobody to train.",
      hold: 0.9,
      nav: null,
    },
    {
      id: "labour",
      vo: "Labour is the same idea from the other end. Rate cards per role, headcount from the logs, and what you owe each contractor worked out for you.",
      hold: 0.7,
      nav: "Labour & Billing",
      scroll: 300,
    },
    {
      id: "inventory",
      vo: "Material is tracked as stock on the job, not as receipts in a drawer. What came in, what's been issued, and what's running low.",
      hold: 0.7,
      nav: "Inventory",
      scroll: 300,
    },
    {
      id: "procurement",
      vo: "Buying it works the way you already buy. Raise a purchase order against the job. Receive it when the lorry arrives — part loads included. Stock, the supplier's ledger and the order's own status all move on that one entry.",
      hold: 0.8,
      nav: "Procurement",
      scroll: 340,
    },
    {
      id: "cost",
      vo: "Which is what makes this screen worth anything. Budget against actual, on every head, for every task — built from the logs and the receipts rather than typed in afterwards. A gap shows up the day it opens.",
      hold: 0.8,
      nav: "Cost Management",
      scroll: 360,
    },
    {
      id: "insights",
      vo: "And if you'd rather be told than go looking: insights reads the costs, the schedule and the logs, and says plainly what needs attention.",
      hold: 0.8,
      nav: "Project Insights",
      scroll: 260,
    },
    {
      id: "estimates",
      vo: "Client side, you bill from the same breakdown. Contract value, cost to date, margin, G S T — and a running account bill you can send.",
      hold: 0.7,
      nav: "Client Estimates",
    },
    {
      id: "vault",
      vo: "Drawings, approvals and invoices sit with the job, so the file you need on site is on your phone rather than in the office.",
      hold: 0.7,
      nav: "Document Vault",
    },
    {
      id: "close",
      vo: "That's Sitetru. One place, fed from site, in English or Tamil. Free to start, nine hundred and ninety nine rupees a month after that. Sitetru dot com.",
      hold: 2.0,
      nav: "Dashboard",
    },
  ],
};

export default WALKTHROUGH;
