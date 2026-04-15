import React from 'react';
import { useLanguage } from '../context/LanguageContext.tsx';

const TermsConditionsPage: React.FC = () => {
  const { t, language } = useLanguage();
  
  const lastUpdatedDate = new Date().toLocaleDateString(language, { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20 text-slate-800">
      <div className="max-w-3xl mx-auto bg-white p-8 md:p-12 rounded-[32px] shadow-apple border border-slate-100">
        <h1 className="text-3xl md:text-4xl font-bold text-secondary-DEFAULT mb-2 text-center tracking-tight">
          {t('policyPages.terms_title')}
        </h1>
        
        <p className="mb-10 text-center text-secondary-light text-sm">
          {t('policyPages.last_updated', { date: lastUpdatedDate })}
        </p>

        <div className="prose prose-lg max-w-none text-secondary leading-relaxed">
          
          <p className="lead text-xl font-medium text-secondary-DEFAULT mb-8">
            {t('policyPages.terms_intro')}
          </p>

          {/* 1. Use */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-secondary-DEFAULT mb-3">{t('policyPages.terms_h_use')}</h2>
            <p>{t('policyPages.terms_use_text')}</p>
          </section>

          {/* 2. Service Description */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-secondary-DEFAULT mb-3">{t('policyPages.terms_h_service')}</h2>
            <p>{t('policyPages.terms_service_text')}</p>
          </section>
          
          {/* 3. Liability */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-secondary-DEFAULT mb-3">{t('policyPages.terms_h_liability')}</h2>
            <p>{t('policyPages.terms_liability_text')}</p>
          </section>

          {/* 4. IP */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-secondary-DEFAULT mb-3">{t('policyPages.terms_h_ip')}</h2>
            <p>{t('policyPages.terms_ip_text')}</p>
          </section>

          {/* 5. Law & Jurisdiction */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-secondary-DEFAULT mb-3">{t('policyPages.terms_h_law')}</h2>
            <p>{t('policyPages.terms_law_text')}</p>
          </section>

          {/* Contact Info (Static in JSON/Code now) */}
          <section className="mt-10 pt-10 border-t border-slate-100">
            <p className="text-secondary font-medium">
              Email: <a href="mailto:info@entraycompara.com" className="text-primary hover:underline">info@entraycompara.com</a>
            </p>
          </section>

        </div>

        <div className="mt-12 text-center">
          <a href="#/" className="inline-flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-secondary-DEFAULT font-medium py-3 px-8 rounded-full transition-all duration-200 shadow-sm">
            {t('policyPages.back_to_main')}
          </a>
        </div>
      </div>
    </div>
  );
};

export default TermsConditionsPage;