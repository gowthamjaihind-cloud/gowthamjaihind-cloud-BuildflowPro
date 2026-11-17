import { useEffect, useRef, useState } from "react";

/**
 * Record a short voice note in the browser, for the command chat. Uses the
 * microphone only while recording, stops on its own after a minute, and
 * returns the audio as base64 with its type (webm on Android/Chrome, mp4 on
 * iPhone), which the server sends to the AI as it is.
 */
const MAX_MS = 60_000;
const TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/aac"];

export function voiceSupported(): boolean {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof (window as any).MediaRecorder !== "undefined";
}

export function useVoiceNote(onDone: (audio: { base64: string; mimeType: string }) => void) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timers = useRef<number[]>([]);
  const cancelled = useRef(false);

  const cleanup = () => {
    timers.current.forEach((t) => window.clearInterval(t));
    timers.current = [];
    rec.current?.stream.getTracks().forEach((t) => t.stop());
    rec.current = null;
    setRecording(false);
  };
  useEffect(() => () => { cancelled.current = true; cleanup(); }, []);

  const start = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const MR = (window as any).MediaRecorder as typeof MediaRecorder;
      const type = TYPES.find((t) => MR.isTypeSupported?.(t)) || "";
      const r = new MR(stream, type ? { mimeType: type, audioBitsPerSecond: 32000 } : undefined);
      chunks.current = [];
      cancelled.current = false;
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = async () => {
        const mimeType = (r.mimeType || type || "audio/webm").split(";")[0];
        const blob = new Blob(chunks.current, { type: mimeType });
        cleanup();
        if (cancelled.current || blob.size < 1000) return;
        const buf = new Uint8Array(await blob.arrayBuffer());
        let bin = "";
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        onDone({ base64: btoa(bin), mimeType });
      };
      rec.current = r;
      r.start();
      setRecording(true);
      setSeconds(0);
      const t0 = Date.now();
      timers.current.push(window.setInterval(() => {
        const s = Math.floor((Date.now() - t0) / 1000);
        setSeconds(s);
        if (Date.now() - t0 >= MAX_MS) stop();
      }, 250));
    } catch {
      setError("The microphone could not be used. Allow microphone access for this site, or type instead.");
      cleanup();
    }
  };
  const stop = () => {
    if (rec.current && rec.current.state !== "inactive") rec.current.stop();
  };
  const cancel = () => {
    cancelled.current = true;
    stop();
  };
  return { recording, seconds, error, start, stop, cancel };
}
