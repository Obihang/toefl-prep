import React, { useState, useEffect } from 'react';
import { X, Settings, Target, Calendar, CheckCircle2, User, MousePointer } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

import { getCursorPreference, setCursorPreference, CursorObjectStyle } from '../../utils/cursorPreferences';

export const SettingsModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { displayName, setDisplayName } = useAuth();
  const [nameInput, setNameInput] = useState('');
  const [targetScore, setTargetScore] = useState('100');
  const [testDate, setTestDate] = useState('');
  const [cursorStyle, setCursorStyleState] = useState<CursorObjectStyle>('pen');
  const [nameError, setNameError] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    setNameInput(displayName || localStorage.getItem('toefl_display_name') || '');
    const storedTarget = localStorage.getItem('toefl_target_score') || '100';
    const storedDate = localStorage.getItem('toefl_test_date') || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    setTargetScore(storedTarget);
    setTestDate(storedDate);
    setCursorStyleState(getCursorPreference());
    setNameError(null);
    setSavedSuccess(false);
  }, [isOpen, displayName]);

  if (!isOpen) return null;

  const handleCursorChange = (style: CursorObjectStyle) => {
    setCursorStyleState(style);
    setCursorPreference(style);
  };

  const handleSave = () => {
    const trimmed = nameInput.trim();
    if (trimmed && (trimmed.length < 2 || trimmed.length > 30)) {
      setNameError('Display name must be between 2 and 30 characters.');
      return;
    }
    if (trimmed) {
      setDisplayName(trimmed);
    }
    localStorage.setItem('toefl_target_score', targetScore);
    localStorage.setItem('toefl_test_date', testDate);
    setCursorPreference(cursorStyle);
    setSavedSuccess(true);
    setTimeout(() => {
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6 space-y-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center">
              <Settings className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Study Goals & Preferences</h2>
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
              <User className="w-4 h-4 text-teal-700" />
              Display Name (Author label)
            </label>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => {
                setNameInput(e.target.value);
                if (nameError) setNameError(null);
              }}
              placeholder="e.g. TOEFLScholar"
              maxLength={30}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:border-teal-600 outline-hidden"
            />
            <div className="flex justify-between items-center text-[11px] text-slate-400">
              <span>Used only for "Created by &lt;name&gt;" on shared questions</span>
              <span>{nameInput.trim().length}/30</span>
            </div>
            {nameError && (
              <p className="text-xs text-rose-600 font-medium">{nameError}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Target className="w-4 h-4 text-teal-700" />
              Target TOEFL Score (0–120)
            </label>
            <input
              type="number"
              min="0"
              max="120"
              value={targetScore}
              onChange={(e) => setTargetScore(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:border-teal-600 outline-hidden font-mono"
            />
            <p className="text-xs text-slate-500">
              Used to calculate test readiness, projected band scores, and study pacing.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-teal-700" />
              Planned Test Date
            </label>
            <input
              type="date"
              value={testDate}
              onChange={(e) => setTestDate(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:border-teal-600 outline-hidden font-mono"
            />
            <p className="text-xs text-slate-500">
              Enables exam countdown timer and recommended daily question quotas.
            </p>
          </div>

          {/* Interactive Clickable Cursor Object Style */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <label className="text-sm font-semibold text-slate-700 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <MousePointer className="w-4 h-4 text-teal-700" />
                Hover Cursor on Clickable Points
              </span>
              <span className="text-[11px] text-teal-800 font-medium bg-teal-50 px-2 py-0.5 rounded-full">
                Custom Object
              </span>
            </label>
            <p className="text-xs text-slate-500">
              When hovering over any button, tab, answer choice, or interactive point:
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleCursorChange('pen')}
                className={`p-2.5 rounded-xl border text-left text-xs transition-all flex items-center gap-2.5 cursor-pointer ${
                  cursorStyle === 'pen'
                    ? 'border-teal-700 bg-teal-50/80 text-teal-950 font-bold ring-2 ring-teal-600/20 shadow-xs'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <span className="text-lg">✒️</span>
                <div>
                  <div className="font-semibold leading-tight">Fountain Pen</div>
                  <div className="text-[10px] text-slate-400 font-normal">ETS writing nib</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleCursorChange('quill')}
                className={`p-2.5 rounded-xl border text-left text-xs transition-all flex items-center gap-2.5 cursor-pointer ${
                  cursorStyle === 'quill'
                    ? 'border-indigo-700 bg-indigo-50/80 text-indigo-950 font-bold ring-2 ring-indigo-600/20 shadow-xs'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <span className="text-lg">🪶</span>
                <div>
                  <div className="font-semibold leading-tight">Academic Quill</div>
                  <div className="text-[10px] text-slate-400 font-normal">Manuscript quill</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleCursorChange('wand')}
                className={`p-2.5 rounded-xl border text-left text-xs transition-all flex items-center gap-2.5 cursor-pointer ${
                  cursorStyle === 'wand'
                    ? 'border-sky-700 bg-sky-50/80 text-sky-950 font-bold ring-2 ring-sky-600/20 shadow-xs'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <span className="text-lg">✨</span>
                <div>
                  <div className="font-semibold leading-tight">Scholar Wand</div>
                  <div className="text-[10px] text-slate-400 font-normal">Star radiance</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleCursorChange('classic')}
                className={`p-2.5 rounded-xl border text-left text-xs transition-all flex items-center gap-2.5 cursor-pointer ${
                  cursorStyle === 'classic'
                    ? 'border-slate-700 bg-slate-100 text-slate-900 font-bold ring-2 ring-slate-400/20 shadow-xs'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <span className="text-lg">👆</span>
                <div>
                  <div className="font-semibold leading-tight">Classic Pointer</div>
                  <div className="text-[10px] text-slate-400 font-normal">System hand</div>
                </div>
              </button>
            </div>
          </div>
        </div>

        {savedSuccess && (
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Study goals saved successfully!</span>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-semibold text-white bg-teal-800 hover:bg-teal-900 rounded-lg transition-colors"
          >
            Save Goals
          </button>
        </div>
      </div>
    </div>
  );
};
