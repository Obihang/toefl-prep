import React, { useState } from 'react';
import { X, Award, Clock, Calculator, BookOpen, CheckCircle2, ChevronRight } from 'lucide-react';
import {
  TOEFL_TEST_STRUCTURE_2026,
  TOEFL_CONCORDANCE_TABLE_2026,
  OFFICIAL_TASK_RUBRICS,
  convertScaledToBand6,
  convertOverall120ToBand6,
  getCefrFromBand6,
} from '../../utils/toeflScoring';

export interface RubricsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RubricsModal: React.FC<RubricsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'concordance' | 'timing' | 'rubrics' | 'calculator'>('concordance');
  const [selectedTaskRubric, setSelectedTaskRubric] = useState<'write-email' | 'academic-discussion' | 'listen-repeat' | 'speaking-interview'>('write-email');

  // Interactive Calculator State
  const [calcReading, setCalcReading] = useState<number>(26);
  const [calcListening, setCalcListening] = useState<number>(25);
  const [calcWriting, setCalcWriting] = useState<number>(25);
  const [calcSpeaking, setCalcSpeaking] = useState<number>(24);

  if (!isOpen) return null;

  const readingBand = convertScaledToBand6(calcReading, 'Reading');
  const listeningBand = convertScaledToBand6(calcListening, 'Listening');
  const writingBand = convertScaledToBand6(calcWriting, 'Writing');
  const speakingBand = convertScaledToBand6(calcSpeaking, 'Speaking');

  const totalScore = calcReading + calcListening + calcWriting + calcSpeaking;
  const overallBand = convertOverall120ToBand6(totalScore);
  const cefr = getCefrFromBand6(overallBand);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl border border-slate-200 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-xs">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Official 2026 ETS TOEFL iBT® Standards</h2>
              <p className="text-xs text-slate-500">Concordance Tables 1–3 & Task Rubrics (0–5 Score Scale)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 px-6 bg-slate-50 text-xs font-semibold overflow-x-auto gap-2">
          <button
            onClick={() => setActiveTab('concordance')}
            className={`py-3 px-3 border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'concordance'
                ? 'border-teal-600 text-teal-800 font-bold bg-white -mb-px rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Table 3: Score Concordance</span>
          </button>
          <button
            onClick={() => setActiveTab('timing')}
            className={`py-3 px-3 border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'timing'
                ? 'border-teal-600 text-teal-800 font-bold bg-white -mb-px rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Table 1: Order & Timing</span>
          </button>
          <button
            onClick={() => setActiveTab('rubrics')}
            className={`py-3 px-3 border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'rubrics'
                ? 'border-teal-600 text-teal-800 font-bold bg-white -mb-px rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Task Rubrics (0–5 Descriptors)</span>
          </button>
          <button
            onClick={() => setActiveTab('calculator')}
            className={`py-3 px-3 border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'calculator'
                ? 'border-teal-600 text-teal-800 font-bold bg-white -mb-px rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            <span>Score Calculator</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'concordance' && (
            <div className="space-y-4">
              <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-xs text-teal-950 space-y-1">
                <div className="font-bold flex items-center gap-1 text-teal-900">
                  <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" />
                  Official ETS Concordance (PDF Page 22)
                </div>
                <p className="text-teal-900/90 leading-relaxed">
                  The updated TOEFL iBT reports scores on a <strong>1.0 to 6.0 Band Scale</strong> (in 0.5-point increments) alongside the legacy 0–30 section and 0–120 total scale. Table 3 defines the exact conversion boundaries.
                </p>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Band (1.0–6.0)</th>
                      <th className="py-2.5 px-3">CEFR Level</th>
                      <th className="py-2.5 px-3">Reading (0–30)</th>
                      <th className="py-2.5 px-3">Listening (0–30)</th>
                      <th className="py-2.5 px-3">Writing (0–30)</th>
                      <th className="py-2.5 px-3">Speaking (0–30)</th>
                      <th className="py-2.5 px-3 font-extrabold text-slate-900">Total (0–120)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-slate-800">
                    {TOEFL_CONCORDANCE_TABLE_2026.map((row) => (
                      <tr key={row.band} className={row.band >= 5.5 ? 'bg-teal-50/40' : row.band >= 4.0 ? 'bg-blue-50/30' : ''}>
                        <td className="py-2.5 px-3 font-bold text-teal-800">{row.band.toFixed(1)}</td>
                        <td className="py-2.5 px-3 font-sans font-semibold text-slate-900">{row.cefr}</td>
                        <td className="py-2.5 px-3">{row.reading[0]}–{row.reading[1]}</td>
                        <td className="py-2.5 px-3">{row.listening[0]}–{row.listening[1]}</td>
                        <td className="py-2.5 px-3">{row.writing[0]}–{row.writing[1]}</td>
                        <td className="py-2.5 px-3">{row.speaking[0]}–{row.speaking[1]}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-950 bg-slate-50/60">
                          {row.overall[0]}–{row.overall[1]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'timing' && (
            <div className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-700 space-y-1">
                <span className="font-bold text-slate-900 block">
                  Official Section Order: Reading → Listening → Writing → Speaking
                </span>
                <p className="leading-relaxed">
                  Per Page 4 of the official ETS guide: <em>"TOEFL test takers will receive the Reading section first, followed by the Listening section, the Writing section, and the Speaking section."</em> The total test takes approximately 90 minutes.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {TOEFL_TEST_STRUCTURE_2026.map((sec, idx) => (
                  <div key={sec.section} className="border border-slate-200 rounded-xl p-4 bg-white shadow-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-800 font-bold text-xs flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <h4 className="font-bold text-slate-900 text-sm">{sec.section} Section</h4>
                      </div>
                      <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                        {sec.timeMinutes} mins · {sec.items} items
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed font-normal">
                      {sec.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'rubrics' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap border-b border-slate-200 pb-3">
                <button
                  onClick={() => setSelectedTaskRubric('write-email')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    selectedTaskRubric === 'write-email'
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Write an Email (7 Mins)
                </button>
                <button
                  onClick={() => setSelectedTaskRubric('academic-discussion')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    selectedTaskRubric === 'academic-discussion'
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Academic Discussion (10 Mins)
                </button>
                <button
                  onClick={() => setSelectedTaskRubric('listen-repeat')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    selectedTaskRubric === 'listen-repeat'
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Listen & Repeat (7 Sentences)
                </button>
                <button
                  onClick={() => setSelectedTaskRubric('speaking-interview')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    selectedTaskRubric === 'speaking-interview'
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Take an Interview (4 Questions)
                </button>
              </div>

              <div className="space-y-3">
                {OFFICIAL_TASK_RUBRICS[selectedTaskRubric].map((rubric) => (
                  <div
                    key={rubric.score}
                    className={`p-3.5 rounded-xl border transition-colors ${
                      rubric.score >= 4
                        ? 'bg-teal-50/50 border-teal-200'
                        : rubric.score >= 3
                        ? 'bg-blue-50/40 border-blue-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-xs text-slate-900">{rubric.title}</span>
                      <span className="font-mono text-xs font-extrabold px-2 py-0.5 rounded bg-white border border-slate-200 text-teal-800">
                        Score {rubric.score} / 5
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed font-normal">
                      {rubric.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'calculator' && (
            <div className="space-y-6">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600">
                Adjust your scaled scores (0–30) per section to instantly preview the official Concordance Band (1.0–6.0) and CEFR proficiency.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-2">
                  <div className="flex justify-between items-center text-xs font-semibold">
                    <span>Reading (0–30)</span>
                    <span className="font-mono text-teal-800">{calcReading} / 30 → Band {readingBand.toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="30"
                    value={calcReading}
                    onChange={(e) => setCalcReading(Number(e.target.value))}
                    className="w-full accent-teal-600"
                  />
                </div>

                <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-2">
                  <div className="flex justify-between items-center text-xs font-semibold">
                    <span>Listening (0–30)</span>
                    <span className="font-mono text-teal-800">{calcListening} / 30 → Band {listeningBand.toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="30"
                    value={calcListening}
                    onChange={(e) => setCalcListening(Number(e.target.value))}
                    className="w-full accent-teal-600"
                  />
                </div>

                <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-2">
                  <div className="flex justify-between items-center text-xs font-semibold">
                    <span>Writing (0–30)</span>
                    <span className="font-mono text-teal-800">{calcWriting} / 30 → Band {writingBand.toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="30"
                    value={calcWriting}
                    onChange={(e) => setCalcWriting(Number(e.target.value))}
                    className="w-full accent-teal-600"
                  />
                </div>

                <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-2">
                  <div className="flex justify-between items-center text-xs font-semibold">
                    <span>Speaking (0–30)</span>
                    <span className="font-mono text-teal-800">{calcSpeaking} / 30 → Band {speakingBand.toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="30"
                    value={calcSpeaking}
                    onChange={(e) => setCalcSpeaking(Number(e.target.value))}
                    className="w-full accent-teal-600"
                  />
                </div>
              </div>

              {/* Total Output Card */}
              <div className="bg-gradient-to-r from-teal-50 to-blue-50 border border-teal-200 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-xs uppercase font-bold text-teal-800 tracking-wider">Estimated Overall Score</span>
                  <div className="text-2xl font-black text-slate-900 flex items-baseline gap-2">
                    <span>{totalScore} / 120</span>
                    <span className="text-base font-bold text-teal-700">· Band {overallBand.toFixed(1)} / 6.0</span>
                  </div>
                  <p className="text-xs text-slate-600 font-medium">
                    CEFR Alignment: <strong className="text-slate-900">{cefr.name} ({cefr.code})</strong>
                  </p>
                </div>
                <div className="text-right">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold border ${cefr.colorClass}`}>
                    {cefr.code} Mastery
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-3 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>Source: ETS "Updated TOEFL iBT® Test Overview"</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
