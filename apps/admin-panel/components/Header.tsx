import React from 'react';
import { useTranslation } from '../i18n';

interface HeaderProps {
  onLogout: () => void;
  onLogoClick: () => void;
  setLanguage: (lang: 'ru' | 'es') => void;
}

const LanguageSwitcher: React.FC<{ setLanguage: (lang: 'ru' | 'es') => void }> = ({ setLanguage }) => {
  const { language } = useTranslation();
  
  const buttonClasses = (lang: 'ru' | 'es') => 
    `px-3 py-1 text-xs font-semibold rounded-full transition-all duration-300 ` +
    (language === lang
      ? 'bg-white text-secondary shadow-sm'
      : 'text-secondary-light hover:text-secondary hover:bg-white/40');

  return (
    <div className="flex items-center p-1 bg-white/30 backdrop-blur-md rounded-full border border-white/20 shadow-inner">
      <button onClick={() => setLanguage('ru')} className={buttonClasses('ru')}>RU</button>
      <button onClick={() => setLanguage('es')} className={buttonClasses('es')}>ES</button>
    </div>
  );
};


const Header: React.FC<HeaderProps> = ({ onLogout, onLogoClick, setLanguage }) => {
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-30 bg-white/60 backdrop-blur-2xl border-b border-white/20 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={onLogoClick}>
            <div className="bg-gradient-to-br from-primary-500 to-primary-600 p-2.5 rounded-xl shadow-apple group-hover:shadow-apple-hover transition-all duration-300 transform group-hover:scale-105">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
            </div>
            <h1 className="text-xl font-semibold text-secondary tracking-tight">{t('header.title')}</h1>
          </div>
          <div className="flex items-center gap-5">
            <LanguageSwitcher setLanguage={setLanguage} />
            <div className="h-6 w-px bg-slate-300/50 mx-1"></div>
            <button
              onClick={onLogout}
              className="group inline-flex items-center px-5 py-2.5 text-sm font-medium text-secondary-light bg-white/50 hover:bg-white rounded-full border border-transparent hover:border-slate-200 shadow-sm transition-all duration-200"
            >
               <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-slate-400 group-hover:text-red-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="group-hover:text-secondary">{t('header.logout')}</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;