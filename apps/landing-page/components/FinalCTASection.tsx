
import React, { useState, useEffect } from 'react';
import { CloudArrowUpIcon } from './Icons.tsx';
import { useLanguage } from '../context/LanguageContext.tsx';

const FinalCTASection: React.FC = () => {
  const [isMobile, setIsMobile] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleClick = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('trigger-hero-file-upload'));
    }, 100); 
  };

  const buttonText = isMobile ? t('finalCta.button_mobile') : t('finalCta.button_desktop');

  return (
    <section
      id="cta-button-section"
      className="w-full py-12 md:py-24 bg-transparent flex flex-col items-center justify-center"
    >
       <div className="text-center max-w-2xl px-4">
          <h2 className="text-4xl font-semibold text-secondary-DEFAULT mb-10 tracking-tight">
            Empieza a ahorrar hoy mismo.
          </h2>
          <button
            onClick={handleClick}
            className="inline-flex items-center justify-center bg-primary text-white rounded-full px-10 py-4 text-xl font-medium hover:bg-primary-dark transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
            aria-label={buttonText}
          >
            <CloudArrowUpIcon className="w-6 h-6 mr-3" />
            {buttonText}
          </button>
       </div>
    </section>
  );
};

export default FinalCTASection;
