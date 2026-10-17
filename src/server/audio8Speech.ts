// Server-side adapter for Audio8-TTS CPU ONNX Runtime service
// Repository: https://github.com/Edge0-AI/Audio8_TTS

export async function callAudio8Speech({
  baseUrl,
  apiKey,
  text,
  voiceName,
}: {
  baseUrl: string;
  apiKey?: string;
  text: string;
  voiceName?: string;
}): Promise<{ audioBase64: string; mimeType: string; modelUsed: string }> {
  const cleanBaseUrl = baseUrl.trim().replace(/\/$/, '');
  const url = `${cleanBaseUrl}/api/tts`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey && apiKey.trim()) {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    headers['x-api-key'] = apiKey.trim();
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      text: text.trim(),
      voice: voiceName || 'af_heart',
      speed: 1.0,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Audio8-TTS service error (${res.status}): ${errText.slice(0, 120)}`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const json = await res.json();
    if (json.audioBase64) {
      return {
        audioBase64: json.audioBase64,
        mimeType: json.mimeType || 'audio/wav',
        modelUsed: 'Audio8-TTS-ONNX',
      };
    }
  }

  const arrayBuf = await res.arrayBuffer();
  const base64 = Buffer.from(arrayBuf).toString('base64');
  return {
    audioBase64: base64,
    mimeType: 'audio/wav',
    modelUsed: 'Audio8-TTS-ONNX',
  };
}
