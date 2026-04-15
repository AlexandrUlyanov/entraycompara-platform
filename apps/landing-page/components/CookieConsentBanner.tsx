
import React, { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext.tsx';

const COOKIE_CONSENT_KEY = 'cookie_consent_given';

const CookieConsentBanner: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    const consentGiven = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!consentGiven) {
      setIsVisible(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'true');
    setIsVisible(false);
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div 
      className="fixed bottom-0 left-0 right-0 bg-slate-200 text-slate-800 p-4 md:p-6 shadow-2xl z-[100] initial-hidden animate-fadeInUp"
      role="dialog"
      aria-live="polite"
      aria-label={t('cookieBanner.aria_label')}
    >
      <div className="container mx-auto flex flex-col md:flex-row items-center justify-between">
        <div className="text-2xl mb-4 md:mb-0 md:mr-6 text-slate-700">
          <p>
            {t('cookieBanner.text')}{' '}
            <a href="#/privacy-policy" className="underline hover:text-secondary transition-colors">
              {t('cookieBanner.privacy_policy_link')}
            </a>.
          </p>
        </div>
        <button
          onClick={handleAccept}
          className="bg-primary hover:bg-primary-dark text-white font-semibold py-2 px-6 rounded-md shadow-md hover:shadow-lg transition duration-300 text-2xl transform hover:scale-105 focus:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-200 focus:ring-primary whitespace-nowrap"
          aria-label={t('cookieBanner.accept_button')}
        >
          {t('cookieBanner.accept_button')}
        </button>
      </div>
    </div>
  );
};

export default CookieConsentBanner;