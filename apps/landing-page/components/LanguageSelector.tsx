
import React, { useState, useRef, useEffect } from 'react';
import { useLanguage, languages } from '../context/LanguageContext.tsx';

const LanguageSelector: React.FC = () => {
  const { language, setLanguage } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const langDetails = {
    es: { flag: 'ES', name: 'Español' },
    ru: { flag: 'RU', name: 'Русский' },
    uk: { flag: 'UA', name: 'Українська' },
    eu: { flag: 'EU', name: 'Euskara' },
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [wrapperRef]);
  
  const handleLanguageChange = (langCode: string) => {
    setLanguage(langCode);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        className="inline-flex items-center justify-center rounded-full px-3 py-1.5 text-xs font-medium text-secondary-DEFAULT hover:bg-black/5 transition-all duration-200 focus:outline-none"
        id="options-menu"
        aria-haspopup="true"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`Current language: ${language.toUpperCase()}`}
      >
        <span className="mr-1.5 text-secondary-light font-semibold tracking-wide">{langDetails[language as keyof typeof langDetails].flag}</span>
        <svg className={`h-3 w-3 text-secondary-light transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-40 rounded-2xl shadow-apple-hover bg-white/90 backdrop-blur-xl ring-1 ring-black/5 focus:outline-none z-50 overflow-hidden origin-top-right"
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="options-menu"
        >
          <div className="py-1" role="none">
            {Object.entries(languages).map(([code, name]) => (
              <button
                key={code}
                onClick={() => handleLanguageChange(code)}
                className={`w-full text-left flex items-center px-4 py-2.5 text-sm transition-colors duration-150 ${language === code ? 'bg-primary/10 text-primary font-semibold' : 'text-secondary hover:bg-black/5'}`}
                role="menuitem"
              >
                <span className="w-6 mr-2 text-xs font-bold text-secondary-light uppercase">{code}</span>
                {name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default LanguageSelector;
