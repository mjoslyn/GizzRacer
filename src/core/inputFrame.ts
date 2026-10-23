/**
 * One tick of player intent. Pure data so it can be recorded, replayed,
 * or sent over the network independently of simulation state.
 */
export interface InputFrame {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1 (left) .. 1 (right)
  pitch: number; // -1 (down) .. 1 (up): with the glider open, dive or climb
  drift: boolean;
  driftPressed: boolean; // rising edge this tick
  item: boolean;
  itemPressed: boolean;
  lookBack: boolean;
}

export const NEUTRAL_INPUT: Readonly<InputFrame> = {
  throttle: 0,
  brake: 0,
  steer: 0,
  pitch: 0,
  drift: false,
  driftPressed: false,
  item: false,
  itemPressed: false,
  lookBack: false,
};
