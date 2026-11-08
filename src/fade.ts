/** PickPlaceLoop length. Frames 1–216 at 24 fps, keys from 1/24 s to 9 s. */
export const CLIP_DURATION = 9;

/**
 * First return sample. The workpiece translation/rotation snap from the
 * pallet pose back to the belt rest pose between t = 7.5 (frame 180, still
 * on the pallet) and this time. Robot joints and gripper fingers do not snap.
 */
export const WORKPIECE_JUMP_TIME = 181 / 24;

/** Dissolve on the pallet, finished before WORKPIECE_JUMP_TIME. */
export const FADE_OUT = { start: 7.16, end: 7.48 } as const;

/** Appear on the belt while the arm is still at home, before the descent. */
export const FADE_IN = { start: 0.1, end: 0.78 } as const;

export function wrapTime(time: number, duration = CLIP_DURATION): number {
  if (!Number.isFinite(time) || !(duration > 0)) return 0;
  const wrapped = time % duration;
  return wrapped < 0 ? wrapped + duration : wrapped;
}

export function smoothstep(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

/**
 * Opacity for the carried block. The glTF transform is left untouched,
 * including while the gripper holds it. The channel itself jumps at
 * WORKPIECE_JUMP_TIME; this hides that sample and brings the part back
 * before the next grasp.
 */
export function workpieceOpacity(time: number): number {
  const t = wrapTime(time);
  if (t >= FADE_OUT.end || t <= FADE_IN.start) return 0;
  if (t >= FADE_OUT.start) {
    const amount = (t - FADE_OUT.start) / (FADE_OUT.end - FADE_OUT.start);
    return 1 - smoothstep(amount);
  }
  if (t < FADE_IN.end) {
    const amount = (t - FADE_IN.start) / (FADE_IN.end - FADE_IN.start);
    return smoothstep(amount);
  }
  return 1;
}
