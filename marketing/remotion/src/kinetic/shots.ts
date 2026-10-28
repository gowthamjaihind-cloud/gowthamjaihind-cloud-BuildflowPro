import { Focus } from "../theme";
import { BAR, BEAT } from "./grid";

/**
 * The cut, as data.
 *
 * Every `label` here is a string the PRODUCT actually shows -- a sidebar item,
 * a tab, a page title or a panel heading. That is a hard rule rather than a
 * stylistic one: this film is made of real screenshots, and a caption invented
 * for the film sitting over a real screen is the one thing in it that would be
 * a lie. Where a module needed a name, the name was read off the screenshot
 * rather than written. (`m-11` says "Progress Reports", not "Reports"; `m-12`
 * says "Digital Project Vault", not "Vault".)
 *
 * Nothing here claims a price, a customer or a number that is not visible in
 * the frame it is laid over. The figures in the `FIGURES` act are not captions
 * at all -- the crop simply goes close enough to read the product's own number,
 * so there is nothing to keep in sync and nothing that can drift. An earlier
 * film in this repo carried "From Rs999 / month" on its end card for a plan
 * that never charged that, which is exactly the failure this avoids.
 *
 * Crops are a centre point and a width in SOURCE pixels (screens are
 * 3200x2000); height comes from the composition's aspect in Screen.tsx, so a
 * region always fills a 16:9 frame exactly.
 */

/**
 * A note on `cx`, because the obvious value is the wrong one.
 *
 * The app's content area runs from x=739 (right of the sidebar) to x=3160, so
 * centring a crop on it means cx=1950. Every blitz crop was written that way
 * and every one of them was wrong: at a 2100px width that lands the left edge
 * at x=900, which clips the first 160px of the content area -- and the first
 * 160px is where the row labels, the card titles and the first table column
 * live. Sixteen shots came back reading "ample Residence", "abour rates",
 * "k Inventory".
 *
 * So these are LEFT-ANCHORED, not centred: cx = 739 + w/2. What gets lost off
 * the right edge is the actions column, which is the correct thing to lose.
 * The two portfolio shots use 320 instead of 739 -- that screen has no sidebar.
 *
 * The wide holds in HOLDS are the deliberate exception. They are showing the
 * whole screen rather than a part of it, so they stay centred.
 */

export interface Shot {
  src: string;
  from: Focus;
  /** Optional second focus: the shot moves from `from` to `to` across its span. */
  to?: Focus;
  /** A string the product itself displays. Omitted where the picture speaks. */
  label?: string;
  /** Frames. Defaults to the act's own step. */
  span?: number;
}

/** Two beats. The blitz's step -- a cut every 0.8s. */
const QUICK = BEAT * 2;

/**
 * Act 2: the modules, one cut every two beats.
 *
 * Sixteen cuts across eight bars. The order is the order a JOB runs -- plan,
 * log the day, buy, pay, count, cost, bill, file -- rather than the order the
 * sidebar lists, for the reason the walkthrough's README already gives: a tour
 * that goes down the menu teaches the menu.
 */
export const BLITZ: Shot[] = [
  { src: "m-00-portfolio.png", from: { cx: 1470, cy: 620, w: 2300 }, label: "Portfolio" },
  { src: "m-00-portfolio.png", from: { cx: 1520, cy: 1340, w: 2400 }, label: "Every project" },
  { src: "m-01-dashboard.png", from: { cx: 1690, cy: 676, w: 1900 }, label: "Dashboard" },
  { src: "m-01-dashboard.png", from: { cx: 1589, cy: 1520, w: 1700 }, label: "Phase Timeline" },
  { src: "m-02-insights.png", from: { cx: 1790, cy: 860, w: 2100 }, label: "Project Insights" },
  { src: "m-03-wbs.png", from: { cx: 1840, cy: 1250, w: 2200 }, label: "WBS" },
  { src: "m-04-daily-logs.png", from: { cx: 1890, cy: 870, w: 2300 }, label: "Daily Logs" },
  { src: "m-05-labour.png", from: { cx: 1840, cy: 900, w: 2200 }, label: "Labour & Billing" },
  { src: "m-06-inventory.png", from: { cx: 1790, cy: 1060, w: 2100 }, label: "Stock Inventory" },
  { src: "m-07-procurement.png", from: { cx: 1840, cy: 1000, w: 2200 }, label: "Procurement" },
  { src: "m-07-procurement-grn.png", from: { cx: 1840, cy: 900, w: 2200 }, label: "Goods Receipt" },
  { src: "m-08-consumption.png", from: { cx: 1790, cy: 1010, w: 2100 }, label: "Consumption History" },
  { src: "m-09-cost-management-tasks.png", from: { cx: 1890, cy: 1150, w: 2300 }, label: "Task Costs" },
  { src: "m-09-cost-management.png", from: { cx: 1840, cy: 830, w: 2200 }, label: "Cost Management" },
  { src: "m-10-client-estimates.png", from: { cx: 1840, cy: 900, w: 2200 }, label: "Client Estimates" },
  { src: "m-12-vault.png", from: { cx: 1890, cy: 1290, w: 2300 }, label: "Digital Project Vault" },
];

/**
 * Act 3: the figures.
 *
 * Same step as the blitz, but the crop goes close enough that the product's own
 * number fills the frame. No label: the screen is already captioned by the app,
 * and a second caption over it would be the film talking over the product.
 *
 * These eight are the only places the cut slows its SUBJECT without slowing its
 * rate -- the shots are the same length, but each holds one number instead of a
 * whole screen, which is what stops eight more cuts reading as more of the same.
 */
export const FIGURES: Shot[] = [
  { src: "m-01-dashboard.png", from: { cx: 1025, cy: 676, w: 820 } },
  { src: "m-01-dashboard.png", from: { cx: 2249, cy: 676, w: 820 } },
  { src: "m-01-dashboard.png", from: { cx: 2861, cy: 676, w: 820 } },
  { src: "m-09-cost-management.png", from: { cx: 1021, cy: 830, w: 860 } },
  { src: "m-06-inventory.png", from: { cx: 1150, cy: 790, w: 900 } },
  { src: "m-04-daily-logs.png", from: { cx: 2760, cy: 820, w: 880 } },
  { src: "m-08-consumption.png", from: { cx: 1000, cy: 860, w: 880 } },
  { src: "m-11-reports.png", from: { cx: 1600, cy: 1150, w: 2000 }, label: "Progress Reports" },
];

/**
 * Act 4: three wide holds, a bar each.
 *
 * The film cannot end at the rate it has been running. Twenty-four hard cuts
 * leave a viewer with an impression rather than a picture, and the wide shots
 * are where the thing they have been seeing fragments of is finally shown
 * whole. Each one also MOVES -- a slow push -- because a still frame after
 * that much motion reads as the video having stopped.
 */
export const HOLDS: Shot[] = [
  {
    src: "m-01-dashboard.png",
    from: { cx: 1950, cy: 1000, w: 2450 },
    to: { cx: 1950, cy: 980, w: 2330 },
    span: BAR,
  },
  {
    src: "m-09-cost-management.png",
    from: { cx: 1950, cy: 1000, w: 2450 },
    to: { cx: 1950, cy: 1020, w: 2330 },
    span: BAR,
  },
  {
    src: "m-00-portfolio.png",
    from: { cx: 1600, cy: 1000, w: 3000 },
    to: { cx: 1600, cy: 980, w: 2860 },
    span: BAR,
  },
];

export const BLITZ_STEP = QUICK;
