export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;
export const PASS = -1;

export type Color = typeof BLACK | typeof WHITE;
export type Cell = typeof EMPTY | Color;
/** 盤上の点（y * size + x）または PASS */
export type Move = number;

export const opponent = (c: Color): Color => (c === BLACK ? WHITE : BLACK);
