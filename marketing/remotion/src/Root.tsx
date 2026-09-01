import React from "react";
import { Composition } from "remotion";
import { Hero, Social } from "./Hero";

export const RemotionRoot: React.FC = () => (
  <>
    {/* Hero cut for the site and YouTube. */}
    <Composition
      id="Hero"
      component={Hero}
      durationInFrames={2430}
      fps={30}
      width={1920}
      height={1080}
    />
    {/* Vertical cutdown for WhatsApp status, Instagram and YouTube Shorts. */}
    <Composition
      id="Social"
      component={Social}
      durationInFrames={900}
      fps={30}
      width={1080}
      height={1920}
    />
  </>
);
