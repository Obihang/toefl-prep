import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export interface AccordionSection {
  id: string;
  title: React.ReactNode;
  content: React.ReactNode;
  icon?: React.ReactNode;
}

interface AccordionProps {
  sections: AccordionSection[];
  storageKey?: string;
}

export const Accordion: React.FC<AccordionProps> = ({ sections, storageKey = 'dashboard_settings_accordion_open' }) => {
  const [openId, setOpenId] = useState<string>(() => {
    if (sections.length === 0) return '';
    const saved = localStorage.getItem(storageKey);
    if (saved && sections.some((s) => s.id === saved)) {
      return saved;
    }
    return sections[0].id;
  });

  useEffect(() => {
    if (openId) {
      localStorage.setItem(storageKey, openId);
    }
  }, [openId, storageKey]);

  const toggleSection = (id: string) => {
    setOpenId((prev) => (prev === id ? '' : id));
  };

  return (
    <div className="space-y-3">
      {sections.map((section) => {
        const isOpen = openId === section.id;
        return (
          <div key={section.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden transition-all shadow-2xs">
            <button
              type="button"
              onClick={() => toggleSection(section.id)}
              className="w-full p-4 text-left font-bold text-sm text-slate-900 flex items-center justify-between cursor-pointer hover:bg-slate-50/60 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                {section.icon}
                <span>{section.title}</span>
              </div>
              {isOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
            </button>
            {isOpen && (
              <div className="px-4 pb-4 pt-1 border-t border-slate-100 animate-in fade-in duration-200">
                {section.content}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
