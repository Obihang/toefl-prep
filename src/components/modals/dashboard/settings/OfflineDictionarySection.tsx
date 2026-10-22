import React, { useState, useEffect } from 'react';
import { BookOpen, Download, Trash2, CheckCircle2, RefreshCw, Loader2, Database } from 'lucide-react';
import {
  getOfflineWordCount,
  clearOfflineDictionary,
  startOfflineDictionaryDownload,
  DownloadProgress,
} from '../../../../utils/offlineDictionary';

export const OfflineDictionarySection: React.FC = () => {
  const [wordCount, setWordCount] = useState<number>(0);
  const [loadingCount, setLoadingCount] = useState(true);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [cancelFn, setCancelFn] = useState<(() => void) | null>(null);

  const refreshCount = async () => {
    setLoadingCount(true);
    const count = await getOfflineWordCount();
    setWordCount(count);
    setLoadingCount(false);
  };

  useEffect(() => {
    refreshCount();

    const handleUpdate = () => refreshCount();
    window.addEventListener('offlineDictionaryUpdated', handleUpdate);
    return () => {
      window.removeEventListener('offlineDictionaryUpdated', handleUpdate);
      if (cancelFn) cancelFn();
    };
  }, []);

  const handleStartDownload = () => {
    if (downloadProgress && (downloadProgress.stage === 'downloading' || downloadProgress.stage === 'indexing')) {
      return;
    }

    setDownloadProgress({
      stage: 'downloading',
      percent: 5,
      message: 'Connecting to dictionary CDN (~5MB)...',
    });

    const cancel = startOfflineDictionaryDownload((progress) => {
      setDownloadProgress(progress);
      if (progress.stage === 'ready') {
        refreshCount();
        setCancelFn(null);
      } else if (progress.stage === 'error') {
        setCancelFn(null);
      }
    });

    setCancelFn(() => cancel);
  };

  const handleCancelDownload = () => {
    if (cancelFn) {
      cancelFn();
      setCancelFn(null);
    }
    setDownloadProgress(null);
  };

  const handleClear = async () => {
    if (window.confirm('Are you sure you want to clear the offline dictionary database?')) {
      await clearOfflineDictionary();
      setDownloadProgress(null);
      await refreshCount();
    }
  };

  const isDownloading = downloadProgress && (downloadProgress.stage === 'downloading' || downloadProgress.stage === 'indexing');
  const isInstalled = wordCount > 50000;

  return (
    <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3.5">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 shrink-0">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h5 className="text-xs font-bold text-slate-900">Offline English Dictionary Package</h5>
              {loadingCount ? (
                <Loader2 className="w-3 h-3 text-slate-400 animate-spin" />
              ) : isInstalled ? (
                <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded-full flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Cached Offline ({wordCount.toLocaleString()} words)
                </span>
              ) : (
                <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded-full">
                  Not Installed ({wordCount > 0 ? `${wordCount.toLocaleString()} words` : '0 words'})
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              100,000+ complete Webster definitions stored in local IndexedDB for instantaneous 0ms offline pop-up lookups.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {!isDownloading && (
            <button
              type="button"
              onClick={handleStartDownload}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                isInstalled
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  : 'bg-teal-800 hover:bg-teal-900 text-white'
              }`}
            >
              {isInstalled ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  Re-download / Update
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  📦 Download Offline English Dictionary (~5MB)
                </>
              )}
            </button>
          )}

          {isDownloading && (
            <button
              type="button"
              onClick={handleCancelDownload}
              className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold transition cursor-pointer"
            >
              Cancel
            </button>
          )}

          {isInstalled && !isDownloading && (
            <button
              type="button"
              onClick={handleClear}
              title="Delete offline dictionary from IndexedDB"
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Live Download / Indexing Progress */}
      {downloadProgress && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-800 flex items-center gap-2">
              {downloadProgress.stage === 'ready' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : downloadProgress.stage === 'error' ? (
                <span className="text-rose-600 font-bold">Error:</span>
              ) : (
                <Loader2 className="w-3.5 h-3.5 text-teal-600 animate-spin" />
              )}
              {downloadProgress.message}
            </span>
            <span className="font-mono text-slate-600 font-bold">
              {downloadProgress.stage === 'ready' ? '100%' : `${downloadProgress.percent}%`}
            </span>
          </div>

          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 rounded-full ${
                downloadProgress.stage === 'ready'
                  ? 'bg-emerald-600'
                  : downloadProgress.stage === 'error'
                  ? 'bg-rose-500'
                  : 'bg-teal-600'
              }`}
              style={{ width: `${Math.max(4, downloadProgress.percent)}%` }}
            />
          </div>

          {downloadProgress.stage === 'indexing' && downloadProgress.count !== undefined && downloadProgress.total && (
            <p className="text-[10px] text-slate-500">
              Bulk inserting records in background Web Worker: {downloadProgress.count.toLocaleString()} / {downloadProgress.total.toLocaleString()}
            </p>
          )}

          {downloadProgress.stage === 'ready' && (
            <p className="text-[11px] text-emerald-700 font-medium">
              ✅ Dictionary package is 100% indexed in IndexedDB (<code className="font-mono text-emerald-800">offline_dictionary</code>). Highlighting any word will now open instantaneous local definitions!
            </p>
          )}

          {downloadProgress.stage === 'error' && (
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-rose-600 font-medium">
                Download failed. Please check your internet connection and try again.
              </p>
              <button
                type="button"
                onClick={handleStartDownload}
                className="text-xs text-teal-800 font-bold underline"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
