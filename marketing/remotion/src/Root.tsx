import React from "react";
import { Composition } from "remotion";
import { Hero, Social } from "./Hero";
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
