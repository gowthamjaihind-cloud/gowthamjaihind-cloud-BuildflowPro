import React from "react";
import { Composition } from "remotion";
import { Hero, Social } from "./Hero";
import { WalkEndCard } from "./film/Titles";
import { LAUNCH_FPS, LAUNCH_FRAMES, Launch } from "./film/Launch";

export const RemotionRoot: React.FC = () => (
  <>
    {/*
      The launch film. Its length is not written here: LAUNCH_FRAMES comes from
      the measured narration, so a script edit changes the composition's
      duration without anyone remembering to update a number.
    */}
    <Composition
      id="Launch"
      component={Launch}
      durationInFrames={LAUNCH_FRAMES}
      fps={LAUNCH_FPS}
      width={1920}
      height={1080}
    />

    {/*
      The end card on its own, full bleed, for the WALKTHROUGH to close on.

      The walkthrough is a screen recording assembled by ffmpeg, not a Remotion
      composition, so it cannot mount the component -- it can only composite a
      still. Rendering that still from the launch film would carry the launch
      film's letterbox: 56px of black top and bottom, which is a deliberate
      treatment there and simply wrong on a full-frame recording.

      So the card renders here instead, at the recording's own dimensions and
      without the bars, and `npm run endcard` writes the PNG the recorder
      composites. One design, two films.
    */}
    <Composition
      id="WalkEndCard"
      component={WalkEndCard}
      durationInFrames={70}
      fps={30}
      width={1920}
      height={1080}
    />

    {/* The earlier silent cuts, kept: they are the captioned versions, which
        still suit a muted autoplay on a page where the launch film would not. */}
    <Composition
      id="Hero"
      component={Hero}
      durationInFrames={2500}
      fps={30}
      width={1920}
      height={1080}
    />
    {/* Vertical cutdown for WhatsApp status, Instagram and YouTube Shorts. */}
    <Composition
      id="Social"
      component={Social}
      durationInFrames={1050}
      fps={30}
      width={1080}
      height={1920}
    />
  </>
);
