import React from 'react';
import { X, Award, CheckCircle2 } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const RubricGuideModal: React.FC<Props> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto shadow-2xl border border-slate-200 p-6 sm:p-8 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Official ETS TOEFL iBT Scoring Rubrics</h2>
              <p className="text-xs text-slate-500">Benchmark scoring standards and performance level descriptors</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Key Callout: Updated ETS 1.0-6.0 Scoring Scale */}
        <div className="bg-gradient-to-r from-teal-50 to-blue-50 border border-teal-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-teal-800 text-white">
              Official ETS Update
            </span>
            <h3 className="text-sm font-bold text-slate-900">
              New 1.0 – 6.0 Band Scale & Dual Reporting System
            </h3>
          </div>
          <p className="text-xs text-slate-700 leading-relaxed">
            In the updated TOEFL iBT testing framework, official score reports feature a <strong>1.0 to 6.0 Band Scale</strong> (reported in 0.5-point increments: 1.0, 1.5, 2.0 ... 6.0) that maps directly to the 6 Common European Framework of Reference (CEFR) levels from A1 to C2.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[11px] text-slate-600">
            <div className="bg-white/80 p-2.5 rounded-lg border border-teal-100">
              <strong className="text-slate-900 block mb-0.5">Reported Section Band (1.0 – 6.0):</strong>
              Each of the 4 sections (Reading, Listening, Speaking, Writing) is assigned a 1.0–6.0 band score. The Overall TOEFL Band is the average of all 4 sections rounded to the nearest half-point.
            </div>
            <div className="bg-white/80 p-2.5 rounded-lg border border-teal-100">
              <strong className="text-slate-900 block mb-0.5">Dual Concordance (0 – 120):</strong>
              During the ongoing adoption period, ETS provides both the new 1.0–6.0 Band Score and the legacy 0–120 total (0–30 per section) scaled scores for university admissions requirements.
            </div>
          </div>
        </div>

        {/* Section 1: Score Conversion Table */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider flex items-center justify-between">
            <span>TOEFL 1.0–6.0 Band, Scaled (0-120), and CEFR Concordance</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border border-slate-200 rounded-lg overflow-hidden">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">CEFR Level</th>
                  <th className="py-2.5 px-3">TOEFL Band (1.0–6.0)</th>
                  <th className="py-2.5 px-3">Section (0–30)</th>
                  <th className="py-2.5 px-3">Total (0–120)</th>
                  <th className="py-2.5 px-3">Proficiency Competency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-slate-800">
                <tr className="bg-purple-50/40">
                  <td className="py-2 px-3 font-sans font-bold text-purple-900">C2 Proficient</td>
                  <td className="py-2 px-3 font-bold text-purple-800">6.0</td>
                  <td className="py-2 px-3">29 – 30</td>
                  <td className="py-2 px-3 font-semibold">114 – 120</td>
                  <td className="py-2 px-3 font-sans text-slate-600">Mastery; native-like fluidity, nuance, and academic precision</td>
                </tr>
                <tr className="bg-teal-50/40">
                  <td className="py-2 px-3 font-sans font-bold text-teal-900">C1 Advanced</td>
                  <td className="py-2 px-3 font-bold text-teal-800">5.0 – 5.5</td>
                  <td className="py-2 px-3">23 – 28</td>
                  <td className="py-2 px-3 font-semibold">95 – 113</td>
                  <td className="py-2 px-3 font-sans text-slate-600">Effective operational proficiency in rigorous higher-education</td>
                </tr>
                <tr className="bg-blue-50/40">
                  <td className="py-2 px-3 font-sans font-bold text-blue-900">B2 Upper-Int.</td>
                  <td className="py-2 px-3 font-bold text-blue-800">4.0 – 4.5</td>
                  <td className="py-2 px-3">17 – 22</td>
                  <td className="py-2 px-3 font-semibold">72 – 94</td>
                  <td className="py-2 px-3 font-sans text-slate-600">Independent user; standard undergraduate/graduate entrance benchmark</td>
                </tr>
                <tr className="bg-amber-50/40">
                  <td className="py-2 px-3 font-sans font-bold text-amber-900">B1 Intermediate</td>
                  <td className="py-2 px-3 font-bold text-amber-800">3.0 – 3.5</td>
                  <td className="py-2 px-3">11 – 16</td>
                  <td className="py-2 px-3 font-semibold">42 – 71</td>
                  <td className="py-2 px-3 font-sans text-slate-600">Threshold proficiency; understands key concepts with occasional errors</td>
                </tr>
                <tr className="bg-white">
                  <td className="py-2 px-3 font-sans font-bold text-slate-700">A2 Elementary</td>
                  <td className="py-2 px-3 font-bold text-slate-700">2.0 – 2.5</td>
                  <td className="py-2 px-3">5 – 10</td>
                  <td className="py-2 px-3 font-semibold">20 – 41</td>
                  <td className="py-2 px-3 font-sans text-slate-600">Basic communication; limited academic vocabulary</td>
                </tr>
                <tr className="bg-slate-50/50">
                  <td className="py-2 px-3 font-sans font-bold text-slate-500">A1 Beginner</td>
                  <td className="py-2 px-3 font-bold text-slate-500">1.0 – 1.5</td>
                  <td className="py-2 px-3">0 – 4</td>
                  <td className="py-2 px-3 font-semibold">&lt; 20</td>
                  <td className="py-2 px-3 font-sans text-slate-600">Introductory familiarity with isolated words and phrases</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 2: Raw Task Rubrics vs Reported Band */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
              Writing Tasks: Internal ETS 0–5 Rubric (Converts to Band 1–6)
            </h3>
            <span className="text-[11px] text-teal-800 font-medium">Scored by AI + Certified Human Rater</span>
          </div>
          <p className="text-xs text-slate-600">
            While section report cards display the <strong>1.0–6.0 Band Score</strong>, raters score individual writing tasks (like <em>Academic Discussion</em> and <em>Write an Email</em>) using this granular <strong>0–5 analytic rubric</strong>:
          </p>
          <div className="space-y-2 text-xs">
            <div className="border border-slate-200 rounded-lg p-3 bg-teal-50/30">
              <div className="flex items-center justify-between font-semibold text-teal-900 mb-1">
                <span>Rubric 5.0 (Converts to Band 5.5–6.0 / 28–30 Scaled)</span>
                <span className="font-mono">Outstanding Contribution</span>
              </div>
              <p className="text-slate-700 leading-relaxed">
                Response is a highly relevant, well-elaborated contribution. Syntactic structures are diverse and accurate. Vocabulary choice is precise with natural academic collocations. Directly engages with peers’ arguments while adding distinct evidence.
              </p>
            </div>

            <div className="border border-slate-200 rounded-lg p-3 bg-white">
              <div className="flex items-center justify-between font-semibold text-slate-900 mb-1">
                <span>Rubric 4.0 (Converts to Band 4.5–5.0 / 22–27 Scaled)</span>
                <span className="font-mono">Competent Contribution</span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Response makes a clear and relevant contribution. Well-developed ideas with good supporting examples. Noticeable syntactic variety, with occasional minor lexical slips that do not obscure meaning.
              </p>
            </div>

            <div className="border border-slate-200 rounded-lg p-3 bg-white">
              <div className="flex items-center justify-between font-semibold text-slate-900 mb-1">
                <span>Rubric 3.0 (Converts to Band 3.5–4.0 / 16–21 Scaled)</span>
                <span className="font-mono">Developing Contribution</span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Response is partially developed. Repetitive sentence structures or noticeable word-choice errors. May briefly reference peers but lacks in-depth elaboration or nuanced synthesis.
              </p>
            </div>
          </div>
        </div>

        {/* Section 3: Speaking Rubric Summary */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
              Speaking Tasks: Internal ETS 0–4 Rubric (Converts to Band 1–6)
            </h3>
            <span className="text-[11px] text-teal-800 font-medium">Evaluated by SpeechRater & Certified Raters</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
              <span className="font-semibold text-slate-900 block mb-1">Delivery & Intonation (0–4 Scale)</span>
              <p className="text-slate-600 leading-snug">
                Clear speech with natural pacing, appropriate intonation, and minor phonological accents that do not impede intelligibility.
              </p>
            </div>
            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
              <span className="font-semibold text-slate-900 block mb-1">Language Use & Topic Flow (0–4 Scale)</span>
              <p className="text-slate-600 leading-snug">
                Effective control of complex grammar, varied connecting transition words, and accurate vocabulary choice.
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};
