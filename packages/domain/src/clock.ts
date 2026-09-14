/**
 * The Clock primitive — business logic is TOLD the time, it never asks for it.
 *
 * Zero runtime dependencies (this module is destined for a dependency-free `domain` package).
 * `systemClock` is the only place in the domain layer allowed to call `new Date()`; every rule,
 * service and helper that needs "now" takes either a `Clock` (composition roots) or a plain
 * `Date` instant (pure rules), so a test can pin the instant instead of racing the host clock.
 */

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

/** Coerce the accepted instant spellings to epoch ms, rejecting anything unparseable. */
function toEpochMs(instant: Date | number | string): number {
  const ms = instant instanceof Date ? instant.getTime() : new Date(instant).valueOf();
  if (!Number.isFinite(ms)) throw new RangeError(`Invalid clock instant: ${String(instant)}`);
  return ms;
}

/** A clock frozen at one instant — the default choice for a deterministic test. */
export function fixedClock(instant: Date | number | string): Clock {
  const ms = toEpochMs(instant);
  return { now: () => new Date(ms) };
}

export interface AdvanceableClock extends Clock {
  /** Move the clock forward (or back, with a negative value) by `ms`. */
  advance(ms: number): void;
  /** Jump the clock to an absolute instant. */
  set(instant: Date | number | string): void;
}

/** A clock a test can step through time with — for "after N days, the badge flips" assertions. */
export function advanceableClock(start: Date | number | string): AdvanceableClock {
  let ms = toEpochMs(start);
  return {
    now: () => new Date(ms),
    advance(delta: number) {
      if (!Number.isFinite(delta)) throw new RangeError(`Invalid advance: ${String(delta)}`);
      ms += delta;
    },
    set(instant: Date | number | string) {
      ms = toEpochMs(instant);
    },
  };
}

/** Milliseconds in a UTC day — the one place this constant is defined for clock-derived math. */
export const MS_PER_DAY = 86_400_000;
