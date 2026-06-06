// Deep Knowledge Tracing inference. Runs the GRU trained offline by tools/train_dkt.py (weights in
// dkt_weights.json) forward over an interaction sequence, predicting P(correct) for each step's skill
// from the history. Reimplements PyTorch's GRU cell exactly (gate order [r, z, n]) so the in-browser
// predictions match the trained model.

import W from "../data/dkt_weights.json";

const H: number = (W as any).H;
const K: number = (W as any).K;
const skills: string[] = (W as any).skills;
const weight_ih: number[][] = (W as any).weight_ih; // (3H, 2K) [r, z, n]
const weight_hh: number[][] = (W as any).weight_hh; // (3H, H)
const bias_ih: number[] = (W as any).bias_ih;       // (3H,)
const bias_hh: number[] = (W as any).bias_hh;       // (3H,)
const out_w: number[][] = (W as any).out_w;         // (K, H)
const out_b: number[] = (W as any).out_b;           // (K,)

const sIdx = new Map(skills.map((s, i) => [s, i]));
const sig = (x: number) => 1 / (1 + Math.exp(-x));

// One GRU step. `c` is the one-hot input column index (skill + correct*K); h is the hidden state.
function cell(c: number, h: number[]): number[] {
  const hhDot = (row: number) => {
    let s = 0;
    const wr = weight_hh[row];
    for (let k = 0; k < H; k++) s += wr[k] * h[k];
    return s;
  };
  const r = new Array(H);
  const z = new Array(H);
  const nh = new Array(H);
  for (let j = 0; j < H; j++) r[j] = sig(weight_ih[j][c] + bias_ih[j] + hhDot(j) + bias_hh[j]);
  for (let j = 0; j < H; j++) {
    const row = H + j;
    z[j] = sig(weight_ih[row][c] + bias_ih[row] + hhDot(row) + bias_hh[row]);
  }
  for (let j = 0; j < H; j++) {
    const row = 2 * H + j;
    const n = Math.tanh(weight_ih[row][c] + bias_ih[row] + r[j] * (hhDot(row) + bias_hh[row]));
    nh[j] = (1 - z[j]) * n + z[j] * h[j];
  }
  return nh;
}

function predict(h: number[], skillIdx: number): number {
  let s = out_b[skillIdx];
  const w = out_w[skillIdx];
  for (let k = 0; k < H; k++) s += w[k] * h[k];
  return sig(s);
}

export type Event = { kc: string; correct: boolean };

// Predict-then-update: prediction for each event uses only prior events (h starts at zero).
export function evalDKT(sequences: Event[][]): { pred: number; correct: boolean }[] {
  const pairs: { pred: number; correct: boolean }[] = [];
  for (const seq of sequences) {
    let h = new Array(H).fill(0);
    for (const e of seq) {
      const si = sIdx.get(e.kc);
      if (si == null) continue;
      pairs.push({ pred: predict(h, si), correct: e.correct });
      h = cell(si + (e.correct ? 1 : 0) * K, h);
    }
  }
  return pairs;
}
