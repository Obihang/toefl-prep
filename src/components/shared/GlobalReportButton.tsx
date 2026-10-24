import React, { useState } from 'react';
import { MessageSquareWarning, X } from 'lucide-react';

export const GlobalReportButton: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [reportText, setReportText] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>('idle');

  const handleSubmit = async () => {
    if (!reportText.trim()) return;
    setStatus('submitting');
    
    const username = localStorage.getItem('scholar_username') || 'Scholar';
    const context = window.location.pathname;

    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: reportText, username, context }),
      });
      
      if (res.ok) {
        setStatus('success');
        setTimeout(() => {
          setIsOpen(false);
          setReportText('');
          setStatus('idle');
        }, 2000);
      } else {
        setStatus('idle');
        alert('Failed to submit report. Please try again.');
      }
    } catch {
      setStatus('idle');
      alert('Failed to submit report. Please check your connection.');
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 p-3 bg-teal-800 text-white rounded-full shadow-lg hover:bg-teal-900 transition-all cursor-pointer"
        title="Report an Issue or Feedback"
      >
        <MessageSquareWarning className="w-6 h-6" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Report an Issue or Feedback</h3>
              <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-slate-800 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {status === 'success' ? (
              <div className="text-center py-8 text-emerald-600 font-semibold">✅ Report submitted successfully!</div>
            ) : (
              <>
                <textarea
                  value={reportText}
                  onChange={(e) => setReportText(e.target.value)}
                  placeholder="Describe your issue or provide feedback..."
                  className="w-full h-32 p-3 border border-slate-300 rounded-lg text-sm focus:border-teal-600 outline-hidden"
                />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setIsOpen(false)} className="px-4 py-2 text-slate-600 hover:text-slate-900 font-semibold text-sm cursor-pointer">Cancel</button>
                  <button 
                    onClick={handleSubmit} 
                    disabled={status === 'submitting' || !reportText.trim()}
                    className="px-4 py-2 bg-teal-800 hover:bg-teal-900 text-white rounded-lg font-semibold text-sm cursor-pointer disabled:opacity-50"
                  >
                    {status === 'submitting' ? 'Submitting...' : 'Submit Report'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};
