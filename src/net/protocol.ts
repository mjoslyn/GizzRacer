import type { EngineClass } from '../physics/racers';

/** Online rooms (docs/MULTIPLAYER.md section 6): messages between the room party and its clients. */

export const ROOM_MAX = 8;
/** Room codes use consonants only, so no code spells a word. */
const CODE_LETTERS = 'BCDFGHJKLMNPQRSTVWXZ';

export function makeRoomCode(rand: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < 4; i++) code += CODE_LETTERS[Math.floor(rand() * CODE_LETTERS.length)];
  return code;
}

export function isRoomCode(s: string): boolean {
  return new RegExp(`^[${CODE_LETTERS}]{4}$`).test(s);
}

export interface RoomSettings {
  track: number;
  engine: EngineClass;
}

export interface RoomMember {
  playerId: string;
  name: string;
  racerId: string;
  ready: boolean;
  host: boolean;
  /** Round trip in ms, as last measured by that player. */
  ping: number;
}

/** One grid slot: a human (by player id) or a CPU (null). */
export interface GridSlot {
  racerId: string;
  playerId: string | null;
}

export interface RoomStart {
  /** Increments with every race in this room. */
  race: number;
  /** Server clock (ms) when the countdown reaches GO. */
  at: number;
  seed: number;
  grid: GridSlot[];
  settings: RoomSettings;
}

/** One finisher in the room's results, in order. */
export interface RaceResult {
  racerId: string;
  playerId: string | null;
  time: number | null;
}

/**
 * The room's race, 15 times a second: every kart (grid order, packed by
 * wire.ts), each kart's item and roulette, places, laps and finish times,
 * and the item boxes and live items.
 */
export interface Snap {
  t: number;
  k: number[][];
  /** [item index in ITEM_KINDS or -1, roulette time left, spare item index or -1] per kart. */
  it: [number, number, number][];
  pos: number[];
  lap: number[];
  fin: (number | null)[];
  /** Respawn time left per item box (0 = there). */
  box: number[];
  mines: number[][];
  mis: number[][];
  waves: number[][];
  /** Band item bursts: [kind index, x, y, z, heading, age, life, len, from kart or -1, to kart or -1]. */
  fx: number[][];
  /** The Gizzard Wave: [x, y, z, heading, target kart or -1], or null. */
  sg: number[] | null;
}

/** Something the room did to your kart: apply it locally. */
export interface Effect {
  /** `push` is a wobble with a shove (x, z, m/s); `surge` is a Gizzard Wave, ridden over if you're in the air; `dodge` is one that was (client side only). */
  k: 'spin' | 'wobble' | 'slow' | 'boost' | 'cannon' | 'ram' | 'push' | 'surge' | 'dodge';
  t: number;
  /** What did it (an item kind), for the HUD. */
  by: string;
  /** Who did it: their grid index. */
  f?: number;
  x?: number;
  z?: number;
}

export interface RoomState {
  code: string;
  phase: 'lobby' | 'racing';
  /** Someone paused the race: it's paused for everyone until anyone resumes. */
  pause: { playerId: string; name: string } | null;
  settings: RoomSettings;
  members: RoomMember[];
  start: RoomStart | null;
  /** The current race's finishing order, once the room calls it. */
  results: RaceResult[] | null;
}

export type ClientMsg =
  | { t: 'hello'; playerId: string; token: string; create: boolean; racerId: string }
  | { t: 'racer'; racerId: string }
  | { t: 'ready'; ready: boolean }
  | { t: 'settings'; settings: Partial<RoomSettings> }
  | { t: 'start' }
  | { t: 'lobby' }
  | { t: 'pause'; paused: boolean }
  | { t: 'kart'; s: number[] }
  | { t: 'item' }
  /** Out of the race (back to the lobby early): a CPU takes my kart. */
  | { t: 'quit' }
  | { t: 'ping'; at: number; rtt: number };

export type ServerMsg =
  | { t: 'state'; state: RoomState }
  | { t: 'error'; error: string; fatal: boolean }
  | { t: 'pong'; at: number; server: number }
  | { t: 'snap'; snap: Snap }
  | { t: 'fx'; fx: Effect[] };
