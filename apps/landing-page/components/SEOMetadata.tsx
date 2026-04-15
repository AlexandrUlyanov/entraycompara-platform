
import React, { useEffect } from 'react';
import { useLanguage, languages } from '../context/LanguageContext.tsx';

const SEOMetadata: React.FC = () => {
  const { t, language } = useLanguage();

  useEffect(() => {
    if (!language) return;

    // --- 1. Basic Meta Tags Configuration ---
    const title = t('seo.title', { _default: 'Entraycompara - Ahorra en tus facturas' });
    const description = t('seo.description', { _default: 'Descubre cómo ahorrar en tus facturas de luz, gas y móvil. Sube tu factura y Entraycompara te ofrece un análisis gratuito.' });
    const langLocale = language === 'eu' ? 'eu_ES' : `${language}_${language.toUpperCase()}`;
    const productionUrl = 'https://entraycompara.com';
    const logoUrl = `${productionUrl}/image/entraycompara-social-preview.png`;

    // Update document title
    document.title = title;

    // Update meta tags for Social Media (Open Graph & Twitter)
    const metaTags: { [key: string]: string } = {
      'description': description,
      'og:title': title,
      'og:description': description,
      'og:locale': langLocale,
      'og:url': `${productionUrl}?lang=${language}`,
      'og:image': logoUrl,
      'twitter:title': title,
      'twitter:description': description,
      'twitter:image': logoUrl,
    };

    Object.keys(metaTags).forEach(key => {
      const selector = `meta[name="${key}"], meta[property="${key}"]`;
      let element = document.querySelector(selector) as HTMLMetaElement;
      if (element) {
        element.content = metaTags[key];
      }
    });

    // --- 2. Advanced JSON-LD Structured Data for AI & SEO ---
    const jsonLdElement = document.getElementById('website-schema');
    if (jsonLdElement) {
      try {
        // Construct FAQ Schema
        const faqCount = 5;
        const faqQuestions = [];
        for (let i = 1; i <= faqCount; i++) {
          const q = t(`faq.q${i}`);
          const a = t(`faq.a${i}`);
          if (q && a) {
            faqQuestions.push({
              "@type": "Question",
              "name": q,
              "acceptedAnswer": {
                "@type": "Answer",
                "text": a
              }
            });
          }
        }

        // Complete Schema Graph
        const schema = {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": `${productionUrl}/#organization`,
              "name": "Entraycompara",
              "url": productionUrl,
              "logo": {
                "@type": "ImageObject",
                "url": logoUrl
              },
              "contactPoint": {
                "@type": "ContactPoint",
                "telephone": "+34611974984",
                "contactType": "customer service",
                "areaServed": "ES",
                "availableLanguage": ["es", "en", "ru", "uk"]
              },
              "sameAs": [
                "https://www.facebook.com/profile.php?id=61583988643175",
                "https://www.instagram.com/entraycompara/",
                "https://www.tiktok.com/@entraycompara"
              ]
            },
            {
              "@type": "WebSite",
              "@id": `${productionUrl}/#website`,
              "url": productionUrl,
              "name": "Entraycompara",
              "description": description,
              "publisher": {
                "@id": `${productionUrl}/#organization`
              },
              "inLanguage": language
            },
            {
              "@type": "Service",
              "@id": `${productionUrl}/#service`,
              "name": t('hero.title_part1') + " " + t('hero.title_part2'),
              "serviceType": "Energy Bill Analysis",
              "provider": {
                "@id": `${productionUrl}/#organization`
              },
              "areaServed": {
                "@type": "Country",
                "name": "Spain"
              },
              "description": t('hero.benefit1'),
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "EUR",
                "availability": "https://schema.org/InStock"
              }
            },
            {
              "@type": "FAQPage",
              "@id": `${productionUrl}/#faq`,
              "mainEntity": faqQuestions
            }
          ]
        };

        jsonLdElement.textContent = JSON.stringify(schema, null, 2);
      } catch (e) {
        console.error("Failed to update JSON-LD schema", e);
      }
    }

  }, [language, t]);
  
  // --- 3. Canonical and Hreflang Tags ---
  useEffect(() => {
    if (!language) return;

    const head = document.head;
    const productionUrl = 'https://entraycompara.com';

    // Manage Canonical link
    let canonicalLink = head.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonicalLink) {
        canonicalLink = document.createElement('link');
        canonicalLink.rel = 'canonical';
        head.appendChild(canonicalLink);
    }
    canonicalLink.href = `${productionUrl}?lang=${language}`;

    // Manage Hreflang links
    const existingHreflangLinks = head.querySelectorAll('link[rel="alternate"][hreflang]');
    existingHreflangLinks.forEach(link => head.removeChild(link));

    Object.keys(languages).forEach(langCode => {
        const link = document.createElement('link');
        link.rel = 'alternate';
        link.hreflang = langCode;
        link.href = `${productionUrl}?lang=${langCode}`;
        head.appendChild(link);
    });

    const defaultLink = document.createElement('link');
    defaultLink.rel = 'alternate';
    defaultLink.hreflang = 'x-default';
    defaultLink.href = `${productionUrl}?lang=es`;
    head.appendChild(defaultLink);

  }, [language]);

  return null;
};

export default SEOMetadata;
