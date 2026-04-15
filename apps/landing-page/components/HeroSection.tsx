
import React from 'react';
import FileUploadForm from './FileUploadForm.tsx';
import TestimonialSlider from './TestimonialSlider.tsx'; 
import { useLanguage } from '../context/LanguageContext.tsx';

const HeroSection: React.FC = () => {
  const { t } = useLanguage();

  const handleScrollToForm = (e: React.MouseEvent) => {
    e.preventDefault();
    const element = document.getElementById('analisis-gratuito');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <section 
      id="inicio"
      className="relative pt-32 pb-12 md:pt-40 md:pb-24 min-h-screen flex flex-col justify-center overflow-hidden bg-[url('https://pagedone.io/asset/uploads/1691055810.png')] bg-center bg-cover"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 max-w-7xl">
        
        {/* Text Content - Centered Apple Style Headline */}
        <div className="text-center max-w-4xl mx-auto mb-16">
          

          <h1 
            className="text-3xl md:text-5xl font-semibold tracking-tight mb-6 initial-hidden animate-fadeInUp text-secondary-DEFAULT"
          >
            {t('hero.title_part1')}{' '}
            <br className="hidden md:block" />
            <span className="text-primary inline-block">{t('hero.title_part2')}</span>
          </h1>
          
        </div>

        {/* Split Layout for Form & Social Proof */}
        <div className="grid lg:grid-cols-2 gap-12 items-start max-w-6xl mx-auto">
          
          {/* Form Container - Floating Card */}
          <div id="analisis-gratuito" className="w-full initial-hidden animate-fadeInUp delay-400 lg:order-2">
            <FileUploadForm 
              idSuffix="hero"
              buttonText={t('fileUploadForm.submit_button_text_alt')}
              formTitle={t('hero.form_title')}
            />
          </div>

           {/* Testimonials - Glassmorphism style */}
           <div className="w-full flex flex-col justify-center lg:order-1 initial-hidden animate-fadeInUp delay-500 mt-8 lg:mt-0">
              <div className="bg-white/40 backdrop-blur-xl border border-white/40 rounded-[30px] p-8 md:p-12 flex items-center justify-center min-h-[400px] shadow-lg">
                 <TestimonialSlider /> 
              </div>
          </div>

        </div>
      </div>
    </section>
  );
};

export default HeroSection;
