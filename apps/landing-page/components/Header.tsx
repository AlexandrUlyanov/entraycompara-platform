
import React, { useState, useEffect } from 'react';
import { MenuIcon, CloseIcon, EmojiLightBulbIcon } from './Icons.tsx'; 
import { useLanguage, languages } from '../context/LanguageContext.tsx';
import LanguageSelector from './LanguageSelector.tsx';

const Header: React.FC = () => {
  const { t, language, setLanguage } = useLanguage();
  
  const navLinks = [
    { href: '#/inicio', label: t('header.nav_home') },
    { href: '#/analisis-gratuito', label: t('header.nav_analysis') },
    { href: '#/faq', label: t('header.nav_faq') },
    { href: '#/newsletter-signup-banner', label: t('header.nav_guide') },
    { href: '#/live-requests', label: t('header.nav_activity') },
  ];

  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  
  // Logo text setup
  const logoText = "Entra y Compara";
  const splitLogo = logoText.split('');

  // Helper for language flags/labels in mobile
  const getMobileLangLabel = (code: string) => {
     const map: Record<string, string> = {
         es: '🇪🇸 Español',
         ru: '🇷🇺 Русский',
         uk: '🇺🇦 Українська',
         eu: '🏴󠁥󠁳󠁰󠁶󠁿 Euskara'
     };
     return map[code] || languages[code as keyof typeof languages];
  };

  return (
    <>
      <style>{`
        @keyframes internal-light {
          0%, 100% {
            color: #1d1d1f;
            text-shadow: none;
          }
          50% {
            color: #FFFDF5; /* Soft White-Gold Core */
            text-shadow: 
              0 0 5px rgba(255, 223, 0, 0.4),
              0 0 10px rgba(218, 165, 32, 0.25),
              0 0 20px rgba(218, 165, 32, 0.1);
          }
        }
        .logo-char {
          display: inline-block;
          white-space: pre;
          will-change: color, text-shadow;
          color: #1d1d1f;
          transition: color 0.3s ease;
        }
        /* Trigger animation on hover or active (click) of the parent group */
        .group:hover .logo-char,
        .group:active .logo-char {
          animation: internal-light 3s ease-in-out infinite;
        }
      `}</style>
      <header 
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ease-in-out ${
          isMobileMenuOpen
            ? 'bg-transparent border-none' // When menu is open, header is transparent to blend with menu overlay
            : isScrolled 
                ? 'bg-white/80 backdrop-blur-xl backdrop-saturate-150 border-b border-white/20 h-16 shadow-sm' 
                : 'bg-transparent h-24'
        }`}
      >
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl h-full">
          <div className="flex items-center justify-between h-full">
            {/* Logo Section */}
            <a 
              href="#/" 
              className="group relative z-50 select-none flex items-center cursor-pointer"
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => { setIsHovered(false); setIsActive(false); }}
              onMouseDown={() => setIsActive(true)}
              onMouseUp={() => setIsActive(false)}
              onClick={(e) => {
                if (!window.location.hash.startsWith('#/privacy') && !window.location.hash.startsWith('#/terms')) {
                  e.preventDefault(); 
                  window.history.pushState(null, "", '#/');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
                setIsMobileMenuOpen(false);
              }}
              aria-label={t('header.aria_go_home')}
            >
              <div className="mr-2">
                <EmojiLightBulbIcon className="h-8 w-8" isLit={isHovered} isExtraLit={isActive} />
              </div>
              <h1 className="text-[22px] font-semibold tracking-tight font-sans flex">
                {splitLogo.map((char, index) => (
                  <span
                    key={index}
                    className="logo-char"
                    style={{ 
                      // Shorter delay for hover responsiveness (0.1s instead of 1.5s)
                      animationDelay: `${index * 0.1}s`, 
                    }}
                  >
                    {char}
                  </span>
                ))}
              </h1>
            </a>
            
            {/* Desktop Nav */}
            <div className="flex items-center">
              <nav className="hidden lg:flex items-center space-x-8 mr-8" aria-label="Menú de escritorio">
                {navLinks.map(link => (
                  <a 
                    key={link.href} 
                    href={link.href} 
                    className="text-[15px] font-medium text-secondary hover:text-primary transition-colors duration-300"
                  >
                    {link.label}
                  </a>
                ))}
              </nav>
              
              <div className="hidden lg:block">
                <LanguageSelector />
              </div>
              
              {/* Mobile Toggle */}
              <div className="lg:hidden ml-4 relative z-50">
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className={`p-2.5 rounded-full transition-all duration-300 focus:outline-none border ${
                      isMobileMenuOpen 
                      ? 'bg-slate-100 text-secondary-DEFAULT border-slate-200' // Distinct look when menu is open (Close button)
                      : 'bg-white/60 backdrop-blur-md text-secondary-DEFAULT border-white/20 hover:bg-white/80' // Glass look when closed
                  }`}
                  aria-expanded={isMobileMenuOpen}
                  aria-label={isMobileMenuOpen ? t('header.aria_close_menu') : t('header.aria_open_menu')}
                >
                  {isMobileMenuOpen ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Menu - Glass Sheet */}
        <div 
          className={`fixed inset-0 z-40 bg-white/95 backdrop-blur-2xl transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            isMobileMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'
          }`}
        >
          <div className="flex flex-col h-full pt-28 px-6 pb-8 overflow-y-auto">
            <nav className="space-y-4">
              {navLinks.map((link, idx) => (
                <a 
                  key={link.href} 
                  href={link.href} 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`block text-3xl font-bold text-secondary-DEFAULT tracking-tight transition-all duration-500 hover:text-primary transform ${isMobileMenuOpen ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}
                  style={{ transitionDelay: `${idx * 50}ms` }}
                >
                  {link.label}
                </a>
              ))}
            </nav>

            {/* Mobile Language Selector - Large Tappable Grid */}
            <div className={`mt-auto pt-8 border-t border-slate-100 transition-all duration-500 delay-300 ${isMobileMenuOpen ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}>
              <div className="grid grid-cols-2 gap-3">
                {Object.keys(languages).map((code) => (
                  <button
                    key={code}
                    onClick={() => {
                      setLanguage(code);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`
                      flex items-center justify-center px-4 py-4 rounded-2xl text-base font-medium transition-all duration-200
                      ${language === code 
                        ? 'bg-primary text-white shadow-lg shadow-primary/30 scale-[1.02]' 
                        : 'bg-slate-50 text-secondary border border-slate-100 hover:bg-slate-100'
                      }
                    `}
                  >
                    {getMobileLangLabel(code)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>
    </>
  );
};

export default Header;
