
import React from 'react';
import { FacebookIcon, InstagramIcon, TikTokIcon } from './Icons.tsx';
import { useLanguage } from '../context/LanguageContext.tsx';

const Footer: React.FC = () => {
  const { t } = useLanguage();
  const linkStyle = "hover:text-secondary-DEFAULT hover:underline transition-colors duration-200 text-secondary-light";

  return (
    <footer className="bg-background-off text-[13px] text-secondary-light pt-12 pb-12 border-t border-slate-200"> 
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
        
        <div className="grid md:grid-cols-3 gap-10 mb-12"> 
          <div>
            <h5 className="font-semibold text-secondary-DEFAULT mb-3 text-sm">
              {t('footer.company_name')}
            </h5>
            <p className="leading-relaxed text-secondary-light">
              {t('footer.company_description')}
            </p>
          </div>
          <div>
            <h5 className="font-semibold text-secondary-DEFAULT mb-3 text-sm">
              {t('footer.quick_links_title')}
            </h5>
            <ul className="space-y-2">
              <li><a href="#/" className={linkStyle}>{t('footer.link_home')}</a></li>
              <li><a href="#/analisis-gratuito" className={linkStyle}>{t('footer.link_analysis')}</a></li>
              <li><a href="#/faq" className={linkStyle}>{t('footer.link_faq')}</a></li>
              <li><a href="#/newsletter-signup-banner" className={linkStyle}>{t('footer.link_guide')}</a></li>
            </ul>
          </div>
          <div>
            <h5 className="font-semibold text-secondary-DEFAULT mb-3 text-sm">
              {t('footer.contact_title')}
            </h5>
            <ul className="space-y-2 mb-4">
              <li><span className="text-secondary-DEFAULT">{t('footer.contact_email')}</span> <a href="mailto:info@entraycompara.com" className="text-primary hover:underline">info@entraycompara.com</a></li>
              <li><span className="text-secondary-DEFAULT">{t('footer.contact_phone')}</span> <a href="tel:+34611974984" className="text-primary hover:underline">+34 611 97 49 84</a> <span className="text-secondary-light block mt-1">{t('footer.contact_phone_example')}</span></li>
            </ul>
            <div className="flex space-x-4 mt-4"> 
              <a href="https://www.facebook.com/profile.php?id=61583988643175&rdid=dnUDDRx1CKhSa6Kg" target="_blank" rel="noopener noreferrer" aria-label={t('footer.aria_facebook')} className="text-slate-400 hover:text-primary transition-colors"><FacebookIcon className="h-5 w-5" /></a>
              <a href="https://www.instagram.com/entraycompara/" target="_blank" rel="noopener noreferrer" aria-label={t('footer.aria_instagram')} className="text-slate-400 hover:text-primary transition-colors"><InstagramIcon className="h-5 w-5" /></a>
              <a href="https://www.tiktok.com/@entraycompara" target="_blank" rel="noopener noreferrer" aria-label={t('footer.aria_tiktok')} className="text-slate-400 hover:text-primary transition-colors"><TikTokIcon className="h-5 w-5" /></a>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-8"> 
          <div className="flex flex-col md:flex-row justify-between items-center text-slate-400 text-xs">
                <p>{t('footer.copyright', { year: new Date().getFullYear() })}</p>
                <div className="mt-4 md:mt-0 space-x-6 flex">
                  <a href="#/privacy-policy" className="hover:text-secondary-DEFAULT transition-colors border-r border-slate-300 pr-6">{t('footer.privacy_policy')}</a> 
                  <a href="#/terms-conditions" className="hover:text-secondary-DEFAULT transition-colors">{t('footer.terms_conditions')}</a> 
                </div>
            </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
