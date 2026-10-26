import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Activity,
  Server,
  Cpu,
  Database,
  Volume2,
  Mic,
  RefreshCw,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Send,
  Radio,
} from 'lucide-react';
import { collection, query, limit, getDocs } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import {
  PROVIDERS,
  ApiProvider,
  getStoredApiKey,
  getStoredTranscriberKey,
  getAuthHeaders,
} from '../../utils/apiKey';
import { redactSensitiveInfo } from '../../utils/redact';

interface SystemStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type CheckStatus = 'checking' | 'ok' | 'failed';

interface CheckState {
  status: CheckStatus;
  detail: string;
  error?: string;
  lastChecked?: string;
}

export const SystemStatusModal: React.FC<SystemStatusModalProps> = ({ isOpen, onClose }) => {
  const [serverCheck, setServerCheck] = useState<CheckState>({ status: 'checking', detail: 'Connecting to server...' });
  const [aiCheck, setAiCheck] = useState<CheckState>({ status: 'checking', detail: 'Checking AI providers...' });
  const [dbCheck, setDbCheck] = useState<CheckState>({ status: 'checking', detail: 'Querying Firestore database...' });
  const [voiceCheck, setVoiceCheck] = useState<CheckState>({ status: 'checking', detail: 'Testing TTS voice service...' });
  const [sttCheck, setSttCheck] = useState<CheckState>({ status: 'checking', detail: 'Inspecting speech engines...' });

  const [copied, setCopied] = useState<boolean>(false);
  const [testErrorNotice, setTestErrorNotice] = useState<string | null>(null);

  // STT Microphone Test State
  const [isMicTesting, setIsMicTesting] = useState<boolean>(false);
  const [micTestResult, setMicTestResult] = useState<string | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  const formatTimestamp = () => {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Helper to safely parse API response ensuring plain-text backend errors are handled cleanly without crashing
  const safeParseResponse = async (res: Response): Promise<any> => {
    const contentType = res.headers.get('content-type');
    let data: any;
    if (contentType && contentType.includes('application/json')) {
      data = await res.json();
    } else {
      const text = await res.text();
      throw new Error(`Server returned plain text: ${text.slice(0, 50)}...`);
    }

    if (!res.ok) {
      throw new Error(data?.error || `HTTP ${res.status}`);
    }
    return data;
  };

  // 1. Server Check (GET /api/health)
  const runServerCheck = async () => {
    setServerCheck((prev) => ({ ...prev, status: 'checking' }));
    try {
      const res = await fetch('/api/health');
      const data = await safeParseResponse(res);
      const commit = data.commit ? String(data.commit).slice(0, 7) : 'local';
      const version = data.version || '1.0.0';
      setServerCheck({
        status: 'ok',
        detail: `Server Online • v${version} (commit: ${commit})`,
        lastChecked: formatTimestamp(),
      });
    } catch (err: any) {
      setServerCheck({
        status: 'failed',
        detail: 'Health check request failed',
        error: redactSensitiveInfo(err?.message || 'Server unreachable'),
        lastChecked: formatTimestamp(),
      });
    }
  };

  // 2. AI Providers Check (test-key for each stored provider key)
  const runAiCheck = async () => {
    setAiCheck((prev) => ({ ...prev, status: 'checking' }));
    try {
      const candidateProviders: ApiProvider[] = [
        'gemini',
        'groq',
        'nvidia',
        'openrouter',
        'openai',
        'deepseek',
        'xai',
        'anthropic',
      ];

      const configuredProviders = candidateProviders.filter((p) => Boolean(getStoredApiKey(p)));

      if (configuredProviders.length === 0) {
        setAiCheck({
          status: 'ok',
          detail: 'No custom API keys stored. Using default fallback & curated question bank.',
          lastChecked: formatTimestamp(),
        });
        return;
      }

      const results: string[] = [];
      const errors: string[] = [];

      for (const provider of configuredProviders) {
        const key = getStoredApiKey(provider);
        const pName = PROVIDERS[provider]?.name || provider;
        try {
          const res = await fetch('/api/test-key', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': key,
              'x-api-provider': provider,
            },
            body: JSON.stringify({ provider, apiKey: key }),
          });

          const contentType = res.headers.get('content-type');
          let data: any;
          if (contentType && contentType.includes('application/json')) {
            data = await res.json();
          } else {
            const text = await res.text();
            throw new Error(`Server returned plain text: ${text.slice(0, 50)}...`);
          }

          if (!res.ok || !data.success) {
            errors.push(`${pName}: ${data?.error || `HTTP ${res.status}`}`);
          } else {
            const chosenGen = data.generationModel || data.model || 'Auto';
            const chosenEval = data.evaluationModel || chosenGen;
            results.push(`${pName}: Gen [${chosenGen}], Eval [${chosenEval}]`);
          }
        } catch (fetchErr: any) {
          errors.push(`${pName}: ${fetchErr?.message || 'Connection failed'}`);
        }
      }

      if (errors.length > 0 && results.length === 0) {
        setAiCheck({
          status: 'failed',
          detail: 'All configured AI providers failed validation',
          error: redactSensitiveInfo(errors.join('; ')),
          lastChecked: formatTimestamp(),
        });
      } else if (errors.length > 0) {
        setAiCheck({
          status: 'failed',
          detail: results.join(' • '),
          error: redactSensitiveInfo(errors.join('; ')),
          lastChecked: formatTimestamp(),
        });
      } else {
        setAiCheck({
          status: 'ok',
          detail: results.join(' • '),
          lastChecked: formatTimestamp(),
        });
      }
    } catch (err: any) {
      setAiCheck({
        status: 'failed',
        detail: 'AI provider verification encountered an error',
        error: redactSensitiveInfo(err?.message || 'Verification failure'),
        lastChecked: formatTimestamp(),
      });
    }
  };

  // 3. Database Check (Firestore small read & auth status)
  const runDbCheck = async () => {
    setDbCheck((prev) => ({ ...prev, status: 'checking' }));
    try {
      const q = query(collection(db, 'questions'), limit(1));
      const snap = await getDocs(q);
      const user = auth.currentUser;
      const userText = user ? `Signed in (${user.email || 'authenticated'})` : 'Guest mode (not signed in)';
      setDbCheck({
        status: 'ok',
        detail: `Firestore operational (${snap.size > 0 ? 'Questions verified' : 'Ready'}) • User: ${userText}`,
        lastChecked: formatTimestamp(),
      });
    } catch (err: any) {
      const user = auth.currentUser;
      const userText = user ? `Signed in (${user.email || 'authenticated'})` : 'Guest mode (not signed in)';
      setDbCheck({
        status: 'failed',
        detail: `Firestore read failed • User: ${userText}`,
        error: redactSensitiveInfo(err?.message || 'Firestore connection error'),
        lastChecked: formatTimestamp(),
      });
    }
  };

  // 4. Voice Check (GET /api/tts-check with Bearer token)
  const runVoiceCheck = async () => {
    setVoiceCheck((prev) => ({ ...prev, status: 'checking' }));
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/tts-check', {
        headers: {
          ...authHeaders,
        },
      });

      const contentType = res.headers.get('content-type');
      let data: any;
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`Server returned plain text: ${text.slice(0, 50)}...`);
      }

      if (!res.ok && !data?.diagnostics) {
        throw new Error(data?.error || `HTTP ${res.status}: ${res.statusText}`);
      }

      const maleCount = data.diagnostics?.englishMale ?? 0;
      const femaleCount = data.diagnostics?.englishFemale ?? 0;
      const ariaOk = data.diagnostics?.['en-US-AriaNeural']?.ok;
      const guyOk = data.diagnostics?.['en-US-GuyNeural']?.ok;
      const testSynthesized = ariaOk || guyOk;

      if (!testSynthesized && !data.ok) {
        throw new Error(data.diagnostics?.voicesError || 'Voice synthesis check failed');
      }

      setVoiceCheck({
        status: 'ok',
        detail: `English voices: ${maleCount} male, ${femaleCount} female • Test synthesis: ${testSynthesized ? 'Verified' : 'Ready'}`,
        lastChecked: formatTimestamp(),
      });
    } catch (err: any) {
      setVoiceCheck({
        status: 'failed',
        detail: 'TTS verification failed',
        error: redactSensitiveInfo(err?.message || 'TTS diagnostic failed'),
        lastChecked: formatTimestamp(),
      });
    }
  };

  // 5. Speech-to-Text Check (Groq key & Web Worker check)
  const runSttCheck = () => {
    const hasGroqKey = Boolean(getStoredApiKey('groq') || getStoredTranscriberKey('groq'));
    const isWorkerSupported = typeof window !== 'undefined' && typeof Worker !== 'undefined';

    setSttCheck({
      status: 'ok',
      detail: `Groq Whisper: ${hasGroqKey ? 'Configured' : 'Not configured (using local)'} • Web Worker Whisper: ${
        isWorkerSupported ? 'Supported' : 'Unavailable'
      }`,
      lastChecked: formatTimestamp(),
    });
  };

  const runAllChecks = useCallback(() => {
    runServerCheck();
    runAiCheck();
    runDbCheck();
    runVoiceCheck();
    runSttCheck();
  }, []);

  useEffect(() => {
    if (!isOpen) {
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
      setIsMicTesting(false);
      return;
    }

    runAllChecks();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, runAllChecks]);

  // STT Microphone/Audio test runner
  const handleRunMicTest = async () => {
    if (isMicTesting) return;
    setIsMicTesting(true);
    setMicTestResult('Requesting microphone access and recording 2s test audio...');

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('getUserMedia not supported in this browser environment');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
        setIsMicTesting(false);
        const totalSize = chunks.reduce((acc, c) => acc + c.size, 0);
        setMicTestResult(`Microphone recording verified (${Math.round(totalSize / 1024)} KB captured). Input is healthy!`);
      };

      mediaRecorder.start();
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }, 2000);
    } catch (err: any) {
      setIsMicTesting(false);
      setMicTestResult(`Microphone test failed: ${redactSensitiveInfo(err?.message || 'Access denied')}`);
    }
  };

  // Copy Diagnostics plain text with strict key redaction
  const handleCopyDiagnostics = () => {
    const text = [
      `=== TOEFL PREP STUDIO SYSTEM DIAGNOSTICS ===`,
      `Generated: ${new Date().toISOString()}`,
      ``,
      `[Server]`,
      `Status: ${serverCheck.status.toUpperCase()}`,
      `Detail: ${serverCheck.detail}`,
      serverCheck.error ? `Error: ${serverCheck.error}` : '',
      `Last Checked: ${serverCheck.lastChecked || 'N/A'}`,
      ``,
      `[AI Providers]`,
      `Status: ${aiCheck.status.toUpperCase()}`,
      `Detail: ${aiCheck.detail}`,
      aiCheck.error ? `Error: ${aiCheck.error}` : '',
      `Last Checked: ${aiCheck.lastChecked || 'N/A'}`,
      ``,
      `[Database (Firestore)]`,
      `Status: ${dbCheck.status.toUpperCase()}`,
      `Detail: ${dbCheck.detail}`,
      dbCheck.error ? `Error: ${dbCheck.error}` : '',
      `Last Checked: ${dbCheck.lastChecked || 'N/A'}`,
      ``,
      `[Voice (TTS)]`,
      `Status: ${voiceCheck.status.toUpperCase()}`,
      `Detail: ${voiceCheck.detail}`,
      voiceCheck.error ? `Error: ${voiceCheck.error}` : '',
      `Last Checked: ${voiceCheck.lastChecked || 'N/A'}`,
      ``,
      `[Speech-to-Text (STT)]`,
      `Status: ${sttCheck.status.toUpperCase()}`,
      `Detail: ${sttCheck.detail}`,
      micTestResult ? `Mic Test: ${micTestResult}` : '',
      `Last Checked: ${sttCheck.lastChecked || 'N/A'}`,
      ``,
      `Sentry Monitored: ${Boolean(import.meta.env.VITE_SENTRY_DSN)}`,
    ]
      .filter((line) => line !== '')
      .join('\n');

    const cleanText = redactSensitiveInfo(text);
    navigator.clipboard?.writeText(cleanText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Send Test Error button handler (unconditionally rendered in footer)
  const handleSendTestError = async () => {
    try {
      const dsn = import.meta.env.VITE_SENTRY_DSN;
      if (dsn) {
        const Sentry = await import('@sentry/react');
        const eventId = Sentry.captureException(
          new Error('Manual verification error sent from Live System Status panel')
        );
        setTestErrorNotice(`Test error successfully sent to Sentry (Event ID: ${eventId || 'acknowledged'})`);
      } else {
        setTestErrorNotice('Test error triggered! (VITE_SENTRY_DSN is not configured in current environment)');
        console.error('Test error manually triggered from Live System Status panel');
      }
      setTimeout(() => setTestErrorNotice(null), 5000);
    } catch (err: any) {
      setTestErrorNotice(`Could not send test error: ${err?.message || 'Sentry client error'}`);
      setTimeout(() => setTestErrorNotice(null), 5000);
    }
  };

  if (!isOpen) return null;

  const renderStatusBadge = (status: CheckStatus) => {
    if (status === 'checking') {
      return (
        <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
          <Loader2 className="w-3 h-3 animate-spin text-amber-600" />
          Checking
        </span>
      );
    }
    if (status === 'ok') {
      return (
        <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          OK
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-[11px] font-semibold text-rose-800 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-full">
        <AlertCircle className="w-3 h-3 text-rose-600" />
        Failed
      </span>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden transform transition-all"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="system-status-title"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-teal-100 text-teal-800 rounded-xl">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h3 id="system-status-title" className="text-sm font-bold text-slate-900">
                Live System Status
              </h3>
              <p className="text-[11px] text-slate-500">Real-time service health &amp; connectivity diagnostics</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={runAllChecks}
              className="p-1.5 text-slate-500 hover:text-teal-700 hover:bg-slate-200/60 rounded-lg transition cursor-pointer"
              title="Re-check all services"
              aria-label="Re-check all services"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Test Error Confirmation Alert */}
        {testErrorNotice && (
          <div className="bg-teal-50 border-b border-teal-200 px-5 py-2.5 flex items-center justify-between text-xs text-teal-900 animate-in fade-in">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-teal-700 shrink-0" />
              <span>{testErrorNotice}</span>
            </div>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-5 space-y-3 max-h-[75vh] overflow-y-auto">
          {/* Row 1: Server */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/40 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                <Server className="w-4 h-4 text-slate-600" />
                <span>Backend Server</span>
              </div>
              {renderStatusBadge(serverCheck.status)}
            </div>
            <div className="text-xs text-slate-600">{serverCheck.detail}</div>
            {serverCheck.error && (
              <div className="text-[11px] font-mono text-rose-700 bg-rose-50 p-2 rounded-lg border border-rose-200">
                {serverCheck.error}
              </div>
            )}
            <div className="text-[10px] text-slate-400">
              Last checked: {serverCheck.lastChecked || 'Checking...'}
            </div>
          </div>

          {/* Row 2: AI Providers */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/40 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                <Cpu className="w-4 h-4 text-slate-600" />
                <span>AI Providers</span>
              </div>
              {renderStatusBadge(aiCheck.status)}
            </div>
            <div className="text-xs text-slate-600">{aiCheck.detail}</div>
            {aiCheck.error && (
              <div className="text-[11px] font-mono text-rose-700 bg-rose-50 p-2 rounded-lg border border-rose-200">
                {aiCheck.error}
              </div>
            )}
            <div className="text-[10px] text-slate-400">
              Last checked: {aiCheck.lastChecked || 'Checking...'}
            </div>
          </div>

          {/* Row 3: Database (Firestore) */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/40 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                <Database className="w-4 h-4 text-slate-600" />
                <span>Database (Firestore)</span>
              </div>
              {renderStatusBadge(dbCheck.status)}
            </div>
            <div className="text-xs text-slate-600">{dbCheck.detail}</div>
            {dbCheck.error && (
              <div className="text-[11px] font-mono text-rose-700 bg-rose-50 p-2 rounded-lg border border-rose-200">
                {dbCheck.error}
              </div>
            )}
            <div className="text-[10px] text-slate-400">
              Last checked: {dbCheck.lastChecked || 'Checking...'}
            </div>
          </div>

          {/* Row 4: Voice (TTS) */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/40 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                <Volume2 className="w-4 h-4 text-slate-600" />
                <span>Speech Synthesis (TTS)</span>
              </div>
              {renderStatusBadge(voiceCheck.status)}
            </div>
            <div className="text-xs text-slate-600">{voiceCheck.detail}</div>
            {voiceCheck.error && (
              <div className="text-[11px] font-mono text-rose-700 bg-rose-50 p-2 rounded-lg border border-rose-200">
                {voiceCheck.error}
              </div>
            )}
            <div className="text-[10px] text-slate-400">
              Last checked: {voiceCheck.lastChecked || 'Checking...'}
            </div>
          </div>

          {/* Row 5: Speech-to-Text (STT) & Mic Test */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/40 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                <Mic className="w-4 h-4 text-slate-600" />
                <span>Speech-to-Text &amp; Audio Input</span>
              </div>
              {renderStatusBadge(sttCheck.status)}
            </div>
            <div className="text-xs text-slate-600">{sttCheck.detail}</div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleRunMicTest}
                disabled={isMicTesting}
                className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-teal-800 hover:bg-teal-900 disabled:opacity-50 text-white transition flex items-center gap-1.5 cursor-pointer"
              >
                {isMicTesting ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Recording (2s)...</span>
                  </>
                ) : (
                  <>
                    <Radio className="w-3 h-3" />
                    <span>Run Microphone/STT Test</span>
                  </>
                )}
              </button>
              {micTestResult && (
                <span className="text-[11px] text-slate-700 truncate">{micTestResult}</span>
              )}
            </div>
            <div className="text-[10px] text-slate-400">
              Last checked: {sttCheck.lastChecked || 'Checking...'}
            </div>
          </div>
        </div>

        {/* Modal Footer with Actions */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={runAllChecks}
              className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              <span>Re-check</span>
            </button>
            <button
              type="button"
              onClick={handleCopyDiagnostics}
              className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
              <span>{copied ? 'Copied Diagnostics!' : 'Copy Diagnostics'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSendTestError}
              className="px-3 py-1.5 bg-amber-50 border border-amber-300 hover:bg-amber-100 text-amber-900 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5 text-amber-700" />
              <span>Send Test Error</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
