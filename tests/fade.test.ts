import { describe, expect, it } from "vitest";
import {
  CLIP_DURATION,
  FADE_IN,
  FADE_OUT,
  WORKPIECE_JUMP_TIME,
  workpieceOpacity,
  wrapTime,
} from "../src/fade.ts";
import { formatClock, phaseLabel } from "../src/phase.ts";

describe("wrapTime", () => {
  it("keeps the clip inside one cycle", () => {
    expect(wrapTime(0)).toBe(0);
    expect(wrapTime(9)).toBe(0);
    expect(wrapTime(9.5)).toBeCloseTo(0.5);
    expect(wrapTime(-0.25)).toBeCloseTo(8.75);
  });
});

describe("workpieceOpacity", () => {
  it("stays solid through the grasp, carry and placement", () => {
    for (const time of [1, 2.2, 3.4, 4.6, 5.8, 6.5, 6.9, 7.05]) {
      expect(workpieceOpacity(time), `t=${time}`).toBe(1);
    }
  });

  it("is invisible across the pallet-to-belt snap and the loop wrap", () => {
    expect(WORKPIECE_JUMP_TIME).toBeGreaterThan(FADE_OUT.end);
    expect(WORKPIECE_JUMP_TIME).toBeLessThan(CLIP_DURATION);
    for (const time of [0, 0.05, FADE_IN.start, 7.5, WORKPIECE_JUMP_TIME, 7.6, 8.4, 9]) {
      expect(workpieceOpacity(time), `t=${time}`).toBe(0);
    }
  });

  it("fades out on the pallet and back in on the belt", () => {
    const earlyOut = workpieceOpacity(FADE_OUT.start + 0.04);
    const lateOut = workpieceOpacity(FADE_OUT.end - 0.04);
    expect(earlyOut).toBeGreaterThan(0.7);
    expect(lateOut).toBeLessThan(0.3);
    expect(lateOut).toBeLessThan(earlyOut);

    const earlyIn = workpieceOpacity(FADE_IN.start + 0.06);
    const lateIn = workpieceOpacity(FADE_IN.end - 0.06);
    expect(earlyIn).toBeGreaterThan(0);
    expect(earlyIn).toBeLessThan(0.35);
    expect(lateIn).toBeGreaterThan(0.7);
    expect(workpieceOpacity(FADE_IN.end)).toBe(1);
  });
});

describe("phase labels", () => {
  it("follows the authored timeline", () => {
    expect(phaseLabel(0.2)).toBe("Grundstellung");
    expect(phaseLabel(1)).toBe("Anfahrt");
    expect(phaseLabel(2.2)).toBe("Absenken");
    expect(phaseLabel(2.9)).toBe("Greifen");
    expect(phaseLabel(3.5)).toBe("Heben");
    expect(phaseLabel(4.6)).toBe("Umsetzen");
    expect(phaseLabel(5.8)).toBe("Ablegen");
    expect(phaseLabel(6.5)).toBe("Lösen");
    expect(phaseLabel(7.1)).toBe("Zurückziehen");
    expect(phaseLabel(8)).toBe("Rückweg");
    expect(phaseLabel(8.9)).toBe("Grundstellung");
    expect(formatClock(4.2)).toBe("4,2 s");
  });
});
