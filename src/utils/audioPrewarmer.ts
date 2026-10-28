import { prefetchSpeechAudio, stripSpeakerAndFormatting, inferGenderFromSpeaker } from './audioSpeech';

export interface PreCacheProgress {
  current: number;
  total: number;
  statusText: string;
  isComplete: boolean;
  error?: string;
}

/**
 * Pre-caches voice audio into IndexedDB for all questions
 * in the active section (Listening or Speaking) so the entire section plays in 0ms.
 */
export async function preCacheSectionAudio(
  section: string,
  onProgress?: (progress: PreCacheProgress) => void
): Promise<{ success: boolean; cached: number; total: number }> {
  const normSection = section.toLowerCase();
  const itemsToFetch: Array<{ text: string; voice: string; gender: 'male' | 'female' }> = [];

  try {
    if (normSection.includes('listen')) {
      const res = await fetch('/question-bank/listening-dialogue.json');
      if (res.ok) {
        const data = await res.json();
        for (const task of data) {
          if (task.script) {
            const lines = String(task.script).split('\n');
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              const spkPrefix = trimmed.split(':')[0] || '';
              const inferred = inferGenderFromSpeaker(spkPrefix);
              const isMale =
                inferred === 'male' ||
                (inferred !== 'female' && /male|mr\.|dr\.\s*(?:davis|alvarez|vance)|prof\./i.test(spkPrefix));
              const gender: 'male' | 'female' = isMale ? 'male' : 'female';
              const voice = isMale ? 'en-US-ChristopherNeural' : 'en-US-AriaNeural';
              const clean = stripSpeakerAndFormatting(trimmed);
              if (clean.length > 5) {
                itemsToFetch.push({ text: clean, voice, gender });
              }
            }
          }
        }
      }
    } else if (normSection.includes('speak')) {
      const lrRes = await fetch('/question-bank/listen-repeat.json');
      if (lrRes.ok) {
        const lrData = await lrRes.json();
        for (const task of lrData) {
          if (Array.isArray(task.sentences)) {
            const isMale = task.speakerGender === 'male';
            const gender: 'male' | 'female' = isMale ? 'male' : 'female';
            const voice = isMale ? 'en-US-ChristopherNeural' : 'en-US-AriaNeural';
            for (const s of task.sentences) {
              const clean = stripSpeakerAndFormatting(String(s));
              if (clean.length > 5) {
                itemsToFetch.push({ text: clean, voice, gender });
              }
            }
          }
        }
      }

      const siRes = await fetch('/question-bank/speaking-interview.json');
      if (siRes.ok) {
        const siData = await siRes.json();
        for (const task of siData) {
          if (Array.isArray(task.questions)) {
            const isFemale = task.interviewerGender === 'female';
            const gender: 'male' | 'female' = isFemale ? 'female' : 'male';
            const voice = isFemale ? 'en-US-AriaNeural' : 'en-US-ChristopherNeural';
            for (const q of task.questions) {
              const qText = typeof q === 'string' ? q : q.question;
              const clean = stripSpeakerAndFormatting(String(qText || ''));
              if (clean.length > 5) {
                itemsToFetch.push({ text: clean, voice, gender });
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[AudioPrewarmer] Failed to load shards for pre-cache:', err);
  }

  // Deduplicate items
  const uniqueItems: Array<{ text: string; voice: string }> = [];
  const seen = new Set<string>();
  for (const it of itemsToFetch) {
    const key = `${it.voice}:::${it.text}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueItems.push(it);
    }
  }

  const total = uniqueItems.length;
  if (total === 0) {
    onProgress?.({
      current: 0,
      total: 0,
      statusText: 'No audio lines found to cache',
      isComplete: true,
    });
    return { success: true, cached: 0, total: 0 };
  }

  let cached = 0;
  for (let i = 0; i < total; i++) {
    const item = uniqueItems[i];
    onProgress?.({
      current: i + 1,
      total,
      statusText: `Caching audio ${i + 1}/${total}...`,
      isComplete: false,
    });

    try {
      await prefetchSpeechAudio(item.text, item.voice);
      cached++;
    } catch (e) {
      // Continue pre-caching remaining lines
    }

    // Small yield to keep UI responsive
    await new Promise((r) => setTimeout(r, 40));
  }

  onProgress?.({
    current: total,
    total,
    statusText: `Pre-cached ${cached}/${total} voice lines (0ms ready)`,
    isComplete: true,
  });

  return { success: true, cached, total };
}
