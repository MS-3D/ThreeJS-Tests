import { wrapTime } from "./fade.ts";

/** Phase ends in seconds, matching the sampled 24 fps timeline. */
const PHASES: ReadonlyArray<readonly [number, string]> = [
  [10 / 24, "Grundstellung"],
  [46 / 24, "Anfahrt"],
  [64 / 24, "Absenken"],
  [76 / 24, "Greifen"],
  [96 / 24, "Heben"],
  [128 / 24, "Umsetzen"],
  [152 / 24, "Ablegen"],
  [162 / 24, "Lösen"],
  [180 / 24, "Zurückziehen"],
  [210 / 24, "Rückweg"],
  [9, "Grundstellung"],
];

export function phaseLabel(time: number): string {
  const t = wrapTime(time);
  for (const [end, label] of PHASES) {
    if (t < end) return label;
  }
  return "Grundstellung";
}

export function formatClock(time: number): string {
  const seconds = wrapTime(time);
  return `${seconds.toFixed(1).replace(".", ",")} s`;
}
