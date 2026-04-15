import React from 'react';
import { useLanguage } from '../context/LanguageContext.tsx';

const PrivacyPolicyPage: React.FC = () => {
  const { t, language } = useLanguage();
  
  // Standardize date format for display (e.g., "10 de marzo de 2024")
  const lastUpdatedDate = new Date().toLocaleDateString(language, { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20 text-slate-800">
      <div className="max-w-4xl mx-auto bg-white p-8 md:p-12 rounded-[32px] shadow-apple border border-slate-100">
        <h1 className="text-3xl md:text-4xl font-bold text-secondary-DEFAULT mb-2 text-center tracking-tight">
          {t('policyPages.privacy_title')}
        </h1>
        
        <p className="mb-10 text-center text-secondary-light text-sm">
          {t('policyPages.last_updated', { date: lastUpdatedDate })}
        </p>

        <div className="prose prose-lg max-w-none text-secondary leading-relaxed">
          
          {/* Intro */}
          <p className="lead text-xl font-medium text-secondary-DEFAULT mb-8">
            {t('policyPages.privacy_intro')}
          </p>

          {/* 1. Controller */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-secondary-DEFAULT mb-4">{t('policyPages.privacy_h_controller')}</h2>
            <p>{t('policyPages.privacy_controller_text')}</p>
          </section>

          {/* 2. Collected Data */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-secondary-DEFAULT mb-4">{t('policyPages.privacy_h_collected')}</h2>
            <p className="mb-4">{t('policyPages.privacy_collected_text')}</p>
            <ul className="list-disc pl-5 space-y-2 marker:text-primary">
              <li>{t('policyPages.privacy_list_contacts')}</li>
              <li>{t('policyPages.privacy_list_docs')}</li>
              <li>{t('policyPages.privacy_list_tech')}</li>
            </ul>
          </section>

          {/* 3. Purpose */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-secondary-DEFAULT mb-4">{t('policyPages.privacy_h_purpose')}</h2>
            <p className="mb-4">{t('policyPages.privacy_purpose_text')}</p>
            <ul className="list-disc pl-5 space-y-2 marker:text-primary">
              <li>{t('policyPages.privacy_list_purpose_1')}</li>
              <li>{t('policyPages.privacy_list_purpose_2')}</li>
              <li>{t('policyPages.privacy_list_purpose_3')}</li>
              <li>{t('policyPages.privacy_list_purpose_4')}</li>
            </ul>
          </section>

          {/* 4. Legitimation */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-secondary-DEFAULT mb-4">{t('policyPages.privacy_h_legitimation')}</h2>
            <p>{t('policyPages.privacy_legitimation_text')}</p>
          </section>

          {/* 5. Sharing */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-secondary-DEFAULT mb-4">{t('policyPages.privacy_h_sharing')}</h2>
            <p className="mb-4">{t('policyPages.privacy_sharing_text')}</p>
            <ul className="list-disc pl-5 space-y-2 marker:text-primary">
              <li>{t('policyPages.privacy_list_share_1')}</li>
              <li>{t('policyPages.privacy_list_share_2')}</li>
              <li>{t('policyPages.privacy_list_share_3')}</li>
            </ul>
            <p className="mt-4 font-semibold text-secondary-DEFAULT">{t('policyPages.privacy_sharing_note')}</p>
          </section>

          {/* 6. Security */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-secondary-DEFAULT mb-4">{t('policyPages.privacy_h_security')}</h2>
            <p>{t('policyPages.privacy_security_text')}</p>
          </section>

          {/* 7. Rights */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-secondary-DEFAULT mb-4">{t('policyPages.privacy_h_rights')}</h2>
            <p className="mb-4">{t('policyPages.privacy_rights_text')}</p>
            <ul className="list-disc pl-5 space-y-2 marker:text-primary">
              <li>{t('policyPages.privacy_list_right_1')}</li>
              <li>{t('policyPages.privacy_list_right_2')}</li>
              <li>{t('policyPages.privacy_list_right_3')}</li>
              <li>{t('policyPages.privacy_list_right_4')}</li>
              <li>{t('policyPages.privacy_list_right_5')}</li>
            </ul>
            <p className="mt-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
              {t('policyPages.privacy_rights_contact')}
            </p>
          </section>

          {/* 8. Cookies */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-secondary-DEFAULT mb-4">{t('policyPages.privacy_h_cookies')}</h2>
            <p>{t('policyPages.privacy_cookies_text')}</p>
          </section>

        </div>

        <div className="mt-16 text-center">
          <a href="#/" className="inline-flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-secondary-DEFAULT font-medium py-3 px-8 rounded-full transition-all duration-200 shadow-sm">
            {t('policyPages.back_to_main')}
          </a>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicyPage;