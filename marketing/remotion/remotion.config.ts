import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// The session ships Chromium at a known path; Remotion should not download one.
Config.setChromiumOpenGlRenderer("angle");
