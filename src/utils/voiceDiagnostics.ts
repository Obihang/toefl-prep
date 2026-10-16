// Diagnostic utility for Web Speech API / speechSynthesis voice detection troubleshooting

export interface VoiceDiagnosticResult {
  hasSpeechSynthesis: boolean;
  voicesCount: number;
  languages: string[];
  voicesList: Array<{ name: string; lang: string; localService: boolean }>;
  isAsynchronousLoading: boolean;
  diagnosticMessage: string;
}

export async function runVoiceDiagnostic(): Promise<VoiceDiagnosticResult> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return {
      hasSpeechSynthesis: false,
      voicesCount: 0,
      languages: [],
      voicesList: [],
      isAsynchronousLoading: false,
      diagnosticMessage: 'Web Speech API (speechSynthesis) is not supported in this browser environment.',
    };
  }

  let voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) {
    // Wait for asynchronous onvoiceschanged event (up to 1500ms)
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 1500);
      window.speechSynthesis.onvoiceschanged = () => {
        clearTimeout(timer);
        resolve(null);
      };
    });
    voices = window.speechSynthesis.getVoices();
  }

  const voicesList = voices.map((v) => ({
    name: v.name,
    lang: v.lang,
    localService: v.localService,
  }));

  const languages = Array.from(new Set(voices.map((v) => v.lang))).sort();
  const hasEnglish = languages.some((l) => l.toLowerCase().startsWith('en'));

  let diagnosticMessage = '';
  if (voices.length === 0) {
    diagnosticMessage = 'No system speech voices detected. Common cause: operating system or browser lacks local TTS packages (e.g. speech-dispatcher / espeak-ng on Linux containers, or speech synthesis is disabled in browser privacy settings).';
  } else if (!hasEnglish) {
    diagnosticMessage = `Detected ${voices.length} voices, but NO English voices were found (Available languages: ${languages.join(', ') || 'none'}).`;
  } else {
    diagnosticMessage = `Successfully detected ${voices.length} voices across ${languages.length} language codes (English speech available).`;
  }

  return {
    hasSpeechSynthesis: true,
    voicesCount: voices.length,
    languages,
    voicesList,
    isAsynchronousLoading: voices.length === 0,
    diagnosticMessage,
  };
}
