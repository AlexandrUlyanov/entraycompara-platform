
import React from 'react';
import { useLanguage } from '../context/LanguageContext.tsx';
import { NewSavingsIcon, CheckCircleIconSolid, WifiIcon, TrustBadgeIcon } from './Icons.tsx';

const BenefitsSection: React.FC = () => {
  const { t } = useLanguage();

  const benefits = [
    {
      icon: <NewSavingsIcon className="w-8 h-8 text-emerald-500" />,
      title: t('benefits.b1_title', { _default: 'Ahorro real' }),
      desc: t('benefits.b1_desc', { _default: 'Nuestros usuarios ahorran de media 300€/año, gracias a las mejores tarifas adaptadas.' })
    },
    {
      icon: <TrustBadgeIcon className="w-8 h-8 text-primary" />,
      title: t('benefits.b2_title', { _default: 'Protección contra subidas' }),
      desc: t('benefits.b2_desc', { _default: 'Si tu tarifa deja de ser competitiva, te avisamos para que puedas reconsiderar tu opción.' })
    },
    {
      icon: <WifiIcon className="w-8 h-8 text-purple-500" />,
      title: t('benefits.b3_title', { _default: 'Sin complicaciones' }),
      desc: t('benefits.b3_desc', { _default: 'No hay obras, interrupciones del servicio ni cambios técnicos: solo un trámite administrativo.' })
    },
    {
      icon: <CheckCircleIconSolid className="w-8 h-8 text-orange-500" />, 
      title: t('benefits.b4_title', { _default: 'Servicio gratuito para ti' }),
      desc: t('benefits.b4_desc', { _default: 'No hay coste para ti. Nuestro modelo se basa en una tarifa que pagan las comercializadoras.' })
    }
  ];

  return (
    <section className="py-12 md:py-24 bg-transparent">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-semibold text-secondary-DEFAULT tracking-tight">
            {t('benefits.title', { _default: 'Ventajas de usar EntrayCompara' })}
          </h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {benefits.map((item, idx) => (
            <div key={idx} className="bg-background-off p-8 rounded-[28px] hover:bg-slate-50 transition-colors duration-300 h-full flex flex-col items-center text-center md:items-start md:text-left">
              <div className="mb-6">
                {item.icon}
              </div>
              <h3 className="text-lg font-bold text-secondary-DEFAULT mb-3">{item.title}</h3>
              <p className="text-secondary-light text-base leading-relaxed">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default BenefitsSection;
