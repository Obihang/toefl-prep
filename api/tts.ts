import type { VercelRequest, VercelResponse } from '@vercel/node';

function splitTextIntoSentences(text: string, maxLen = 180): string[] {
  if (!text) return [];
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks: string[] = [];

  for (const raw of sentences) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.length <= maxLen) {
      chunks.push(trimmed);
    } else {
      const words = trimmed.split(/\s+/);
      let current = '';
      for (const word of words) {
        if ((current + ' ' + word).trim().length <= maxLen) {
          current = (current + ' ' + word).trim();
        } else {
          if (current) chunks.push(current);
          current = word;
        }
      }
      if (current) chunks.push(current);
    }
  }

  return chunks.length > 0 ? chunks : [text.trim()];
}

function stripSpeakerAndFormatting(text: string): string {
  if (!text) return '';
  let cleaned = text.trim();
  cleaned = cleaned.replace(
    /^\s*(?:\*\*|__)?\[?\s*(?:Speaker\s*[A-Z0-9]*|Student\s*[A-Z0-9]*|Professor|Prof\.?\s*\w*|Doctor\s*\w*|Dr\.?\s*\w*|Narrator|Man|Woman|Male|Female|Interviewer|Participant|Person\s*[A-Z0-9]*|Faculty|Instructor|Advisor|[A-Z][a-zA-Z0-9.\s'-]{0,28}?)\s*\]?(?:\s*\([^)]*\))?(?:\*\*|__)?\s*:\s*/gim,
    ''
  );
  cleaned = cleaned.replace(/\[[^\]]*\]/g, ' ');
  cleaned = cleaned.replace(/\((?:pauses?|sighs?|laughs?|chuckles?|clears throat|applause|cheering|coughing|sound|music|gasp|whispering|shouting|silence|interrupted)\)/gi, ' ');
  cleaned = cleaned.replace(/[*_#`>]+/g, ' ');
  return cleaned.replace(/\s+/g, ' ').trim();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  try {
    const { text, speaker } = req.body || {};
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'No text provided' });
    }

    const cleanText = stripSpeakerAndFormatting(text);
    if (!cleanText) {
      return res.status(200).json({
        success: true,
        audioUrl: '',
        mimeType: 'audio/mpeg',
        modelUsed: 'Empty text',
      });
    }

    const chunks = splitTextIntoSentences(cleanText, 180);
    const normSpk = (speaker || '').toLowerCase();
    let accent = 'en-US';
    if (normSpk.includes('b') || normSpk.includes('2') || normSpk.includes('prof')) {
      accent = 'en-GB';
    } else if (normSpk.includes('c') || normSpk.includes('dean')) {
      accent = 'en-AU';
    }

    const buffers: Buffer[] = [];
    for (const chunk of chunks) {
      const url = `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${accent}&q=${encodeURIComponent(chunk)}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://translate.google.com/',
        },
      });

      if (response.ok) {
        const arrBuf = await response.arrayBuffer();
        if (arrBuf && arrBuf.byteLength > 0) {
          buffers.push(Buffer.from(arrBuf));
        }
      }
    }

    if (buffers.length === 0) {
      return res.status(500).json({ success: false, error: 'TTS synthesis stream failed' });
    }

    const finalBuffer = Buffer.concat(buffers);
    const audioUrl = `data:audio/mpeg;base64,${finalBuffer.toString('base64')}`;

    return res.status(200).json({
      success: true,
      audioUrl,
      mimeType: 'audio/mpeg',
      modelUsed: `Neural Stream (${accent})`,
    });
  } catch (error: any) {
    console.error('API TTS error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Server error' });
  }
}

