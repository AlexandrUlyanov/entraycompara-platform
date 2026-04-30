
import React, { useState, useEffect, Suspense, lazy, useMemo } from 'react';
import Header from './components/Header.tsx';
import HeroSection from './components/HeroSection.tsx';
import NewsletterSection from './components/NewsletterSection.tsx';
import ProblemSolutionSection from './components/ProblemSolutionSection.tsx';
import HowItWorksSection from './components/HowItWorksSection.tsx';
import BenefitsSection from './components/BenefitsSection.tsx';
import TargetAudienceSection from './components/TargetAudienceSection.tsx';
import TestimonialsSection from './components/TestimonialsSection.tsx';
import WhyUsSection from './components/WhyUsSection.tsx';
import FAQSection from './components/FAQSection.tsx';
import FinalCTASection from './components/FinalCTASection.tsx';
import LiveRequestsBlock from './components/LiveRequestsBlock.tsx';
import Footer from './components/Footer.tsx';
import CookieConsentBanner from './components/CookieConsentBanner.tsx';
import SEOMetadata from './components/SEOMetadata.tsx';
import PostSubmitPage from './components/PostSubmitPage.tsx';
import { LanguageProvider, useLanguage } from './context/LanguageContext.tsx';

const PrivacyPolicyPage = lazy(() => import('./components/PrivacyPolicyPage.tsx'));
const TermsConditionsPage = lazy(() => import('./components/TermsConditionsPage.tsx'));

const PageLoader: React.FC = () => {
  const { t } = useLanguage();
  return (
    <div className="flex justify-center items-center min-h-screen w-full bg-white/50 backdrop-blur-sm">
      <p className="text-lg text-primary font-medium">{t('app.loading', { _default: 'Loading...' })}</p>
    </div>
  );
};

// Component for the animated background particles
const BackgroundParticles = () => {
  // Generate static random data for particles to ensure hydration match
  const particles = useMemo(() => {
    return [...Array(12)].map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      size: `${Math.random() * 60 + 20}px`, // 20px to 80px
      duration: `${Math.random() * 15 + 15}s`, // 15s to 30s (slow rise)
      delay: `${Math.random() * 10}s`,
      // Alternating colors: Emerald (Money), Amber (Gold), Blue (Trust)
      colorClass: i % 3 === 0 
        ? 'bg-emerald-200' 
        : i % 3 === 1 
        ? 'bg-amber-200' 
        : 'bg-blue-200'
    }));
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <div
          key={p.id}
          className={`particle absolute rounded-full mix-blend-multiply filter blur-[4px] opacity-30 ${p.colorClass}`}
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            animationDuration: p.duration,
            animationDelay: p.delay,
          }}
        />
      ))}
    </div>
  );
};

const AppContent: React.FC = () => {
  const [currentPage, setCurrentPage] = useState(() => window.location.hash || '#/');

  useEffect(() => {
    const handleHashChange = () => {
      const newHash = window.location.hash || '#/';
      setCurrentPage(newHash);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  useEffect(() => {
    const hash = currentPage;
    const isTopLevelPage = hash === '#/privacy-policy' || hash === '#/terms-conditions' || hash === '#/solicitud-recibida';

    if (isTopLevelPage) {
      window.scrollTo(0, 0);
    } else if (hash.startsWith('#/') && hash.length > 2) {
      const anchorId = hash.substring(2);
      const element = document.getElementById(anchorId);
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
      }
    } else if (hash === '#/') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentPage]);

  let pageContent;
  switch (currentPage) {
    case '#/privacy-policy':
      pageContent = (
        <Suspense fallback={<PageLoader />}>
          <PrivacyPolicyPage />
        </Suspense>
      );
      break;
    case '#/terms-conditions':
      pageContent = (
        <Suspense fallback={<PageLoader />}>
          <TermsConditionsPage />
        </Suspense>
      );
      break;
    case '#/solicitud-recibida':
      pageContent = <PostSubmitPage />;
      break;
    default:
      pageContent = (
        <>
          <Header />
          <main className="relative z-10">
            <HeroSection />
            <ProblemSolutionSection />
            <HowItWorksSection />
            <BenefitsSection />
            <TargetAudienceSection />
            <TestimonialsSection />
            <WhyUsSection />
            <FAQSection />
            <NewsletterSection />
            <FinalCTASection />
            <LiveRequestsBlock />
          </main>
          <Footer />
        </>
      );
  }

  return (
    <div className="font-sans text-secondary-DEFAULT text-base leading-relaxed min-h-screen flex flex-col relative antialiased selection:bg-primary/20 selection:text-primary-dark overflow-x-hidden bg-slate-50">
      <SEOMetadata />
      
      {/* --- Multi-Layered Background Animation --- */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        
        {/* Layer 1: Subtle Grid (Analysis/Structure) */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImgridIiIHg9IjAiIHk9IjAiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTTAgNDBMMDQgMEgwIiBmaWxsPSJub25lIiBzdHJva2U9IiNlNWU3ZWIiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-40"></div>

        {/* Layer 2: Large Organic Gradient Blobs (Atmosphere) */}
        <div className="absolute top-[-10%] left-[-10%] w-[45rem] h-[45rem] bg-emerald-100/60 rounded-full mix-blend-multiply filter blur-[90px] animate-blob"></div>
        <div className="absolute top-[20%] right-[-10%] w-[40rem] h-[40rem] bg-amber-100/50 rounded-full mix-blend-multiply filter blur-[90px] animate-blob delay-2000"></div>
        <div className="absolute bottom-[-20%] left-[20%] w-[50rem] h-[50rem] bg-blue-100/60 rounded-full mix-blend-multiply filter blur-[90px] animate-blob delay-4000"></div>

        {/* Layer 3: Rising Particles (Economy/Savings Flow) */}
        <BackgroundParticles />
        
      </div>

      <div className="relative z-10">
        {pageContent}
      </div>
      
      <CookieConsentBanner />
    </div>
  );
};

const App: React.FC = () => {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  );
};

export default App;
