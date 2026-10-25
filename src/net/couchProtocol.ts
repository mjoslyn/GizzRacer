/**
 * Party mode's phones (docs/MULTIPLAYER.md section 12): a `couch` party,
 * named by a 4-letter code like a room's, passes messages between the
 * screen everyone watches (the TV) and the phones driving its seats.
 * The phones are controllers and nothing more: no game runs on them.
 */

/** What a phone's buttons and tilt say, packed: [steer, pitch, held flags, taps since the last]. */
export type PadState = [number, number, number, number];
/** Held flags in PadState[2]. */
export const HELD = { brake: 1, drift: 2, item: 4, lookBack: 8 } as const;
/** Taps in PadState[3]: pressed and let go before the next state went. */
export const TAP = { drift: 1, item: 2 } as const;

/** A phone's buttons off the race: the join screen's, pause, and on past the results. */
export type PadAction = 'left' | 'right' | 'ready' | 'leave' | 'pause' | 'resume' | 'quit' | 'continue';
/** What P1's phone's left and right change on the join screen: their racer, or one of the settings. */
export type PadRow = 'racer' | 'cup' | 'engine' | 'cpus' | 'sound';

/** What the TV tells a phone about its seat. */
export interface SeatInfo {
  t: 'seat';
  /** Seat number (0..3), or null: no seat (all four taken, or not joined). */
  n: number | null;
  racer: string;
  color: string;
  ready: boolean;
  /** What the TV is showing: the join screen, a race, or the screens between. */
  phase: 'join' | 'race' | 'results' | 'away';
  /** The race is paused (by anyone): the phone shows its pause screen. */
  paused: boolean;
  /** P1 picks for everyone: the cup, the speed and the CPUs, as their phone shows them. */
  host: { cup: string; engine: string; cpus: string; sound: string } | null;
}

export type TvToPad = SeatInfo | { t: 'buzz'; ms: number };

export type CouchClientMsg =
  | { t: 'hello'; role: 'tv' }
  | { t: 'hello'; role: 'pad'; id: string; name: string }
  | { t: 'in'; s: PadState }
  | { t: 'act'; a: PadAction; row?: PadRow }
  /** The TV to one phone. */
  | { t: 'to'; id: string; m: TvToPad };

export type CouchServerMsg =
  /** To the TV: a phone said hello (on every reconnect too). */
  | { t: 'pad'; id: string; name: string }
  | { t: 'in'; id: string; s: PadState }
  | { t: 'act'; id: string; a: PadAction; row?: PadRow }
  /** To the TV: a phone's gone (closed, locked, out of signal). */
  | { t: 'gone'; id: string }
  /** To a phone: from the TV. */
  | { t: 'tv'; m: TvToPad }
  /** To a phone: whether a TV has this code open. */
  | { t: 'notv' }
  | { t: 'hastv' };

/** A phone id or name as sent: kept short and plain. */
export function cleanPadId(s: unknown, max: number): string {
  return typeof s === 'string' ? s.replace(/[^\w .'-]/g, '').slice(0, max) : '';
}
