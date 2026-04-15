
import React, { useState } from 'react';
import { CheckCircleIconSolid, ExclamationTriangleIconSolid, SpinnerIcon } from './Icons.tsx';
import { useLanguage } from '../context/LanguageContext.tsx';

interface NewsletterFormProps {
  idSuffix: string;
  variant?: 'page' | 'footer';
}

type FormStatus = 'idle' | 'submitting' | 'success' | 'error';

const NewsletterForm: React.FC<NewsletterFormProps> = ({ idSuffix, variant = 'page' }) => {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<FormStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const nameInputId = `newsletter-name-${idSuffix}`;
  const emailInputId = `newsletter-email-${idSuffix}`;

  const validateEmail = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const resetForm = () => {
    setName('');
    setEmail('');
    setStatus('idle');
    setMessage(null);
    setNameError(null);
    setEmailError(null);
  };
  
  const handleBackToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    resetForm(); 
    if (window.location.hash !== '#/' && window.location.hash !== '') {
        window.location.hash = '#/';
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNameError(null);
    setEmailError(null);
    setMessage(null);

    let isValid = true;
    if (!name.trim()) {
      setNameError(t('newsletterForm.name_error'));
      isValid = false;
    }
    if (!email.trim()) {
      setEmailError(t('newsletterForm.email_error_required'));
      isValid = false;
    } else if (!validateEmail(email)) {
      setEmailError(t('newsletterForm.email_error_invalid'));
      isValid = false;
    }

    if (!isValid) {
      setStatus('error'); 
      return;
    }

    setStatus('submitting');
    setMessage(null);

    await new Promise(resolve => setTimeout(resolve, 1500));

    if (Math.random() > 0.15) { 
      setStatus('success');
      setMessage(t('newsletterForm.success_message'));
      setName('');
      setEmail('');
    } else {
      setStatus('error');
      setMessage(t('newsletterForm.error_message'));
    }
  };

  const isFooterVariant = variant === 'footer';
  
  // Apple Style Classes
  const containerClasses = isFooterVariant 
    ? "bg-white p-6 rounded-2xl shadow-apple w-full mx-auto max-w-md border border-slate-100" 
    : "bg-white p-10 rounded-[32px] shadow-apple-hover w-full mx-auto max-w-lg border border-slate-50";
    
  const labelClasses = "block text-sm font-medium text-secondary-DEFAULT mb-2";
  
  const inputBaseClasses = `block w-full bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-primary focus:bg-white text-secondary placeholder-slate-400 transition-all duration-200 ${isFooterVariant ? 'px-4 py-3 text-base' : 'px-5 py-4 text-lg'}`;
  
  const inputErrorClasses = "ring-2 ring-red-500 bg-red-50 text-red-900 placeholder-red-300";
  
  const submitButtonClasses = `w-full flex justify-center items-center rounded-full font-semibold text-white bg-secondary hover:bg-secondary-dark transition-all duration-300 shadow-lg transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none ${isFooterVariant ? 'text-base py-3 px-6' : 'text-lg py-4 px-8'}`;
  
  const gdprTextClasses = "text-center text-xs text-secondary-light mt-4";

  if (status === 'success') {
    return (
      <div className={containerClasses}>
        <div className="text-center py-8">
          <CheckCircleIconSolid className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h3 className="text-2xl font-semibold text-secondary-DEFAULT mb-3">{t('newsletterForm.success_title')}</h3>
          <p className="text-secondary-light text-lg mb-8">{message}</p>
          <button onClick={handleBackToTop} className="text-primary font-medium hover:underline text-lg">
            {t('newsletterForm.success_button')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={containerClasses}>
      <div className="text-center mb-8">
         <p className="text-2xl font-semibold text-secondary-DEFAULT tracking-tight">
            {t('newsletterForm.form_title')}
         </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {status === 'error' && message && (
          <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex items-start">
            <ExclamationTriangleIconSolid className="h-5 w-5 text-red-500 mt-0.5 mr-3 flex-shrink-0" />
            <p className="text-sm text-red-600 font-medium">{message}</p>
          </div>
        )}
        
        <div>
          <label htmlFor={nameInputId} className={labelClasses}>{t('newsletterForm.name_label')}</label>
          <input
            type="text" name="name" id={nameInputId} value={name} onChange={(e) => setName(e.target.value)}
            placeholder={t('newsletterForm.name_placeholder')}
            required aria-required="true"
            className={`${inputBaseClasses} ${nameError ? inputErrorClasses : ''}`}
            disabled={status === 'submitting'}
          />
          {nameError && <p className="mt-2 text-sm text-red-500 font-medium ml-1">{nameError}</p>}
        </div>

        <div>
          <label htmlFor={emailInputId} className={labelClasses}>{t('newsletterForm.email_label')}</label>
          <input
            type="email" name="email" id={emailInputId} value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder={t('newsletterForm.email_placeholder')}
            required aria-required="true"
            className={`${inputBaseClasses} ${emailError ? inputErrorClasses : ''}`}
            disabled={status === 'submitting'}
          />
          {emailError && <p className="mt-2 text-sm text-red-500 font-medium ml-1">{emailError}</p>}
        </div>

        <div className="pt-2">
          <button type="submit" disabled={status === 'submitting'} className={submitButtonClasses}>
            {status === 'submitting' ? (
              <>
                <SpinnerIcon className="w-5 h-5 mr-3 text-white/80" />
                {t('newsletterForm.submitting_button')}
              </>
            ) : (
              t('newsletterForm.submit_button')
            )}
          </button>
        </div>
        <p className={gdprTextClasses}>
          {t('newsletterForm.gdpr_text')}
        </p>
      </form>
    </div>
  );
};

export default NewsletterForm;
