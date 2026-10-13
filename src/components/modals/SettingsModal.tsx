import React, { useState, useEffect } from 'react';
import { X, Settings, Key } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    // Load from localStorage or wherever stored
    const storedKey = localStorage.getItem('GEMINI_API_KEY') || '';
    setApiKey(storedKey);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    localStorage.setItem('GEMINI_API_KEY', apiKey);
    alert('API Key saved successfully!');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center">
              <Settings className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Key className="w-4 h-4" />
              Gemini API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your API key..."
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:border-teal-600 outline-hidden"
            />
            <p className="text-xs text-slate-500">
              Your key is stored securely in your browser's local storage and used for AI generation.
            </p>
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-semibold text-white bg-teal-800 hover:bg-teal-900 rounded-lg transition-colors"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};
