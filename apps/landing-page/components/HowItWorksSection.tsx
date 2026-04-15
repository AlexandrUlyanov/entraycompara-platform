
import React, { useRef, useEffect, useState } from 'react';
import { useLanguage } from '../context/LanguageContext.tsx';
import { CloudArrowUpIcon, SparklesIcon, NewSavingsIcon } from './Icons.tsx';

const HowItWorksSection: React.FC = () => {
  const { t } = useLanguage();
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  const steps = [
    {
      icon: <CloudArrowUpIcon className="w-8 h-8 text-primary" />,
      title: t('howItWorks.step1_title', { _default: '1. Sube tu Factura' }),
      desc: t('howItWorks.step1_desc', { _default: 'Haz una foto o sube el PDF de tu última factura. Es 100% seguro.' }),
    },
    {
      icon: <SparklesIcon className="w-8 h-8 text-purple-500" />,
      title: t('howItWorks.step2_title', { _default: '2. Analizamos Gratis' }),
      desc: t('howItWorks.step2_desc', { _default: 'Nuestra tecnología compara tu tarifa con más de 40 compañías.' }),
    },
    {
      icon: <NewSavingsIcon className="w-8 h-8 text-emerald-500" />,
      title: t('howItWorks.step3_title', { _default: '3. Empieza a Ahorrar' }),
      desc: t('howItWorks.step3_desc', { _default: 'Te enviamos la mejor oferta. Si te gusta, gestionamos el cambio gratis.' }),
    }
  ];

  return (
    <section ref={sectionRef} className="py-12 md:py-24 bg-transparent text-secondary">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        
        <div className="text-center mb-20 max-w-3xl mx-auto">
          <h2 className={`text-4xl md:text-5xl font-semibold text-secondary-DEFAULT mb-6 transition-all duration-700 tracking-tight ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            {t('howItWorks.title', { _default: 'Ahorrar es tan fácil como contar hasta 3' })}
          </h2>
          <p className={`text-2xl text-secondary-light font-medium transition-all duration-700 delay-100 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            {t('howItWorks.subtitle', { _default: 'Sin papeleos complicados. Nosotros hacemos el trabajo duro.' })}
          </p>
        </div>

        {/* Bento Grid Layout */}
        <div className="grid md:grid-cols-3 gap-6">
          {steps.map((step, index) => (
            <div 
              key={index} 
              className={`bg-white rounded-[28px] p-8 shadow-apple hover:shadow-apple-hover transition-all duration-500 transform ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'}`}
              style={{ transitionDelay: `${index * 150}ms` }}
            >
              <div className="mb-6 p-3 bg-background-off rounded-xl inline-block">
                {step.icon}
              </div>
              <h3 className="text-xl font-semibold text-secondary-DEFAULT mb-3">{step.title}</h3>
              <p className="text-base text-secondary-light leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
