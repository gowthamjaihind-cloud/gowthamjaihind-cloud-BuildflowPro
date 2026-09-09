import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { C, Focus } from "../theme";
import { Still } from "../Still";
import { Defocus, Grain, Letterbox, Vignette, arrive, ramp } from "./Cinema";
import { Fonts, typeStyle } from "./Fonts";
import { Caption, Rect, Shot } from "./Shot";
import { EndCard, Statement, TitleCard } from "./Titles";
import { BEATS, TOTAL_SECONDS, beat } from "../generated/launchTiming";

/**
 * THE LAUNCH FILM.
 *
 * Cut to the narration, not to a frame count I typed. Every beat's length is
 * the measured length of its synthesised line plus a written hold, read from
 * generated/launchTiming.ts -- so editing a sentence in the script retimes the
 * picture, and the two cannot drift. The old pipeline kept frame numbers by
 * hand next to the words and had already gone out of sync.
 *
 * The film's argument, in three moves:
 *
 *   1. THE EVENING (three cards, letterboxed, almost no light). A contractor
 *      spends his evenings finding out what happened today, and finds out where
 *      the money went a month late. No product on screen -- if the viewer does
 *      not recognise the problem, nothing after this matters.
 *
 *   2. THE MECHANISM (title, then Telegram). The fix is not a dashboard, it is
 *      that the site engineer reports from a chat app he already has. This is
 *      the only genuinely unusual thing about the product, so it gets said
 *      plainly and then shown.
 *
 *   3. THE CHAIN (five product shots, one continuous idea). One log from site
 *      moves through the plan, the stock, the purchase order, the cost and the
 *      client bill. A highlight travels with it -- leaving each screen where it
 *      left off and arriving on the next in the right place -- because that
 *      chain is the actual product and four captions asserting it would not be.
 *
 * Then the money, the scale, the line the whole thing was built to earn, and
 * the mark. No superlatives anywhere: the audience is people who get sold to
 * badly and often.
 */

const FPS = 30;
const f = (seconds: number) => Math.round(seconds * FPS);

/**
 * Shots are cropped in SOURCE pixels against the 3200x2000 captures.
 *
 * The app's own chrome sets the useful bounds: the sidebar ends around x=700
 * and the content runs to x=3140, so a crop centred near x=1950 holds the
 * screen's own composition. Nothing goes wider than ~2700 -- past that the
 * app's 15px type falls under about 11px in a 1920 frame and stops being
 * readable, which defeats the point of showing the product at all.
 */
const F: Record<string, Focus> = {
  logsWide: { cx: 1960, cy: 950, w: 2900 },
  logsIn: { cx: 1930, cy: 1050, w: 2500 },
  wbsWide: { cx: 1950, cy: 1000, w: 2950 },
  wbsIn: { cx: 1930, cy: 1120, w: 2550 },
  invWide: { cx: 1960, cy: 950, w: 2900 },
  invIn: { cx: 1940, cy: 1020, w: 2520 },
  procWide: { cx: 1950, cy: 830, w: 2900 },
  procIn: { cx: 1930, cy: 870, w: 2520 },
  // Cost lands on the TASK COSTS tab, not Overview. The line says "against
  // this task's budget, not the project's" and Overview shows project totals
  // -- narration describing one thing over a frame showing another is exactly
  // the drift this pipeline has had before, so the shot changed, not the line.
  costWide: { cx: 1950, cy: 1080, w: 2950 },
  costIn: { cx: 1960, cy: 1240, w: 2560 },
  insightsWide: { cx: 1950, cy: 860, w: 2900 },
  insightsIn: { cx: 1960, cy: 930, w: 2500 },
  estWide: { cx: 1950, cy: 880, w: 2900 },
  portfolioWide: { cx: 1700, cy: 1000, w: 3040 },
  portfolioOut: { cx: 1600, cy: 1000, w: 3200 },
};

const S = {
  logs: "m-04-daily-logs.png",
  wbs: "m-03-wbs.png",
  inventory: "m-06-inventory.png",
  procurement: "m-07-procurement.png",
  cost: "m-09-cost-management-tasks.png",
  insights: "m-02-insights.png",
  estimates: "m-10-client-estimates.png",
  portfolio: "m-00-portfolio.png",
};

/**
 * The travelling highlight, in source pixels, one link per chain beat.
 *
 * Positions are read off the captures rather than estimated: the procurement
 * mark sits on PO-2026-0018's amount and its PARTIALLY RECEIVED status, and the
 * cost mark sits on the Total Cost card's variance line -- the two figures the
 * narration is actually talking about at that moment.
 */
const MARKS: Record<string, Rect[]> = {
  wbs: [{ x: 780, y: 1120, w: 2300, h: 150, label: "task advances" }],
  inventory: [{ x: 780, y: 900, w: 2320, h: 150, label: "issued from stock" }],
  // PO-2026-0018's amount and its PARTIALLY RECEIVED status: the two things
  // the line is talking about at that moment.
  procurement: [{ x: 2300, y: 800, w: 800, h: 120, label: "reconciled" }],
  // The First floor row's planned total against its actual spend, on the Task
  // Costs tab -- one task's budget, which is the whole point of the line.
  cost: [{ x: 2295, y: 1485, w: 760, h: 112, label: "this task's budget" }],
  insights: [{ x: 1960, y: 830, w: 580, h: 200, label: "today's variance" }],
};

/** Frames of overlap on a dissolve. Long enough to read as a move, short enough not to dawdle. */
const XF = 16;

/**
 * A beat, with its own dissolve in and out.
 *
 * The transition lives in the shot rather than between shots, which is what
 * lets each one blur ITSELF on the way out while the next resolves on the way
 * in. A plain cross-dissolve of two sharp frames gives you a moment where both
 * are legible and neither readable -- the ugliest frame in any cut.
 */
const Beat: React.FC<{
  id: string;
  children: React.ReactNode;
  /** No dissolve in; used for the hard cut into the title. */
  cut?: boolean;
}> = ({ id, children, cut = false }) => {
  const b = beat(id);
  const from = f(b.startsAt);
  const dur = f(b.beatSeconds);
  return (
    <Sequence from={Math.max(from - (cut ? 0 : XF), 0)} durationInFrames={dur + XF * 2} layout="none">
      <BeatBody cut={cut} total={dur + XF * 2}>
        {children}
      </BeatBody>
    </Sequence>
  );
};

const BeatBody: React.FC<{ children: React.ReactNode; cut: boolean; total: number }> = ({
  children,
  cut,
  total,
}) => {
  const frame = useCurrentFrame();
  const inP = cut ? 1 : ramp(frame, [0, XF], arrive);
  const outP = ramp(frame, [total - XF, total], arrive);
  return (
    <Defocus progress={outP} maxBlur={14}>
      <Defocus progress={inP} incoming maxBlur={16}>
        {children}
      </Defocus>
    </Defocus>
  );
};

/** The cold open's bars, open at the head and close at the tail. */
const Bars: React.FC = () => {
  const frame = useCurrentFrame();
  const openAt = f(beat("title").startsAt) - 14;
  const closeFrom = f(beat("end").startsAt) + f(beat("end").seconds) + 12;
  const total = f(TOTAL_SECONDS);
  const p =
    frame < openAt
      ? 1 - ramp(frame, [openAt - 22, openAt], arrive)
      : ramp(frame, [closeFrom, Math.min(closeFrom + 26, total)], arrive);
  return <Letterbox progress={p} />;
};

export const Launch: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: C.surfaceDark, ...typeStyle }}>
    <Fonts />
    {/* --- 1. the evening ------------------------------------------------- */}
    <Beat id="open" cut>
      <Statement
        kicker="six o'clock"
        lines={["Do you know", "what happened on", "your site today?"]}
        accent={2}
      />
    </Beat>

    <Beat id="honest">
      <Statement
        lines={["Three phone calls.", "A photo on WhatsApp.", "A number in somebody's", "notebook."]}
        size={66}
        accent={3}
      />
    </Beat>

    <Beat id="money">
      <Statement
        lines={["And the money?", "You'll know next month."]}
        size={74}
        accent={1}
      />
    </Beat>

    {/* --- 2. the mechanism ---------------------------------------------- */}
    <Beat id="title">
      <TitleCard />
    </Beat>

    <Beat id="mechanism">
      <Statement
        kicker="where it starts"
        lines={["Not in your office.", "On your engineer's phone."]}
        sub="The one already in his pocket."
        size={68}
        accent={1}
      />
    </Beat>

    <Beat id="telegram">
      <Still src="telegram-beat-full.png" />
      <Caption kicker="on telegram" title="He taps what he's logging. That's the whole job." />
    </Beat>

    {/* --- 3. the chain --------------------------------------------------- */}
    <Beat id="lands">
      <Shot src={S.logs} from={F.logsWide} to={F.logsIn} />
      <Caption kicker="daily logs" title="Filed against the task it belongs to." />
    </Beat>

    <Beat id="chain-1">
      <Shot src={S.wbs} from={F.wbsWide} to={F.wbsIn} marks={MARKS.wbs} markAt={XF + 8} />
      <Caption kicker="the plan" title="The task advances. The phase moves with it." />
    </Beat>

    <Beat id="chain-2">
      <Shot src={S.inventory} from={F.invWide} to={F.invIn} marks={MARKS.inventory} markAt={XF + 6} />
      <Caption kicker="stock" title="Material leaves the store." />
    </Beat>

    <Beat id="chain-3">
      <Shot
        src={S.procurement}
        from={F.procWide}
        to={F.procIn}
        marks={MARKS.procurement}
        markAt={XF + 6}
      />
      <Caption kicker="procurement" title="The order and the supplier's account settle themselves." />
    </Beat>

    <Beat id="chain-4">
      <Shot src={S.cost} from={F.costWide} to={F.costIn} marks={MARKS.cost} markAt={XF + 8} />
      <Caption kicker="cost" title="Against this task's budget. Not the project's." />
    </Beat>

    {/* --- the money, the scale ------------------------------------------ */}
    <Beat id="variance">
      <Shot
        src={S.insights}
        from={F.insightsWide}
        to={F.insightsIn}
        marks={MARKS.insights}
        markAt={XF + 6}
      />
      <Caption kicker="variance" title="Today's number. Not last month's." />
    </Beat>

    <Beat id="client">
      <Shot src={S.estimates} from={F.estWide} />
      <Caption kicker="client billing" title="One breakdown. One version of the truth." />
    </Beat>

    <Beat id="scale">
      <Shot src={S.portfolio} from={F.portfolioWide} to={F.portfolioOut} />
      <Caption kicker="portfolio" title="One job, or all of them." />
    </Beat>

    {/* --- the line, and the mark ---------------------------------------- */}
    <Beat id="thesis">
      <Statement
        lines={["A site doesn't stop", "for paperwork."]}
        sub="So the paperwork has to keep up with the site."
        size={80}
        accent={1}
      />
    </Beat>

    <Beat id="end">
      <EndCard />
    </Beat>

    <Bars />
  </AbsoluteFill>
);

/** Total length, so Root and the audio mix agree without either being edited. */
export const LAUNCH_FRAMES = f(TOTAL_SECONDS) + XF;
export const LAUNCH_FPS = FPS;
export { BEATS as LAUNCH_BEATS };
