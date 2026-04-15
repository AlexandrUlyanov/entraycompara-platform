
import React, { useState } from 'react';
import { useLanguage } from '../context/LanguageContext.tsx';

interface FAQItemProps {
  question: string;
  answer: string;
  idSuffix: string;
}

const FAQItem: React.FC<FAQItemProps> = ({ question, answer, idSuffix }) => {
  const [isOpen, setIsOpen] = useState(false);
  const questionId = `faq-question-${idSuffix}`;
  const answerId = `faq-answer-${idSuffix}`;

  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <h3>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex justify-between items-center w-full py-8 px-8 text-left text-secondary-DEFAULT hover:bg-slate-50 transition-colors duration-200 group"
          aria-expanded={isOpen}
          aria-controls={answerId}
          id={questionId}
        >
          <span className="text-xl md:text-2xl font-semibold tracking-tight group-hover:text-primary transition-colors">
            {question}
          </span>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center bg-slate-100 group-hover:bg-primary/10 transition-colors duration-200 ml-6 flex-shrink-0`}>
            <svg
              className={`w-5 h-5 transform transition-transform duration-300 text-slate-500 group-hover:text-primary ${isOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path>
            </svg>
          </div>
        </button>
      </h3>
      <div
        id={answerId}
        role="region"
        aria-labelledby={questionId}
        className={`overflow-hidden transition-all duration-500 ease-in-out ${isOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="text-secondary-light leading-relaxed px-8 pb-8 pt-0 text-lg md:text-xl font-medium">
          {answer}
        </div>
      </div>
    </div>
  );
};

const FAQSection: React.FC = () => {
  const { t } = useLanguage();

  const faqs = [
    { question: t('faq.q1'), answer: t('faq.a1') },
    { question: t('faq.q2'), answer: t('faq.a2') },
    { question: t('faq.q3'), answer: t('faq.a3') },
    { question: t('faq.q4'), answer: t('faq.a4') },
    { question: t('faq.q5'), answer: t('faq.a5') },
  ];

  return (
    <section id="faq" className="relative pt-8 md:pt-10 pb-12 md:pb-24 bg-transparent overflow-hidden">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 max-w-4xl">
        <div className="text-center mb-16 initial-hidden animate-fadeInUp">
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-semibold text-secondary-DEFAULT mb-6 tracking-tight">
            {t('faq.title')}
          </h2>
          <p className="text-xl md:text-2xl text-secondary-light font-medium">{t('faq.subtitle')}</p>
        </div>
        <div className="bg-white border border-slate-100 shadow-apple rounded-[32px] overflow-hidden initial-hidden animate-fadeInUp delay-200">
          {faqs.map((faq, index) => (
            <FAQItem key={index} question={faq.question} answer={faq.answer} idSuffix={index.toString()} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default FAQSection;
