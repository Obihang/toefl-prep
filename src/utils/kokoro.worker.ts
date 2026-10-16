import { KokoroTTS } from 'kokoro-js';

let ttsInstance: KokoroTTS | null = null;
let isLoading = false;
let initPromise: Promise<any> | null = null;

self.onmessage = async (e: MessageEvent) => {
  const data = e.data || {};
  const { type, id, text, voice } = data;

  if (type === 'init') {
    if (ttsInstance) {
      self.postMessage({
        type: 'init-success',
        voices: Object.keys(ttsInstance.voices || {}),
      });
      return;
    }
    if (initPromise) {
      try {
        const voices = await initPromise;
        self.postMessage({
          type: 'init-success',
          voices,
        });
      } catch (err: any) {
        self.postMessage({
          type: 'init-error',
          error: err?.message || String(err),
        });
      }
      return;
    }

    isLoading = true;
    initPromise = (async () => {
      const hasWebGpu = typeof navigator !== 'undefined' && 'gpu' in navigator && !!(navigator as any).gpu;
      const device = hasWebGpu ? 'webgpu' : 'wasm';

      ttsInstance = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
        dtype: 'q8',
        device,
        progress_callback: (progress: any) => {
          let pct = 0;
          if (typeof progress?.progress === 'number') {
            pct = progress.progress <= 1 ? Math.round(progress.progress * 100) : Math.round(progress.progress);
          } else if (typeof progress?.loaded === 'number' && typeof progress?.total === 'number' && progress.total > 0) {
            pct = Math.round((progress.loaded / progress.total) * 100);
          }
          self.postMessage({
            type: 'progress',
            progress: pct,
            status: progress?.status || 'downloading',
            file: progress?.file,
          });
        },
      });

      await ttsInstance.generate('Hello.', { voice: 'af_heart' });
      return Object.keys(ttsInstance.voices || {});
    })();

    try {
      const voices = await initPromise;
      isLoading = false;
      self.postMessage({
        type: 'init-success',
        voices,
      });
    } catch (err: any) {
      isLoading = false;
      ttsInstance = null;
      initPromise = null;
      self.postMessage({
        type: 'init-error',
        error: err?.message || String(err),
      });
    }
    return;
  }

  if (type === 'generate') {
    if (!ttsInstance) {
      self.postMessage({
        type: 'generate-error',
        id,
        error: 'Offline voice model is not loaded',
      });
      return;
    }

    try {
      const rawAudio = await ttsInstance.generate(text, {
        voice: voice || 'af_heart',
        speed: 1,
      });

      const wavBlob = rawAudio.toBlob();
      const arrayBuffer = await wavBlob.arrayBuffer();

      (self as any).postMessage(
        {
          type: 'generate-success',
          id,
          buffer: arrayBuffer,
          samplingRate: rawAudio.sampling_rate || 24000,
        },
        [arrayBuffer]
      );
    } catch (err: any) {
      self.postMessage({
        type: 'generate-error',
        id,
        error: err?.message || String(err),
      });
    }
    return;
  }
};
