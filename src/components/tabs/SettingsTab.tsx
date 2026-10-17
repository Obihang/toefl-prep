import React, { useState, useEffect, useRef } from 'react';
import { Settings, User, Mic, MousePointer, Key, CheckCircle2, AlertCircle, Target, BookOpen } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getStoredMicDeviceId, setStoredMicDeviceId, getAudioInputDevices, getVoiceEngine, setVoiceEngine, VoiceEngine } from '../../utils/audioSpeech';
import { getStoredApiKey, getStoredVoiceKey, setStoredVoiceKey } from '../../utils/apiKey';
import { isOfflineVoiceDownloaded, downloadOfflineVoice, removeOfflineVoice } from '../../utils/offlineVoice';
import { getCursorPreference, setCursorPreference, CursorObjectStyle } from '../../utils/cursorPreferences';

export const SettingsTab: React.FC = () => {
  const { displayName, setDisplayName } = useAuth();
  const [nameInput, setNameInput] = useState('');
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>('');
  
  useEffect(() => {
    setNameInput(displayName || localStorage.getItem('toefl_display_name') || '');
    setSelectedMicId(getStoredMicDeviceId() || '');
    getAudioInputDevices().then(setMicDevices).catch(() => {});
  }, [displayName]);

  return (
    <div className="space-y-4">
      {/* 1. Profile */}
      <details className="p-4 bg-white border border-slate-200 rounded-xl cursor-pointer">
        <summary className="font-bold text-sm text-slate-900 flex items-center gap-2">
          <User className="w-4 h-4 text-teal-700" />
          Profile
        </summary>
        <div className="mt-3 space-y-2">
          <label className="text-xs font-semibold text-slate-600">Display Name</label>
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={() => { if (nameInput.trim()) setDisplayName(nameInput.trim()); }}
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-slate-50 focus:border-teal-600 outline-hidden"
          />
        </div>
      </details>

      {/* 2. Microphone */}
      <details className="p-4 bg-white border border-slate-200 rounded-xl cursor-pointer">
        <summary className="font-bold text-sm text-slate-900 flex items-center gap-2">
          <Mic className="w-4 h-4 text-teal-700" />
          Microphone
        </summary>
        <div className="mt-3 space-y-2">
          <select
            value={selectedMicId}
            onChange={(e) => {
              setSelectedMicId(e.target.value);
              setStoredMicDeviceId(e.target.value);
            }}
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-slate-50 focus:border-teal-600 outline-hidden"
          >
            <option value="">Default Audio Input</option>
            {micDevices.map((device, idx) => (
              <option key={device.deviceId || idx} value={device.deviceId}>
                {device.label || `Microphone ${idx + 1}`}
              </option>
            ))}
          </select>
        </div>
      </details>
    </div>
  );
};
