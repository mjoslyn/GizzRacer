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

export interface RoomState {
  code: string;
  phase: 'lobby' | 'racing';
  settings: RoomSettings;
  members: RoomMember[];
  start: RoomStart | null;
}

export type ClientMsg =
  | { t: 'hello'; playerId: string; token: string; create: boolean; racerId: string }
  | { t: 'racer'; racerId: string }
  | { t: 'ready'; ready: boolean }
  | { t: 'settings'; settings: Partial<RoomSettings> }
  | { t: 'start' }
  | { t: 'lobby' }
  | { t: 'ping'; at: number; rtt: number };

export type ServerMsg =
  | { t: 'state'; state: RoomState }
  | { t: 'error'; error: string; fatal: boolean }
  | { t: 'pong'; at: number; server: number };
