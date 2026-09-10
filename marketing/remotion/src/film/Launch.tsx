import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { C, Focus } from "../theme";
import { Still } from "../Still";
import { Grain, Letterbox, Vignette, arrive, ramp } from "./Cinema";
import { Fonts, typeStyle } from "./Fonts";
import { Caption, Rect, Shot } from "./Shot";
import { EndCard, Statement, TitleCard } from "./Titles";
import { Beat } from "./Cut";
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
 *
 * THE EDIT. A narration beat still owns its span -- the film is cut to the
 * voice. What changed is what happens inside that span: the long beats now hold
 * two or three shots instead of one, cut hard on the music's grid. See Cut.tsx
 * for the scheduler and why the grid exists. In short: at 100 BPM and 30fps a
 * beat is exactly 18 frames, every shot boundary is a multiple of a half-beat,
 * and the picture changes at the same instant the music does.
 *
 * The first cut of this film crossfaded every shot over sixteen frames. Nothing
 * was wrong with any single frame of it; it was just slow, because a dissolve
 * says "time is passing" and there were sixteen of them. Dissolves now survive
 * only at the three places where the film genuinely changes subject.
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
/**
 * `satisfies` rather than `Record<string, Focus>`: an index signature makes
 * every key valid, so `F.estIn` typechecked while the entry did not exist and
 * would have handed `undefined` to a crop at render time. This way a typo is a
 * compile error.
 */
const F = {
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
  estIn: { cx: 1960, cy: 940, w: 2450 },
  portfolioWide: { cx: 1700, cy: 1000, w: 3040 },
  portfolioOut: { cx: 1600, cy: 1000, w: 3200 },
} satisfies Record<string, Focus>;

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
const MARKS = {
  wbs: [{ x: 780, y: 1120, w: 2300, h: 150, label: "task advances" }],
  inventory: [{ x: 780, y: 900, w: 2320, h: 150, label: "issued from stock" }],
  // PO-2026-0018's amount and its PARTIALLY RECEIVED status: the two things
  // the line is talking about at that moment.
  procurement: [{ x: 2300, y: 800, w: 800, h: 120, label: "reconciled" }],
  // The First floor row's planned total against its actual spend, on the Task
  // Costs tab -- one task's budget, which is the whole point of the line.
  cost: [{ x: 2295, y: 1485, w: 760, h: 112, label: "this task's budget" }],
  insights: [{ x: 1960, y: 830, w: 580, h: 200, label: "today's variance" }],
} satisfies Record<string, Rect[]>;

/** Frames the letterbox needs to clear the title. */
const XF = 8;

/** A beat's span, in frames, from the measured narration. */
const span = (id: string) => ({ from: f(beat(id).startsAt), frames: f(beat(id).beatSeconds) });

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

/** Telegram beat still, authored at frame size rather than as an app capture. */
const TG = { w: 1920, h: 1080 };
const TGF = {
  wide: { cx: 960, cy: 540, w: 1920 } as Focus,
  left: { cx: 545, cy: 545, w: 880 } as Focus,
  right: { cx: 1385, cy: 545, w: 880 } as Focus,
};

export const Launch: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: C.surfaceDark, ...typeStyle }}>
    <Fonts />

    {/* --- 1. the evening ------------------------------------------------- */}
    <Beat
      {...span("open")}
      shots={[
        {
          node: (
            <Statement
              kicker="six o'clock"
              lines={["Do you know", "what happened on", "your site today?"]}
              accent={2}
            />
          ),
        },
      ]}
    />

    {/*
      The film's signature jump edit, and the reason the shot list exists at
      all. Three fragments of one sentence, three cards, cut hard on the beat.
      As a single card held for five and a half seconds it was the slowest
      stretch in the film; as three it is the fastest.
    */}
    <Beat
      {...span("honest")}
      shots={[
        { node: <Statement lines={["Three", "phone calls."]} size={96} accent={1} /> },
        { cut: "hard", node: <Statement lines={["A photo", "on WhatsApp."]} size={96} accent={1} /> },
        {
          cut: "hard",
          weight: 1.25,
          node: <Statement lines={["A number in", "somebody's notebook."]} size={82} accent={1} />,
        },
      ]}
    />

    <Beat
      {...span("money")}
      shots={[
        {
          cut: "flash",
          node: <Statement lines={["And the money?", "You'll know next month."]} size={78} accent={1} />,
        },
      ]}
    />

    {/* --- 2. the mechanism ---------------------------------------------- */}
    <Beat {...span("title")} shots={[{ cut: "flash", node: <TitleCard /> }]} />

    <Beat
      {...span("mechanism")}
      shots={[
        { node: <Statement kicker="where it starts" lines={["Not in your office."]} size={86} /> },
        {
          cut: "hard",
          weight: 1.3,
          node: (
            <Statement
              lines={["On your engineer's", "phone."]}
              sub="The one already in his pocket."
              size={86}
              accent={0}
            />
          ),
        },
      ]}
    />

    {/*
      A still held for nearly nine seconds was dead air with a caption on it.
      Whipping between the two phones turns it into three shots that follow
      what the line is describing: he taps, and it comes back logged.
    */}
    <Beat
      {...span("telegram")}
      caption={<Caption kicker="on telegram" title="He taps what he's logging. That's the whole job." />}
      shots={[
        { node: <Shot src="telegram-beat-full.png" from={TGF.wide} srcW={TG.w} srcH={TG.h} /> },
        {
          cut: "whip",
          dir: 1,
          weight: 1.15,
          node: <Shot src="telegram-beat-full.png" from={TGF.left} srcW={TG.w} srcH={TG.h} />,
        },
        {
          cut: "whip",
          dir: 1,
          weight: 1.15,
          node: <Shot src="telegram-beat-full.png" from={TGF.right} srcW={TG.w} srcH={TG.h} />,
        },
      ]}
    />

    {/* --- 3. the chain --------------------------------------------------- */}
    <Beat
      {...span("lands")}
      caption={<Caption kicker="daily logs" title="Filed against the task it belongs to." />}
      shots={[
        { cut: "dissolve", node: <Shot src={S.logs} from={F.logsWide} /> },
        { cut: "whip", dir: 1, node: <Shot src={S.logs} from={F.logsIn} /> },
      ]}
    />

    <Beat
      {...span("chain-1")}
      caption={<Caption kicker="the plan" title="The task advances. The phase moves with it." />}
      shots={[
        { node: <Shot src={S.wbs} from={F.wbsWide} /> },
        {
          cut: "whip",
          dir: 1,
          weight: 1.2,
          node: <Shot src={S.wbs} from={F.wbsIn} marks={MARKS.wbs} markAt={4} />,
        },
      ]}
    />

    <Beat
      {...span("chain-2")}
      caption={<Caption kicker="stock" title="Material leaves the store." />}
      shots={[
        { node: <Shot src={S.inventory} from={F.invIn} marks={MARKS.inventory} markAt={4} /> },
      ]}
    />

    <Beat
      {...span("chain-3")}
      caption={<Caption kicker="procurement" title="The order and the supplier's account settle themselves." />}
      shots={[
        { node: <Shot src={S.procurement} from={F.procWide} /> },
        {
          cut: "whip",
          dir: 1,
          weight: 1.2,
          node: <Shot src={S.procurement} from={F.procIn} marks={MARKS.procurement} markAt={4} />,
        },
      ]}
    />

    <Beat
      {...span("chain-4")}
      caption={<Caption kicker="cost" title="Against this task's budget. Not the project's." />}
      shots={[
        { node: <Shot src={S.cost} from={F.costWide} /> },
        {
          cut: "whip",
          dir: 1,
          weight: 1.25,
          node: <Shot src={S.cost} from={F.costIn} marks={MARKS.cost} markAt={4} />,
        },
      ]}
    />

    {/* --- the money, the scale ------------------------------------------ */}
    <Beat
      {...span("variance")}
      caption={<Caption kicker="variance" title="Today's number. Not last month's." />}
      shots={[
        { cut: "dissolve", node: <Shot src={S.insights} from={F.insightsWide} /> },
        {
          cut: "whip",
          dir: 1,
          weight: 1.3,
          node: <Shot src={S.insights} from={F.insightsIn} marks={MARKS.insights} markAt={4} />,
        },
      ]}
    />

    <Beat
      {...span("client")}
      caption={<Caption kicker="client billing" title="One breakdown. One version of the truth." />}
      shots={[
        { node: <Shot src={S.estimates} from={F.estWide} /> },
        { cut: "whip", dir: 1, node: <Shot src={S.estimates} from={F.estIn} /> },
        { cut: "hard", node: <Shot src={S.estimates} from={F.estWide} /> },
      ]}
    />

    <Beat
      {...span("scale")}
      caption={<Caption kicker="portfolio" title="One job, or all of them." />}
      shots={[{ cut: "flash", node: <Shot src={S.portfolio} from={F.portfolioWide} to={F.portfolioOut} /> }]}
    />

    {/* --- the line, and the mark ---------------------------------------- */}
    <Beat
      {...span("thesis")}
      shots={[
        { cut: "dissolve", node: <Statement lines={["A site doesn't stop", "for paperwork."]} size={86} accent={1} /> },
        {
          cut: "hard",
          node: (
            <Statement
              lines={["So the paperwork", "has to keep up."]}
              size={86}
              accent={1}
            />
          ),
        },
      ]}
    />

    <Beat {...span("end")} shots={[{ cut: "flash", node: <EndCard /> }]} />

    <Bars />
  </AbsoluteFill>
);

/** Total length, so Root and the audio mix agree without either being edited. */
export const LAUNCH_FRAMES = f(TOTAL_SECONDS) + XF;
export const LAUNCH_FPS = FPS;
export { BEATS as LAUNCH_BEATS };
