// Edge "Read Aloud" TTS client (no API key needed).
// Protocol, constants and the Sec-MS-GEC token follow rany2/edge-tts 7.3.x (the maintained reference).
// Kept dependency-free apart from `ws`, and verified against the Python client in scripts/edge-tts-sim.ts.
import { WebSocket } from 'ws';
import crypto from 'node:crypto';
import { generateSecMsGecV2, TRUSTED_CLIENT_TOKEN } from './secMsGec.ts';

export const OUTPUT_FORMAT = {
  AUDIO_24KHZ_48KBITRATE_MONO_MP3: 'audio-24khz-48kbitrate-mono-mp3',
};

export const CHROMIUM_FULL_VERSION = '143.0.3650.75';
const CHROMIUM_MAJOR = CHROMIUM_FULL_VERSION.split('.')[0];
export const SEC_MS_GEC_VERSION = `2-${CHROMIUM_FULL_VERSION}`;
const BASE_URL = 'speech.platform.bing.com/consumer/speech/synthesize/readaloud';
export const DEFAULT_WSS_URL = `wss://${BASE_URL}/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;
export const VOICE_LIST_URL = `https://${BASE_URL}/voices/list?trustedclienttoken=${TRUSTED_CLIENT_TOKEN}`;

const USER_AGENT =
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ` +
  `Chrome/${CHROMIUM_MAJOR}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR}.0.0.0`;

export class EdgeTtsError extends Error {
  constructor(public step: string, message: string, public status?: number) {
    super(message);
    this.name = 'EdgeTtsError';
  }
}

export interface EdgeTtsOptions {
  /** Override the WebSocket URL (tests only). Must already contain the TrustedClientToken query. */
  wssUrl?: string;
  timeoutMs?: number;
  maxAttempts?: number;
  pitch?: string; // like "+0Hz"
  volume?: string; // like "+0%"
}

// ---- clock skew (Microsoft rejects tokens when the server clock is off; fixed via the Date header) ----
let clockSkewSeconds = 0;
const nowSeconds = () => Date.now() / 1000 + clockSkewSeconds;
export const getClockSkewSeconds = () => clockSkewSeconds;
export const resetClockSkew = () => { clockSkewSeconds = 0; };
function adjustSkewFromDateHeader(dateHeader: string | undefined): boolean {
  if (!dateHeader) return false;
  const serverMs = Date.parse(dateHeader);
  if (Number.isNaN(serverMs)) return false;
  clockSkewSeconds += serverMs / 1000 - nowSeconds();
  return true;
}

const muidCookie = () => `muid=${crypto.randomBytes(16).toString('hex').toUpperCase()};`;
const connectId = () => crypto.randomUUID().replace(/-/g, '');

function dateToString(): string {
  const d = new Date();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${days[d.getUTCDay()]} ${months[d.getUTCMonth()]} ${p(d.getUTCDate())} ${d.getUTCFullYear()} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} GMT+0000 (Coordinated Universal Time)`
  );
}

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const removeIncompatibleChars = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ');

/** "en-US-GuyNeural" -> "Microsoft Server Speech Text to Speech Voice (en-US, GuyNeural)" (what Edge sends). */
export function normalizeEdgeVoice(voice: string): string {
  const m = /^([a-z]{2,})-([A-Z]{2,})-(.+Neural)$/.exec(voice);
  if (m) {
    const lang = m[1];
    let region = m[2];
    let name = m[3];
    const dash = name.indexOf('-');
    if (dash !== -1) {
      region = `${region}-${name.slice(0, dash)}`;
      name = name.slice(dash + 1);
    }
    return `Microsoft Server Speech Text to Speech Voice (${lang}-${region}, ${name})`;
  }
  if (!/^Microsoft Server Speech Text to Speech Voice \(.+,.+\)$/.test(voice)) {
    throw new EdgeTtsError('config', `Invalid voice '${voice}'`);
  }
  return voice;
}

/** Playback speed multiplier (1 = normal) -> SSML rate like "+20%" / "-10%". */
export function rateToSsml(rate: number | string = 1): string {
  if (typeof rate === 'string') {
    if (!/^[+-]\d+%$/.test(rate)) throw new EdgeTtsError('config', `Invalid rate '${rate}'`);
    return rate;
  }
  const pct = Math.max(-50, Math.min(100, Math.round((rate - 1) * 100)));
  return `${pct >= 0 ? '+' : '-'}${Math.abs(pct)}%`;
}

export function chunkText(text: string, maxLength = 800): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let current = '';
  const push = () => { if (current) { chunks.push(current); current = ''; } };
  for (const sentence of clean.split(/(?<=[.!?])\s+/)) {
    if (sentence.length > maxLength) {
      push();
      for (const word of sentence.split(' ')) {
        if (word.length > maxLength) {
          // a single "word" longer than the limit (URLs, junk): hard-split it
          push();
          for (let i = 0; i < word.length; i += maxLength) chunks.push(word.slice(i, i + maxLength));
          continue;
        }
        if ((current + ' ' + word).trim().length > maxLength) push();
        current = (current + ' ' + word).trim();
      }
      continue;
    }
    if ((current + ' ' + sentence).trim().length > maxLength) push();
    current = (current + ' ' + sentence).trim();
  }
  push();
  return chunks;
}

export async function synthesizeEdge(
  text: string,
  voice: string,
  rate: number | string = 1,
  options: EdgeTtsOptions = {}
): Promise<Buffer> {
  const chunks = chunkText(text, 800);
  if (chunks.length === 0) throw new EdgeTtsError('config', 'No text to synthesize');
  const ssmlVoice = normalizeEdgeVoice(voice);
  const ssmlRate = rateToSsml(rate);
  const buffers: Buffer[] = [];
  for (const chunk of chunks) {
    buffers.push(await synthesizeChunkWithRetry(chunk, ssmlVoice, ssmlRate, options));
  }
  return Buffer.concat(buffers);
}

async function synthesizeChunkWithRetry(text: string, voice: string, rate: string, options: EdgeTtsOptions): Promise<Buffer> {
  const maxAttempts = options.maxAttempts ?? 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await performSynthesis(text, voice, rate, options);
    } catch (err) {
      lastError = err;
      const status = err instanceof EdgeTtsError ? err.status : undefined;
      // 401/404 style errors will not be fixed by retrying; 403 may be fixed by the clock skew adjustment.
      if (status === 404 || status === 401) break;
      if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 300 * attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new EdgeTtsError('unknown', String(lastError));
}

function performSynthesis(text: string, voice: string, rate: string, options: EdgeTtsOptions): Promise<Buffer> {
  const timeoutMs = options.timeoutMs ?? 15000;
  const base = options.wssUrl ?? DEFAULT_WSS_URL;
  const url =
    `${base}&ConnectionId=${connectId()}` +
    `&Sec-MS-GEC=${generateSecMsGecV2(nowSeconds())}` +
    `&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;

  return new Promise<Buffer>((resolve, reject) => {
    const ws = new WebSocket(url, {
      perMessageDeflate: true,
      headers: {
        Pragma: 'no-cache',
        'Cache-Control': 'no-cache',
        Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'User-Agent': USER_AGENT,
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'en-US,en;q=0.9',
        Cookie: muidCookie(),
      },
    });
    const audio: Buffer[] = [];
    let settled = false;
    const finish = (err: Error | null, value?: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.terminate(); } catch { /* ignore */ }
      if (err) reject(err); else resolve(value as Buffer);
    };
    const timer = setTimeout(
      () => finish(new EdgeTtsError('timeout', `Edge TTS timed out after ${timeoutMs} ms`, 504)),
      timeoutMs
    );

    // A non-101 answer to the WebSocket upgrade (for example 403 or 200) lands here.
    ws.on('unexpected-response', (_req, res) => {
      const status = res.statusCode;
      if (status === 403) adjustSkewFromDateHeader(res.headers['date'] as string | undefined);
      let body = '';
      res.on('data', (c: Buffer) => { if (body.length < 400) body += c.toString('utf8'); });
      const report = () =>
        finish(new EdgeTtsError(
          'handshake',
          `Unexpected server response: ${status}${body ? ` - ${body.replace(/\s+/g, ' ').slice(0, 300)}` : ''}`,
          status
        ));
      res.on('end', report);
      res.on('error', report);
    });
    ws.on('error', (err) => finish(new EdgeTtsError('websocket', err.message || 'WebSocket error')));
    ws.on('open', () => {
      ws.send(
        `X-Timestamp:${dateToString()}\r\n` +
        'Content-Type:application/json; charset=utf-8\r\n' +
        'Path:speech.config\r\n\r\n' +
        '{"context":{"synthesis":{"audio":{"metadataoptions":{' +
        '"sentenceBoundaryEnabled":"true","wordBoundaryEnabled":"false"},' +
        `"outputFormat":"${OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3}"}}}}\r\n`
      );
      const ssml =
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
        `<voice name='${voice}'><prosody pitch='${options.pitch ?? '+0Hz'}' rate='${rate}' volume='${options.volume ?? '+0%'}'>` +
        `${escapeXml(removeIncompatibleChars(text))}</prosody></voice></speak>`;
      ws.send(
        `X-RequestId:${connectId()}\r\n` +
        'Content-Type:application/ssml+xml\r\n' +
        `X-Timestamp:${dateToString()}Z\r\n` + // the trailing Z is intentional (matches Edge)
        'Path:ssml\r\n\r\n' +
        ssml
      );
    });
    ws.on('message', (data, isBinary) => {
      if (!isBinary) {
        if (data.toString().includes('Path:turn.end')) {
          const out = Buffer.concat(audio);
          return out.length > 0
            ? finish(null, out)
            : finish(new EdgeTtsError('no-audio', 'No audio was received. Check the voice name and text.'));
        }
        return;
      }
      const buf = Buffer.isBuffer(data) ? data : Buffer.concat(data as Buffer[]);
      if (buf.length < 2) return;
      const headerLen = buf.readUInt16BE(0);
      const headers = buf.subarray(2, 2 + headerLen).toString('utf8');
      if (!/Path:audio/.test(headers)) return;
      const payload = buf.subarray(2 + headerLen);
      if (payload.length > 0) audio.push(Buffer.from(payload));
    });
    ws.on('close', (code) =>
      finish(new EdgeTtsError('closed', `Connection closed (code ${code}) before synthesis finished`, code))
    );
  });
}

export interface EdgeVoice {
  Name: string;
  ShortName: string;
  Gender: string;
  Locale: string;
  FriendlyName?: string;
  [key: string]: unknown;
}

/** Lists voices from the same service (used for the voice dropdown and the health check). */
export async function listEdgeVoices(): Promise<EdgeVoice[]> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await fetch(
      `${VOICE_LIST_URL}&Sec-MS-GEC=${generateSecMsGecV2(nowSeconds())}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`,
      {
        headers: {
          Authority: 'speech.platform.bing.com',
          'Sec-CH-UA': `" Not;A Brand";v="99", "Microsoft Edge";v="${CHROMIUM_MAJOR}", "Chromium";v="${CHROMIUM_MAJOR}"`,
          'Sec-CH-UA-Mobile': '?0',
          Accept: '*/*',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Dest': 'empty',
          'User-Agent': USER_AGENT,
          'Accept-Language': 'en-US,en;q=0.9',
          Cookie: muidCookie(),
        },
      }
    );
    if (res.ok) return (await res.json()) as EdgeVoice[];
    lastErr = new EdgeTtsError('voices', `Voice list request failed: HTTP ${res.status}`, res.status);
    if (res.status === 403 && adjustSkewFromDateHeader(res.headers.get('date') ?? undefined)) continue;
    break;
  }
  throw lastErr as Error;
}
