/** Port for the current time — injectable so tests are deterministic (§14.4). */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};
