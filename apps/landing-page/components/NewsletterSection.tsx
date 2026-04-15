
import React, { useEffect, useRef, useState } from 'react';
import NewsletterForm from './NewsletterForm.tsx';
import { BoltIcon, DropletIcon, DevicePhoneMobileIcon, UserGroupIcon, CogIcon, BookOpenIcon } from './Icons.tsx';
import { useLanguage } from '../context/LanguageContext.tsx';

const NewsletterSection: React.FC = () => {
  const { t } = useLanguage();
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1 }
    );

    const currentRef = sectionRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, []);

  const BenefitItem: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
    <li className="flex items-center space-x-3 py-1.5">
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary">
        {icon}
      </span>
      <span className="text-base text-secondary-DEFAULT" dangerouslySetInnerHTML={{ __html: text }} />
    </li>
  );

  return (
    <section 
      id="newsletter-signup-banner" 
      ref={sectionRef}
      className={`py-12 md:py-24 bg-transparent overflow-hidden relative ${isVisible ? 'animate-fadeInUp' : 'initial-hidden'}`}
      aria-labelledby="newsletter-banner-heading"
    >
      {/* Background Elements - Subtle */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-t from-blue-50 to-transparent rounded-[100%] filter blur-[60px] opacity-50"></div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl relative z-10">
        
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Text Content */}
          <div className="space-y-8">
            <div>
              <h2 id="newsletter-banner-heading" className="text-4xl md:text-5xl font-semibold text-secondary-DEFAULT tracking-tight mb-4">
                {t('newsletterSection.main_title_part1')}
              </h2>
              <p className="text-xl text-secondary-light font-medium leading-relaxed">
                {t('newsletterSection.subtitle')}
              </p>
            </div>

            <div className="space-y-4">
               <p className="text-lg font-semibold text-secondary-DEFAULT mb-2">{t('newsletterSection.guide_discover_title')}</p>
               <ul className="space-y-1">
                 <BenefitItem icon={<BoltIcon className="w-3.5 h-3.5" />} text={t('newsletterSection.benefit_electric_gas')} />
                 <BenefitItem icon={<DropletIcon className="w-3.5 h-3.5" />} text={t('newsletterSection.benefit_water')} />
                 <BenefitItem icon={<DevicePhoneMobileIcon className="w-3.5 h-3.5" />} text={t('newsletterSection.benefit_internet_mobile')} />
                 <BenefitItem icon={<UserGroupIcon className="w-3.5 h-3.5" />} text={t('newsletterSection.benefit_social_bonus')} />
                 <BenefitItem icon={<CogIcon className="w-3.5 h-3.5" />} text={t('newsletterSection.benefit_smart_habits')} />
               </ul>
            </div>
            
            <div className="flex items-center space-x-3 text-secondary-light pt-2">
                 <BookOpenIcon className="w-5 h-5 text-primary"/>
                 <p className="text-sm font-medium" dangerouslySetInnerHTML={{ __html: t('newsletterSection.guide_info') }} />
            </div>
          </div>

          {/* Form Card */}
          <div className="relative mt-8 lg:mt-0">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-100/50 to-purple-100/50 rounded-[40px] transform rotate-2 scale-105 blur-lg opacity-60"></div>
            <div className="relative">
              <NewsletterForm idSuffix="banner-form" variant="page" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default NewsletterSection;
