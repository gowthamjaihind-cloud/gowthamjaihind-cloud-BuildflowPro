import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { Screen } from "./Screen";
import { Still } from "./Still";
import { Caption, EndCard, TypeCard } from "./Type";
import { C, Focus } from "./theme";

/**
 * Regions of each screenshot worth showing, as a centre point and width in
 * source pixels (screens are 3200x2000). Chosen so the figures that carry the
 * argument -- 65%, 22 workers, the rupee columns -- are large enough to read
 * on a phone, which the generated version got wrong.
 */
const F = {
  wbsWide:      { cx: 1750, cy: 1310, w: 2250 } as Focus,
  wbsMoney:     { cx: 1820, cy: 1430, w: 2150 } as Focus,
  logsWide:     { cx: 1700, cy: 820,  w: 2200 } as Focus,
  logsNumbers:  { cx: 2380, cy: 790,  w: 1250 } as Focus,
  procWide:     { cx: 1900, cy: 980,  w: 2400 } as Focus,
  procAmounts:  { cx: 2150, cy: 1000, w: 2000 } as Focus,
  costWide:     { cx: 1780, cy: 800,  w: 2420 } as Focus,
  costFigures:  { cx: 1330, cy: 810,  w: 1300 } as Focus,
  estWide:      { cx: 1800, cy: 830,  w: 2380 } as Focus,
  estMargin:    { cx: 1900, cy: 835,  w: 2220 } as Focus,
  dashWide:     { cx: 1760, cy: 720,  w: 2400 } as Focus,
  dashKpis:     { cx: 1950, cy: 880,  w: 2450 } as Focus,
  // Vertical needs its own, narrower crops: at 9:16 the height is w*16/9, so
  // anything wider than ~1125px overruns the 2000px-tall screenshot.
  vLogs:        { cx: 2330, cy: 1000, w: 1080 } as Focus,
  vLogsIn:      { cx: 2400, cy: 940,  w: 950 }  as Focus,
  vCost:        { cx: 1180, cy: 1000, w: 1080 } as Focus,
};

const S = {
  wbs: "m-03-wbs.png",
  logs: "m-04-daily-logs.png",
  proc: "m-07-procurement.png",
  cost: "m-09-cost-management.png",
  est: "m-10-client-estimates.png",
  dash: "m-01-dashboard.png",
};

/** Beat boundaries in frames at 30fps. */
export const HERO_BEATS = {
  hook: [0, 175],
  wbs: [175, 505],
  logsA: [505, 745],
  telegramWord: [745, 865],
  telegramPhones: [865, 1105],
  logsB: [1105, 1285],
  proc: [1285, 1555],
  cost: [1555, 1845],
  est: [1845, 2085],
  dash: [2085, 2250],
  end: [2250, 2500],
} as const;

const len = (b: readonly [number, number] | number[]) => b[1] - b[0];

export const Hero: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: C.slate }}>
    <Sequence from={HERO_BEATS.hook[0]} durationInFrames={len(HERO_BEATS.hook)}>
      <TypeCard
        lines={["How many calls does it take", "to find out what happened", "on your site today?"]}
        sub="And at month end — do you know where the money went?"
        accentLine={2}
      />
    </Sequence>

    <Sequence from={HERO_BEATS.wbs[0]} durationInFrames={len(HERO_BEATS.wbs)}>
      <Screen src={S.wbs} from={F.wbsWide} to={F.wbsMoney} />
      <Caption
        label="Work breakdown"
        title="Plan it once."
        note="Break the job up the way you'd write it on paper. Days and budget go in once."
      />
    </Sequence>

    <Sequence from={HERO_BEATS.logsA[0]} durationInFrames={len(HERO_BEATS.logsA)}>
      <Screen src={S.logs} from={F.logsWide} />
      <Caption
        label="Daily logs"
        title="The site reports to you."
        note="Progress, headcount and material — sent from site, every day."
      />
    </Sequence>

    {/* The differentiator, said plainly and on its own frame. */}
    <Sequence from={HERO_BEATS.telegramWord[0]} durationInFrames={len(HERO_BEATS.telegramWord)}>
      <TypeCard
        lines={["Your engineer sends it", "on Telegram."]}
        sub="An app already on his phone. Nothing to install. Nobody to train."
        accentLine={1}
      />
    </Sequence>

    {/* Show the bot's actual options rather than asserting they exist. */}
    <Sequence
      from={HERO_BEATS.telegramPhones[0]}
      durationInFrames={len(HERO_BEATS.telegramPhones)}
    >
      <Still src="telegram-beat-16x9.png" />
      <Caption
        label="On Telegram"
        title="He picks what to log. Nothing else."
        note="Progress, labour, material, equipment, a photo or a note — then Save."
      />
    </Sequence>

    <Sequence from={HERO_BEATS.logsB[0]} durationInFrames={len(HERO_BEATS.logsB)}>
      <Screen src={S.logs} from={F.logsNumbers} />
      <Caption label="Yesterday, first floor" title="65% done. 22 on site." />
    </Sequence>

    <Sequence from={HERO_BEATS.proc[0]} durationInFrames={len(HERO_BEATS.proc)}>
      <Screen src={S.proc} from={F.procWide} to={F.procAmounts} />
      <Caption
        label="Procurement"
        title="Buy material."
        note="Raise a purchase order. Receive it when it lands. Stock and the supplier's account move on their own."
      />
    </Sequence>

    <Sequence from={HERO_BEATS.cost[0]} durationInFrames={len(HERO_BEATS.cost)}>
      <Screen src={S.cost} from={F.costWide} to={F.costFigures} />
      <Caption
        label="Cost"
        title="Watch the money."
        note="Planned against actual, task by task. Overspend shows up today — not at month end."
      />
    </Sequence>

    <Sequence from={HERO_BEATS.est[0]} durationInFrames={len(HERO_BEATS.est)}>
      <Screen src={S.est} from={F.estWide} to={F.estMargin} />
      <Caption
        label="Client estimates"
        title="Bill the client."
        note="From the same breakdown you already built. Variations tracked. GST added."
      />
    </Sequence>

    <Sequence from={HERO_BEATS.dash[0]} durationInFrames={len(HERO_BEATS.dash)}>
      <Screen src={S.dash} from={F.dashWide} to={F.dashKpis} />
      <Caption label="One place" title="43% built. ₹53.7L spent. Nothing at risk." />
    </Sequence>

    <Sequence from={HERO_BEATS.end[0]} durationInFrames={len(HERO_BEATS.end)}>
      <EndCard />
    </Sequence>
  </AbsoluteFill>
);

/** A 30-second cutdown for social: the hook, the differentiator, the money, the offer. */
export const Social: React.FC = () => {
  const B = {
    hook: [0, 140],
    telegram: [140, 290],
    phones: [290, 500],
    logs: [500, 660],
    cost: [660, 830],
    end: [830, 1050],
  } as const;

  return (
    <AbsoluteFill style={{ backgroundColor: C.slate }}>
      <Sequence from={B.hook[0]} durationInFrames={len(B.hook)}>
        <TypeCard lines={["How many calls", "to find out what", "happened on site?"]} accentLine={2} />
      </Sequence>

      <Sequence from={B.telegram[0]} durationInFrames={len(B.telegram)}>
        <TypeCard
          lines={["Your engineer sends it", "on Telegram."]}
          sub="Already on his phone. Nothing to install."
          accentLine={1}
        />
      </Sequence>

      <Sequence from={B.phones[0]} durationInFrames={len(B.phones)}>
        <Still src="telegram-beat-9x16.png" />
        <Caption label="On Telegram" title="He picks what to log." />
      </Sequence>

      <Sequence from={B.logs[0]} durationInFrames={len(B.logs)}>
        <Screen src={S.logs} from={F.vLogs} to={F.vLogsIn} />
        <Caption label="Yesterday" title="65% done. 22 on site." />
      </Sequence>

      <Sequence from={B.cost[0]} durationInFrames={len(B.cost)}>
        <Screen src={S.cost} from={F.vCost} />
        <Caption label="Cost" title="Planned against actual." />
      </Sequence>

      <Sequence from={B.end[0]} durationInFrames={len(B.end)}>
        <EndCard />
      </Sequence>
    </AbsoluteFill>
  );
};
