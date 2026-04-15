
import React from 'react';
import { useLanguage } from '../context/LanguageContext.tsx';
import { NewFamilyIcon, NewBusyPersonIcon, UserIconGeneric } from './Icons.tsx';

const TargetAudienceSection: React.FC = () => {
  const { t } = useLanguage();

  const audiences = [
    {
      icon: <NewFamilyIcon className="w-16 h-16 text-sky-500 mx-auto mb-4" />,
      title: t('targetAudience.t1_title', { _default: 'Familias' }),
      desc: t('targetAudience.t1_desc', { _default: 'Optimiza el gasto para lo que realmente importa.' })
    },
    {
      icon: <NewBusyPersonIcon className="w-16 h-16 text-indigo-500 mx-auto mb-4" />,
      title: t('targetAudience.t2_title', { _default: 'Autónomos' }),
      desc: t('targetAudience.t2_desc', { _default: 'Reduce los costes fijos de tu negocio u oficina.' })
    },
    {
      icon: <UserIconGeneric className="w-16 h-16 text-emerald-500 mx-auto mb-4" />,
      title: t('targetAudience.t3_title', { _default: 'Seniors' }),
      desc: t('targetAudience.t3_desc', { _default: 'Explicaciones claras y sencillas, sin tecnicismos.' })
    }
  ];

  return (
    <section className="py-12 md:py-24 bg-transparent border-t border-slate-200">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-800">
            {t('targetAudience.title', { _default: 'Ayudamos a todo tipo de hogares' })}
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {audiences.map((item, idx) => (
            <div key={idx} className="text-center p-6 bg-white rounded-xl shadow-sm">
              {item.icon}
              <h3 className="text-2xl font-semibold text-slate-800 mb-2">{item.title}</h3>
              <p className="text-xl text-slate-600">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TargetAudienceSection;
