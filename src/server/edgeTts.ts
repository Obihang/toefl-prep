import { WebSocket } from 'ws';
import crypto from 'crypto';

export const OUTPUT_FORMAT = {
  AUDIO_24KHZ_48KBITRATE_MONO_MP3: 'audio-24khz-48kbitrate-mono-mp3',
};

export class EdgeTtsError extends Error {
  constructor(public step: string, message: string, public status?: number) {
    super(message);
    this.name = 'EdgeTtsError';
  }
}

export async function synthesizeEdge(
  text: string,
  voice: string,
  rate: number = 1
): Promise<Buffer> {
  const chunks = chunkText(text, 800);
  const audioBuffers: Buffer[] = [];

  for (const chunk of chunks) {
    audioBuffers.push(await synthesizeChunk(chunk, voice, rate));
  }

  return Buffer.concat(audioBuffers);
}

function chunkText(text: string, maxLength: number): string[] {
  const chunks: string[] = [];
  let currentChunk = '';
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > maxLength) {
      chunks.push(currentChunk);
      currentChunk = sentence;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    }
  }
  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

async function synthesizeChunk(text: string, voice: string, rate: number): Promise<Buffer> {
  let attempt = 0;
  const maxRetries = 1;

  while (attempt <= maxRetries) {
    try {
      return await performSynthesis(text, voice, rate);
    } catch (err) {
      attempt++;
      if (attempt > maxRetries) {
        throw err;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new EdgeTtsError('synthesizeChunk', 'Unknown error');
}

async function performSynthesis(text: string, voice: string, rate: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID().replace(/-/g, '');
    const url = 'wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1?Ocp-Apim-Subscription-Key=6A5AA1D4EA6542C85E50B57041075765';
    
    const ws = new WebSocket(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/130.0.0.0 Edg/130.0.0.0',
        'Origin': 'chrome-extension://jdiccldimpdaibcomobbfflhhbcngdbk',
      }
    });

    const audioChunks: Buffer[] = [];
    let isResolved = false;

    const timer = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        try { ws.close(); } catch {}
        reject(new EdgeTtsError('timeout', 'Edge WebSocket timeout', 504));
      }
    }, 15000);

    ws.on('open', () => {
      const timestamp = new Date().toUTCString();
      const config = `X-Timestamp:${timestamp}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataversion":"2020-02-04","format":"audio-24khz-48kbitrate-mono-mp3"}}}}`;
      ws.send(config);

      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='${voice}'><prosody pitch='+0Hz' rate='+${(rate-1)*100}%'>${text}</prosody></voice></speak>`;
      const ssmlMsg = `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`;
      ws.send(ssmlMsg);
    });

    ws.on('message', (data: any, isBinary: boolean) => {
      if (isBinary || Buffer.isBuffer(data)) {
        const headerLen = data.readUInt16BE(0);
        const payload = data.subarray(2 + headerLen);
        if (payload.length > 0) audioChunks.push(Buffer.from(payload));
      } else if (typeof data === 'string' && data.includes('Path:turn.end')) {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timer);
          try { ws.close(); } catch {}
          resolve(Buffer.concat(audioChunks));
        }
      }
    });

    ws.on('close', (code: number) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timer);
        if (code !== 1000) {
          reject(new EdgeTtsError('websocket', `WebSocket closed with code ${code}`, code));
        } else {
          resolve(Buffer.concat(audioChunks));
        }
      }
    });

    ws.on('error', (err: any) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timer);
        reject(new EdgeTtsError('websocket', err.message));
      }
    });
  });
}
