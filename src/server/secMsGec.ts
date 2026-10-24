// Sec-MS-GEC token generator (v2), a faithful port of rany2/edge-tts `drm.py` (edge-tts 7.3.x).
// Verified against the Python implementation: see scripts/edge-tts-sim.ts for test vectors.
// Microsoft rejects the old plain-SHA256 token, so do not "simplify" this.
const SHA256_INITIAL: number[] = [0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19];
const SHA256_STATE: number[] = [0xFD9FBEA2, 0x91243CE7, 0xBE499094, 0xCD2E1E0A, 0x6C006F49, 0x04BD35AB, 0xFEB0A7E4, 0x03EFFBD2];
const SHA256_SCHEDULE: number[] = [0xEB24BF9E, 0x1558691F, 0xA0C09EE2, 0x0CFA32BA, 0xA622EE8C, 0xD1DD9491, 0xC0DD25A0, 0xF9E70AB6, 0xF0C31573, 0x7058CE4E, 0x7188E606, 0x00E5AB33, 0xD258B060, 0x72766564];
const SHA256_ROUND_CONSTANTS: number[] = [0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5, 0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5, 0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3, 0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174, 0xE49B69C1, 0xEFBE4786, 0x0FC19DC6, 0x240CA1CC, 0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA, 0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7, 0xC6E00BF3, 0xD5A79147, 0x06CA6351, 0x14292967, 0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13, 0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85, 0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3, 0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070, 0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5, 0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3, 0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208, 0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2];
const SHA256_ADJUSTMENT = 0xC9DC06A7;
const SHA256_SIGMA0_ADJUSTMENT = 0x059C0B80;
const SHA256_SIGMA1_ADJUSTMENT = 0x000B92C0;
const CS64_COEFFICIENTS: Array<[number, number]> = [[0xE82E91B1, 0xB32700D0], [0x44DE24C6, 0x88DFF51D], [0x3BEB65BC, 0x29514038], [0xC89C5933, 0xB328CBDF], [0x8D1EC211, 0xD405B4D5], [0x314EF5D5, 0x26E55F3C], [0xE92491B1, 0x607801C6], [0xF0A5B9D5, 0x82B2C1FB], [0x06064CF3, 0xFA51A3DA], [0xDA79FA60, 0x207CC464], [0xBED20560, 0x3C3C74F3], [0x89F9C9F8, 0xD2D14B61], [0x35FA38C6, 0xBB04A2C1], [0xCB49E3C6, 0xC5626167]];
const CS64_FACTOR = 0x82893933;
const CS64_ADJUSTMENT0 = 0xF2F90B1A;
const CS64_ADJUSTMENT1 = 0x0B1A0000;
const rol16 = (v: number): number => (((v << 16) | (v >>> 16)) >>> 0);
const rotr = (v: number, n: number): number => ((v >>> n) | (v << (32 - n))) >>> 0;
const sigma0 = (v: number): number => (rotr(v, 7) ^ rotr(v, 18) ^ (v >>> 3)) >>> 0;
const sigma1 = (v: number): number => (rotr(v, 17) ^ rotr(v, 19) ^ (v >>> 10)) >>> 0;
const add = (...xs: number[]): number => xs.reduce((a, b) => (a + b) >>> 0, 0);
const mul = (a: number, b: number): number => Math.imul(a, b) >>> 0;

function expandSchedule(words: number[], first = 16): void {
  for (let i = first; i < 64; i++) {
    words[i] = add(sigma1(words[i - 2]), words[i - 7], sigma0(words[i - 15]), words[i - 16]);
  }
}

function sha256Rounds(state: number[], words: number[], firstRound = 0): number[] {
  let [a, b, c, d, e, f, g, h] = state;
  const K = firstRound === 14
    ? [...SHA256_ROUND_CONSTANTS.slice(0, 14), SHA256_ADJUSTMENT, ...SHA256_ROUND_CONSTANTS.slice(15)]
    : SHA256_ROUND_CONSTANTS;
  for (let i = firstRound; i < 64; i++) {
    const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
    const ch = (g ^ (e & (f ^ g))) >>> 0;
    const t1 = add(h, S1, ch, K[i], words[i]);
    const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
    const maj = ((a & b) | (c & (a | b))) >>> 0;
    const t2 = add(S0, maj);
    h = g; g = f; f = e; e = add(d, t1); d = c; c = b; b = a; a = add(t1, t2);
  }
  return [a, b, c, d, e, f, g, h];
}

function sha256Init(data7: Uint8Array): number[] {
  const words: number[] = new Array(14).fill(0);
  words.push(((data7[0] << 16) | (data7[1] << 8) | data7[2]) >>> 0);
  words.push(((data7[3] << 24) | (data7[4] << 16) | (data7[5] << 8) | data7[6]) >>> 0);
  for (let index = 16; index < 30; index++) {
    let value = SHA256_SCHEDULE[index - 16];
    if (index - 2 >= 14) {
      value += index === 16 ? ((sigma1(words[index - 2]) ^ SHA256_SIGMA1_ADJUSTMENT) >>> 0) : sigma1(words[index - 2]);
    }
    if (index - 7 >= 14) value += words[index - 7];
    if (index - 15 >= 14) {
      value += index === 29 ? ((sigma0(words[index - 15]) ^ SHA256_SIGMA0_ADJUSTMENT) >>> 0) : sigma0(words[index - 15]);
    }
    words.push(value >>> 0);
  }
  words.push(add(sigma1(words[28]), words[23], sigma0(words[15]), words[14], SHA256_ADJUSTMENT, (-SHA256_ROUND_CONSTANTS[14]) >>> 0));
  expandSchedule(words, 31);
  const working = sha256Rounds(SHA256_STATE, words, 14);
  return SHA256_INITIAL.map((x, i) => add(x, working[i]));
}

function sha256Digest(data: Buffer): Buffer {
  if (data.length < 7) throw new Error('Token salt must contain at least seven bytes');
  const length = 57 + data.length;
  const tail = data.subarray(7);
  const padLen = (((55 - length) % 64) + 64) % 64;
  const padded = Buffer.alloc(tail.length + 1 + padLen + 8);
  Buffer.from(tail).copy(padded, 0);
  padded[tail.length] = 0x80;
  padded.writeBigUInt64BE(BigInt(length) * 8n, padded.length - 8);
  let state = sha256Init(data.subarray(0, 7));
  for (let off = 0; off < padded.length; off += 64) {
    const words: number[] = [];
    for (let i = 0; i < 16; i++) words.push(padded.readUInt32BE(off + i * 4));
    expandSchedule(words);
    const working = sha256Rounds(state, words);
    state = state.map((x, i) => add(x, working[i]));
  }
  const out = Buffer.alloc(32);
  state.forEach((w, i) => out.writeUInt32BE(w, i * 4));
  return out;
}

function wordsLe4Even(data: Buffer): number[] {
  const padded = Buffer.concat([data, Buffer.alloc((4 - (data.length % 4)) % 4)]);
  const words: number[] = [];
  for (let i = 0; i < padded.length; i += 4) words.push(padded.readUInt32LE(i));
  if (words.length % 2) words.push(0);
  return words;
}

function cs64Digest(data: Buffer, digest: Buffer): [number, number] {
  const keyA = (digest.readUInt32LE(0) | 1) >>> 0;
  const keyB = (digest.readUInt32LE(4) | 1) >>> 0;
  const factors = [mul(keyA, CS64_FACTOR), mul(keyB, CS64_FACTOR)];
  const terms = CS64_COEFFICIENTS.map(([coef], i) => mul(coef, factors[i % 2]));
  const offsets = CS64_COEFFICIENTS.map(([, off]) => off);
  wordsLe4Even(Buffer.concat([Buffer.from([0]), data])).forEach((word, index) => {
    let term = mul(word, index % 2 === 0 ? keyA : keyB);
    let offset = mul(rol16(word), index % 2 === 0 ? 0xEF0569FB : 0xC31713DB);
    if (index === 0) {
      term = add(term, mul(CS64_ADJUSTMENT0, factors[0]));
      offset = add(offset, CS64_ADJUSTMENT1);
    }
    terms.push(term);
    offsets.push(offset);
  });
  let swapAcc = 0, swapLast = 0, state = 0, acc = 0;
  for (let i = 0; i < terms.length; i += 2) {
    const x = terms[i], y = terms[i + 1];
    let t = rol16(add(offsets[i], x));
    let q = mul(t, 0x76F50F34);
    swapAcc = add(swapAcc, add(mul(rol16(q), 0xC3EFEA97), q));
    t = rol16(add(offsets[i + 1], y));
    q = mul(t, 0x1881CE3C);
    swapLast = add(mul(rol16(q), 0x35BD1EC9), q);
    swapAcc = add(swapAcc, swapLast);

    state = add(mul(state, keyA), x);
    state = mul(rol16(state), 0xCF98B111);
    state = mul(rol16(state), 0x87085B9F);
    state = mul(rol16(state), 0x12CEB96D);
    state = mul(rol16(state), 0x257E1D83);
    acc = add(acc, state);
    t = add(mul(state, keyB), y);
    t = mul(rol16(t), 0xA27416F5);
    t = mul(rol16(t), 0xD38396FF);
    state = mul(rol16(mul(rol16(t), 0x7C932B89)), 0xBFA49F69);
    acc = add(acc, state);
  }
  return [(swapLast ^ state) >>> 0, (swapAcc ^ acc) >>> 0];
}

export const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const WIN_EPOCH = 11644473600;

export function generateSecMsGecV2(unixSeconds: number = Date.now() / 1000): string {
  let ticks = unixSeconds + WIN_EPOCH;
  ticks -= ticks % 300;
  const windowsTicks = BigInt(Math.round(ticks)) * 10000000n;
  const data = Buffer.from(`${windowsTicks}${TRUSTED_CLIENT_TOKEN}`, 'ascii');
  const digest = sha256Digest(data);
  const [a, b] = cs64Digest(data, digest);
  const cs = Buffer.alloc(8);
  cs.writeUInt32LE(a, 0);
  cs.writeUInt32LE(b, 4);
  return `${cs.toString('hex').toUpperCase()}-${digest.toString('hex').toUpperCase()}`;
}
