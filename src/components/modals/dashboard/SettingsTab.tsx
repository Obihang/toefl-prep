import React, { useState, useEffect, useRef } from 'react';
import { safeFetchJson } from '../../../utils/apiHelper';
import {
  User,
  Mic,
  Key,
  CheckCircle2,
  AlertCircle,
  Volume2,
  Database,
  Trash2,
  Target,
  Download,
  Upload,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import {
  getStoredApiKey,
  setStoredApiKey,
  getStoredProvider,
  setStoredProvider,
  disconnectAllApiKeys,
  PROVIDERS,
  ApiProvider,
} from '../../../utils/apiKey';
import { detectProviderFromKey, KeyDetectResult } from '../../../utils/keyDetect';
import { Accordion, AccordionSection } from './Accordion';
import { MicSection } from './MicSection';
import { VoiceCheckingSection } from './settings/VoiceCheckingSection';
import { getAiStatusInfo } from '../../../utils/aiFallbackChain';
import { getPracticeHistory, resetPracticeHistory } from '../../../utils/scoreTracker';
import { exportQuestionBankJson, purgeLowQualityCache, saveVerifiedQuestion } from '../../../utils/questionBankStorage';
import { isHighQualityTask } from '../../../utils/questionValidator';
import { getApiHeaders } from '../../../utils/apiKey';
import { TASK_DEFINITIONS } from '../../../types/taskTypes';
import { preCacheSectionAudio } from '../../../utils/audioPrewarmer';

interface SettingsTabProps {
  onConfigureGoals?: () => void;
  currentTaskType?: string;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({ onConfigureGoals, currentTaskType }) => {
  const { displayName, setDisplayName } = useAuth();
  const [nameInput, setNameInput] = useState('');
  const [provider, setProvider] = useState<ApiProvider>('auto');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [detected, setDetected] = useState<KeyDetectResult | null>(null);
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [testKeyResult, setTestKeyResult] = useState<{ success?: boolean; message?: string } | null>(null);
  const [dataMessage, setDataMessage] = useState<{ success: boolean; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Per-provider saved keys state for quick BYOK overview
  const [geminiKey, setGeminiKey] = useState('');
  const [groqKey, setGroqKey] = useState('');
  const [openRouterKey, setOpenRouterKey] = useState('');

  const syncKeys = () => {
    setGeminiKey(getStoredApiKey('gemini') || '');
    setGroqKey(getStoredApiKey('groq') || '');
    setOpenRouterKey(getStoredApiKey('openrouter') || '');
  };

  useEffect(() => {
    setNameInput(displayName || localStorage.getItem('toefl_display_name') || '');
    const currentProvider = getStoredProvider();
    setProvider(currentProvider);
    setApiKeyInput(getStoredApiKey(currentProvider) || '');
    syncKeys();
  }, [displayName]);

  useEffect(() => {
    const res = detectProviderFromKey(apiKeyInput);
    setDetected(res);
  }, [apiKeyInput]);

  const handleSwitchProvider = (newProvider: ApiProvider) => {
    setProvider(newProvider);
    setStoredProvider(newProvider);
    // Load that provider's saved key into the key box
    const saved = getStoredApiKey(newProvider) || '';
    setApiKeyInput(saved);
    setTestKeyResult(null);
  };

  const handleSaveIndividualKey = (targetProvider: ApiProvider, val: string) => {
    setStoredApiKey(val.trim(), targetProvider);
    syncKeys();
    if (provider === targetProvider) {
      setApiKeyInput(val.trim());
    }
    window.dispatchEvent(new CustomEvent('apiKeyUpdated'));
  };

  const handleTestAndSaveKey = async () => {
    if (!apiKeyInput.trim()) return;
    setIsTestingKey(true);
    setTestKeyResult(null);

    const trimmed = apiKeyInput.trim();
    const targetProvider: ApiProvider =
      detected?.provider ? (detected.provider as ApiProvider) : provider === 'auto' ? 'gemini' : provider;

    try {
      setStoredApiKey(trimmed, targetProvider);
      if (provider !== 'auto') {
        setProvider(targetProvider);
        setStoredProvider(targetProvider);
      }
      syncKeys();

      // Test key connectivity
      const json = await safeFetchJson('/api/test-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': trimmed,
          'x-api-provider': targetProvider,
        },
        body: JSON.stringify({
          provider: targetProvider,
          apiKey: trimmed,
        }),
      });

      window.dispatchEvent(new CustomEvent('apiKeyUpdated'));

      if (json.success) {
        setTestKeyResult({
          success: true,
          message: `Connected successfully to ${PROVIDERS[targetProvider]?.name || targetProvider}! Key saved locally.`,
        });
      } else {
        setTestKeyResult({
          success: false,
          message: json.error || `Could not verify ${targetProvider} key.`,
        });
      }
    } catch (err: any) {
      setTestKeyResult({ success: false, message: err?.message || 'Connection test failed.' });
    } finally {
      setIsTestingKey(false);
    }
  };

  const handleDisconnectAll = () => {
    disconnectAllApiKeys();
    setApiKeyInput('');
    syncKeys();
    setTestKeyResult({
      success: true,
      message: 'All API keys removed from browser localStorage.',
    });
    setTimeout(() => setTestKeyResult(null), 4000);
  };

  // Data section handlers
  const handleExportData = () => {
    const history = getPracticeHistory();
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      history,
      targetScore: localStorage.getItem('toefl_target_score'),
      weeklyGoal: localStorage.getItem('WEEKLY_GOAL'),
      testDate: localStorage.getItem('toefl_test_date'),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `toefl_prep_history_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setDataMessage({ success: true, text: 'Study history exported successfully!' });
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed.history)) {
          localStorage.setItem('toefl_practice_history', JSON.stringify(parsed.history));
        }
        if (parsed.targetScore) localStorage.setItem('toefl_target_score', parsed.targetScore);
        if (parsed.weeklyGoal) localStorage.setItem('WEEKLY_GOAL', parsed.weeklyGoal);
        if (parsed.testDate) localStorage.setItem('toefl_test_date', parsed.testDate);

        setDataMessage({ success: true, text: 'Study history imported successfully!' });
      } catch {
        setDataMessage({ success: false, text: 'Failed to import JSON: Invalid file format.' });
      }
    };
    reader.readAsText(file);
  };

  const handleResetData = () => {
    if (window.confirm('Are you sure you want to reset all test history and practice records? This cannot be undone.')) {
      resetPracticeHistory();
      setDataMessage({ success: true, text: 'All practice history has been reset.' });
    }
  };

  const handleExportQuestionBank = async () => {
    const jsonStr = await exportQuestionBankJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `toefl_question_bank_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setDataMessage({ success: true, text: 'Question bank exported successfully!' });
  };

  const handlePurgeCache = async () => {
    const count = await purgeLowQualityCache();
    setDataMessage({ success: true, text: `Purged ${count} low-quality stub questions from cache successfully!` });
  };

  const [isPreCachingAudio, setIsPreCachingAudio] = useState(false);
  const [preCacheAudioStatus, setPreCacheAudioStatus] = useState<string | null>(null);

  const handlePreCacheAllAudio = async () => {
    if (isPreCachingAudio) return;
    setIsPreCachingAudio(true);
    setPreCacheAudioStatus('Caching listening & speaking audio...');
    try {
      await preCacheSectionAudio('Listening', (p) => {
        setPreCacheAudioStatus(`Listening: ${p.statusText}`);
      });
      await preCacheSectionAudio('Speaking', (p) => {
        setPreCacheAudioStatus(`Speaking: ${p.statusText}`);
      });
      setDataMessage({
        success: true,
        text: 'All section audio pre-cached into IndexedDB (0ms ready).',
      });
    } catch {
      setDataMessage({
        success: false,
        text: 'Failed to complete audio pre-caching.',
      });
    } finally {
      setIsPreCachingAudio(false);
      setPreCacheAudioStatus(null);
    }
  };

  const [bulkSeedTaskType, setBulkSeedTaskType] = useState<string>(currentTaskType || 'academic-discussion');
  const [isBulkSeeding, setIsBulkSeeding] = useState(false);
  const [bulkSeedProgress, setBulkSeedProgress] = useState<string | null>(null);

  useEffect(() => {
    if (currentTaskType) {
      setBulkSeedTaskType(currentTaskType);
    }
  }, [currentTaskType]);

  const handleBulkSeedBank = async () => {
    const hasConfiguredKey = Boolean(
      getStoredApiKey('gemini') ||
      getStoredApiKey('groq') ||
      getStoredApiKey('openrouter') ||
      getStoredApiKey('openai') ||
      getStoredApiKey('anthropic') ||
      getStoredApiKey('deepseek') ||
      getStoredApiKey('xai')
    );

    if (!hasConfiguredKey) {
      setDataMessage({
        success: false,
        text: 'Please configure at least one active API key in the "AI provider and API keys" tab above before bulk seeding questions.',
      });
      return;
    }

    if (isBulkSeeding) return;
    setIsBulkSeeding(true);

    const DIVERSE_TARGETS = [
      { level: 'intermediate', topic: 'science-tech' },
      { level: 'upper-intermediate', topic: 'campus-life' },
      { level: 'advanced', topic: 'business-economics' },
      { level: 'upper-intermediate', topic: 'social-sciences' },
      { level: 'advanced', topic: 'arts-humanities' },
    ];

    let successCount = 0;
    const targetTaskName = TASK_DEFINITIONS.find((t) => t.id === bulkSeedTaskType)?.name || bulkSeedTaskType;

    try {
      for (let i = 0; i < DIVERSE_TARGETS.length; i++) {
        const target = DIVERSE_TARGETS[i];
        setBulkSeedProgress(`Generating question ${i + 1}/5: ${target.level} · ${target.topic}...`);

        try {
          const json = await safeFetchJson('/api/generate-task', {
            method: 'POST',
            headers: getApiHeaders(),
            body: JSON.stringify({
              taskType: bulkSeedTaskType,
              level: target.level,
              topic: target.topic,
            }),
          });

          if (json.success && json.data && !json.data.isFallback) {
            const generatedData = json.data;
            if (isHighQualityTask(generatedData, bulkSeedTaskType)) {
              await saveVerifiedQuestion({
                taskType: bulkSeedTaskType,
                level: target.level,
                topic: target.topic,
                content: generatedData,
              });
              successCount++;
            } else {
              console.warn(`Generated task failed quality check for ${bulkSeedTaskType}:`, generatedData);
            }
          } else {
            console.warn(`Failed to generate task ${i + 1}:`, json.error || 'Fallback returned');
          }
        } catch (genErr) {
          console.warn(`Error generating bulk item ${i + 1}:`, genErr);
        }

        // 2-second rate-limit throttle delay between sequential generations
        if (i < DIVERSE_TARGETS.length - 1) {
          setBulkSeedProgress(`Throttling 2s for rate limits (${i + 1}/5 generated)...`);
          await new Promise((r) => setTimeout(r, 2000));
        }
      }

      if (successCount > 0) {
        setDataMessage({
          success: true,
          text: `Successfully generated and saved ${successCount}/5 verified questions for "${targetTaskName}" to IndexedDB & Firestore! Click "Export Question Bank (JSON)" to download the updated bank.`,
        });
      } else {
        setDataMessage({
          success: false,
          text: `Bulk generation finished but 0 valid questions were saved (check API quota or key validity).`,
        });
      }
    } catch (err: any) {
      setDataMessage({
        success: false,
        text: `Bulk seeding failed: ${err.message || 'Unknown error'}`,
      });
    } finally {
      setIsBulkSeeding(false);
      setBulkSeedProgress(null);
    }
  };

  const aiStatus = getAiStatusInfo();

  const sections: AccordionSection[] = [
    // 1. AI Provider and API Keys
    {
      id: 'ai_provider',
      title: 'AI provider and API keys',
      icon: <Key className="w-4 h-4 text-teal-700" />,
      content: (
        <div className="space-y-4 pt-2">
          {/* AI Status Panel */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">Current AI Execution Status</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800">
                BYOK Fallback Chain
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <div className="p-2 bg-white rounded-lg border border-slate-200">
                <span className="text-slate-400 block text-[10px]">Generation</span>
                <span className="font-bold text-slate-800 truncate block">{aiStatus.generation.provider}</span>
                <span className="text-[10px] text-teal-600 truncate block">{aiStatus.generation.model}</span>
              </div>
              <div className="p-2 bg-white rounded-lg border border-slate-200">
                <span className="text-slate-400 block text-[10px]">Evaluation</span>
                <span className="font-bold text-slate-800 truncate block">{aiStatus.evaluation.provider}</span>
                <span className="text-[10px] text-teal-600 truncate block">{aiStatus.evaluation.model}</span>
              </div>
              <div className="p-2 bg-white rounded-lg border border-slate-200">
                <span className="text-slate-400 block text-[10px]">Speech-to-Text</span>
                <span className="font-bold text-slate-800 truncate block">{aiStatus.stt.provider}</span>
                <span className="text-[10px] text-teal-600 truncate block">{aiStatus.stt.model}</span>
              </div>
              <div className="p-2 bg-white rounded-lg border border-slate-200">
                <span className="text-slate-400 block text-[10px]">TTS Audio</span>
                <span className="font-bold text-slate-800 truncate block">Edge Neural</span>
                <span className="text-[10px] text-teal-600 truncate block">en-US Neural</span>
              </div>
            </div>

            {/* Rate limit status banner */}
            {Object.keys(aiStatus.rateLimits).length > 0 && (
              <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  Rate-limited providers:{' '}
                  {Object.entries(aiStatus.rateLimits)
                    .map(([p, info]) => `${p} (${info.remainingSeconds}s wait)`)
                    .join(', ')}
                </span>
              </div>
            )}
          </div>

          {/* Provider selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Active Routing Provider</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {(['auto', 'gemini', 'groq', 'openrouter'] as ApiProvider[]).map((p) => {
                const isSelected = provider === p;
                const pKey = p === 'auto' ? '' : getStoredApiKey(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handleSwitchProvider(p)}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                      isSelected
                        ? 'bg-teal-50 border-teal-600 text-teal-900 font-bold shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="capitalize">{p === 'auto' ? '⚡ Auto-Chain' : p}</span>
                      {p !== 'auto' && (
                        <span
                          className={`w-2 h-2 rounded-full ${pKey ? 'bg-emerald-500' : 'bg-slate-300'}`}
                          title={pKey ? 'Key saved' : 'No key'}
                        />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Per-Provider Keys Input Boxes */}
          <div className="space-y-3 pt-1">
            <h5 className="text-xs font-bold text-slate-800">Your Provider Keys (Stored in Browser Only)</h5>

            {/* Gemini */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-700">Google Gemini API Key</span>
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-teal-700 hover:underline"
                >
                  Get free key
                </a>
              </div>
              <input
                type="password"
                value={geminiKey}
                onChange={(e) => {
                  setGeminiKey(e.target.value);
                  handleSaveIndividualKey('gemini', e.target.value);
                }}
                placeholder="AIzaSy... (Gemini 2.5 Flash / Flash Lite)"
                className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg px-3 py-2 outline-hidden focus:border-teal-600"
              />
            </div>

            {/* Groq */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-700">Groq API Key (for Whisper STT &amp; Llama 3.3)</span>
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-teal-700 hover:underline"
                >
                  Get free key
                </a>
              </div>
              <input
                type="password"
                value={groqKey}
                onChange={(e) => {
                  setGroqKey(e.target.value);
                  handleSaveIndividualKey('groq', e.target.value);
                }}
                placeholder="gsk_... (Whisper Large v3 Turbo &amp; Llama 3.3 70B)"
                className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg px-3 py-2 outline-hidden focus:border-teal-600"
              />
            </div>

            {/* OpenRouter */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-700">OpenRouter API Key</span>
                <a
                  href="https://openrouter.ai/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-teal-700 hover:underline"
                >
                  Get key
                </a>
              </div>
              <input
                type="password"
                value={openRouterKey}
                onChange={(e) => {
                  setOpenRouterKey(e.target.value);
                  handleSaveIndividualKey('openrouter', e.target.value);
                }}
                placeholder="sk-or-v1-... (Multi-model fallback)"
                className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg px-3 py-2 outline-hidden focus:border-teal-600"
              />
            </div>
          </div>

          {/* Quick paste & test bar */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <label className="text-xs font-semibold text-slate-600">Quick Connect &amp; Auto-Detect Key</label>
            <div className="relative">
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => {
                  setApiKeyInput(e.target.value);
                  setTestKeyResult(null);
                }}
                placeholder="Paste any key here to auto-detect and verify..."
                className="w-full text-xs bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 font-mono pr-28 outline-hidden focus:border-teal-600"
              />
              <button
                type="button"
                onClick={handleTestAndSaveKey}
                disabled={isTestingKey || !apiKeyInput.trim()}
                className="absolute right-1.5 top-1.5 bottom-1.5 px-3 bg-teal-800 hover:bg-teal-900 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
              >
                {isTestingKey ? 'Verifying...' : 'Test & Save'}
              </button>
            </div>

            {detected?.provider && (
              <p className="text-[11px] text-slate-500">
                Key format detected: <strong className="text-teal-800">{detected.label}</strong>
              </p>
            )}

            {testKeyResult && (
              <div
                className={`p-2.5 rounded-lg text-xs font-medium flex items-center gap-2 ${
                  testKeyResult.success
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                {testKeyResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{testKeyResult.message}</span>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleDisconnectAll}
                className="text-xs text-rose-600 hover:text-rose-800 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear All Saved Keys
              </button>
            </div>
          </div>
        </div>
      ),
    },

    // 2. Voice and Speech
    {
      id: 'voice_speech',
      title: 'Voice and speech',
      icon: <Volume2 className="w-4 h-4 text-teal-700" />,
      content: <VoiceCheckingSection />,
    },

    // 3. Microphone
    {
      id: 'microphone',
      title: 'Microphone',
      icon: <Mic className="w-4 h-4 text-teal-700" />,
      content: (
        <div className="pt-2">
          <MicSection />
        </div>
      ),
    },

    // 4. Profile
    {
      id: 'profile',
      title: 'Profile',
      icon: <User className="w-4 h-4 text-teal-700" />,
      content: (
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Display Name</label>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={() => {
                if (nameInput.trim()) setDisplayName(nameInput.trim());
              }}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-slate-50 focus:border-teal-600 outline-hidden"
            />
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between flex-wrap gap-2">
            <div>
              <h5 className="text-xs font-bold text-slate-800">TOEFL Target Score &amp; Weekly Goals</h5>
              <p className="text-[11px] text-slate-500">Configure your target band score and weekly test targets.</p>
            </div>
            {onConfigureGoals && (
              <button
                type="button"
                onClick={onConfigureGoals}
                className="px-3 py-1.5 bg-teal-800 hover:bg-teal-900 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Target className="w-3.5 h-3.5" />
                Configure Study Goals
              </button>
            )}
          </div>
        </div>
      ),
    },

    // 5. Data
    {
      id: 'data',
      title: 'Data',
      icon: <Database className="w-4 h-4 text-teal-700" />,
      content: (
        <div className="space-y-4 pt-2">
          <p className="text-xs text-slate-600">
            Export your practice records, rubric scoring evaluations, and study history to a portable JSON file, or restore from a backup.
          </p>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleExportData}
              className="px-3.5 py-2 bg-teal-800 hover:bg-teal-900 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Download className="w-3.5 h-3.5" />
              Export History (JSON)
            </button>

            <button
              type="button"
              onClick={handleExportQuestionBank}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-teal-300 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 text-teal-400" />
              Export Question Bank (JSON)
            </button>

            {/* Bulk Seed Tool */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={bulkSeedTaskType}
                onChange={(e) => setBulkSeedTaskType(e.target.value)}
                disabled={isBulkSeeding}
                className="text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white text-slate-800 font-semibold focus:border-teal-600 outline-hidden cursor-pointer"
                title="Select task type to bulk seed"
              >
                {TASK_DEFINITIONS.map((td) => (
                  <option key={td.id} value={td.id}>
                    {td.name} ({td.section})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleBulkSeedBank}
                disabled={isBulkSeeding}
                className="px-3.5 py-2 bg-linear-to-r from-teal-700 to-emerald-700 hover:from-teal-800 hover:to-emerald-800 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-60"
                title="Sequentially generate 5 authentic questions across diverse topics/levels with 2s rate limit delay and save to IndexedDB & Firestore"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isBulkSeeding ? 'animate-spin text-teal-200' : 'text-teal-300'}`} />
                <span>
                  {isBulkSeeding
                    ? bulkSeedProgress || 'Seeding 5 questions...'
                    : 'Bulk Seed Current Section (+5 AI Questions)'}
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={handlePurgeCache}
              className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              Purge Low-Quality Stubs
            </button>

            <button
              type="button"
              onClick={handlePreCacheAllAudio}
              disabled={isPreCachingAudio}
              className="px-3.5 py-2 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Pre-cache dialogue and interview audio lines into IndexedDB for instantaneous 0ms playback"
            >
              <Volume2 className={`w-3.5 h-3.5 ${isPreCachingAudio ? 'animate-pulse text-teal-600' : 'text-teal-700'}`} />
              <span>{isPreCachingAudio ? (preCacheAudioStatus || 'Caching audio...') : 'Pre-Cache Section Audio (IndexedDB)'}</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Import History
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImportData}
              accept=".json"
              className="hidden"
            />

            <button
              type="button"
              onClick={handleResetData}
              className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              Reset All History
            </button>
          </div>

          {dataMessage && (
            <div
              className={`p-2.5 rounded-lg text-xs font-medium flex items-center gap-2 ${
                dataMessage.success
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {dataMessage.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{dataMessage.text}</span>
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Accordion sections={sections} storageKey="dashboard_settings_accordion_open" />
    </div>
  );
};
