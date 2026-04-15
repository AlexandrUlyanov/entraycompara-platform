
import React, { useRef, useEffect, useState } from 'react';
import { useLanguage } from '../context/LanguageContext.tsx';
import { ExclamationTriangleIconSolid, CheckCircleIconSolid } from './Icons.tsx';

const ProblemSolutionSection: React.FC = () => {
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
      { threshold: 0.2 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="py-12 md:py-24 bg-transparent overflow-hidden">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className={`text-4xl md:text-5xl font-semibold text-secondary-DEFAULT mb-4 transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            {t('problemSolution.title', { _default: '¿Cansado de pagar de más en tus facturas?' })}
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Problem Side */}
          <div className={`relative bg-slate-50 p-10 rounded-[30px] transition-all duration-1000 delay-100 transform ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-20'}`}>
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                 <ExclamationTriangleIconSolid className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-xl font-semibold mb-4 text-secondary-DEFAULT">{t('problemSolution.problem_title', { _default: 'El Problema' })}</h3>
              <p className="text-lg text-secondary-light leading-relaxed">
                {t('problemSolution.problem_desc', { _default: 'Las compañías suben precios sin avisar, las facturas son incomprensibles y pasar horas al teléfono para reclamar es agotador.' })}
              </p>
            </div>
          </div>

          {/* Solution Side */}
          <div className={`relative bg-slate-50 p-10 rounded-[30px] transition-all duration-1000 delay-300 transform ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-20'}`}>
             <div className="text-center">
               <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircleIconSolid className="w-8 h-8 text-emerald-600" />
               </div>
              <h3 className="text-xl font-semibold mb-4 text-secondary-DEFAULT">{t('problemSolution.solution_title', { _default: 'La Solución' })}</h3>
              <p className="text-lg text-secondary-light leading-relaxed">
                {t('problemSolution.solution_desc', { _default: 'Entraycompara analiza tu consumo real, busca entre todas las ofertas del mercado y te dice exactamente cuánto puedes ahorrar.' })}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProblemSolutionSection;
