
import React from 'react';
import { useLanguage } from '../context/LanguageContext.tsx';
import { CheckCircleIconSolid, UserGroupIcon, DocumentIcon, TrustBadgeIcon } from './Icons.tsx';

const WhyUsSection: React.FC = () => {
  const { t } = useLanguage();

  const handleScrollToForm = () => {
    const element = document.getElementById('analisis-gratuito');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <section className="pt-12 md:pt-24 pb-8 md:pb-10 relative overflow-hidden">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center max-w-7xl relative z-10">
        <h2 className="text-4xl md:text-5xl font-semibold mb-20 tracking-tight text-secondary-DEFAULT">
          {t('whyUs.title', { _default: 'Confianza y transparencia' })}
        </h2>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-12 mb-20 max-w-6xl mx-auto">
          <div className="flex flex-col items-center p-6 rounded-3xl hover:bg-white/80 hover:shadow-apple hover:scale-105 transition-all duration-300">
             <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center mb-6 text-green-500">
                <CheckCircleIconSolid className="w-8 h-8" />
             </div>
             <h3 className="text-lg font-bold mb-3 text-secondary-DEFAULT">{t('whyUs.reason1_title', { _default: '100% Gratuito' })}</h3>
             <p className="text-secondary-light text-base leading-relaxed">{t('whyUs.reason1_desc', { _default: 'No te costará nada realizar el análisis.' })}</p>
          </div>
          
          <div className="flex flex-col items-center p-6 rounded-3xl hover:bg-white/80 hover:shadow-apple hover:scale-105 transition-all duration-300">
             <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-6 text-primary">
                <UserGroupIcon className="w-8 h-8" />
             </div>
             <h3 className="text-lg font-bold mb-3 text-secondary-DEFAULT">{t('whyUs.reason2_title', { _default: 'Atención Personalizada' })}</h3>
             <p className="text-secondary-light text-base leading-relaxed">{t('whyUs.reason2_desc', { _default: 'No eres un número, eres una persona.' })}</p>
          </div>
          
          <div className="flex flex-col items-center p-6 rounded-3xl hover:bg-white/80 hover:shadow-apple hover:scale-105 transition-all duration-300">
             <div className="w-16 h-16 rounded-2xl bg-purple-50 flex items-center justify-center mb-6 text-purple-500">
                <DocumentIcon className="w-8 h-8" />
             </div>
             <h3 className="text-lg font-bold mb-3 text-secondary-DEFAULT">{t('whyUs.reason3_title', { _default: 'Sin Preocupaciones' })}</h3>
             <p className="text-secondary-light text-base leading-relaxed">{t('whyUs.reason3_desc', { _default: 'Nos encargamos de todo el papeleo.' })}</p>
          </div>
          
          <div className="flex flex-col items-center p-6 rounded-3xl hover:bg-white/80 hover:shadow-apple hover:scale-105 transition-all duration-300">
             <div className="w-16 h-16 rounded-2xl bg-orange-50 flex items-center justify-center mb-6 text-orange-500">
                <TrustBadgeIcon className="w-8 h-8" />
             </div>
             <h3 className="text-lg font-bold mb-3 text-secondary-DEFAULT">{t('whyUs.reason4_title', { _default: 'Privacidad' })}</h3>
             <p className="text-secondary-light text-base leading-relaxed">{t('whyUs.reason4_desc', { _default: 'Cumplimos RGPD. Tus datos no se venden.' })}</p>
          </div>
        </div>

        <button 
          onClick={handleScrollToForm}
          className="inline-block bg-primary text-white font-medium py-4 px-10 rounded-full text-lg hover:bg-primary-dark shadow-lg hover:shadow-primary/30 transition-all duration-300 transform hover:scale-[1.02]"
        >
          {t('whyUs.cta', { _default: 'Analizar mi factura ahora' })}
        </button>
      </div>
    </section>
  );
};

export default WhyUsSection;
