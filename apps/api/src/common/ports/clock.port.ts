/** Port for the current time — injectable so tests are deterministic (§14.4). */
export interface Clock {
  now(): Date;
}

/** DI token for the Clock port. */
export const CLOCK = Symbol('CLOCK');

export const systemClock: Clock = {
  now: () => new Date(),
};
