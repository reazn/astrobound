// Central mutable run state. Kept tiny and flat.

export interface GameState {
  time: number; // seconds since boot
}

export const game: GameState = {
  time: 0,
};
