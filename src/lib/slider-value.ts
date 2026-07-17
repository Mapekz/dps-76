/**
 * Every slider in this app is single-thumb (one-element `value` array), but
 * Base UI's Slider.onValueChange is typed for the general number | number[]
 * range case. Unwrap it at the one call site consumers actually need.
 */
export function firstSliderValue(value: number | readonly number[]): number {
  return Array.isArray(value) ? value[0] : (value as number);
}
