
import React, { createContext, useState, useContext, useEffect, useCallback, useMemo } from 'react';

// Define the shape of the context
interface LanguageContextType {
  language: string;
  setLanguage: (language: string) => void;
  t: (key: string, options?: { [key: string]: string | number | React.ReactNode }) => any;
}

// Create the context with a default value
const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// Define supported languages
export const languages = {
  es: 'Español',
  ru: 'Русский',
  uk: 'Українська',
  eu: 'Euskara',
};

// Provider component
export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<string | null>(null);
  const [translations, setTranslations] = useState<any>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const langFromUrl = params.get('lang');
    let langFromStorage: string | null = null;
    try {
        langFromStorage = localStorage.getItem('language');
    } catch(e) {
        console.warn("Could not read language from localStorage", e);
    }
    
    const initialLang = (langFromUrl && Object.keys(languages).includes(langFromUrl))
      ? langFromUrl
      : ((langFromStorage && Object.keys(languages).includes(langFromStorage)) ? langFromStorage : 'es');
    
    // Set state only if it's different to avoid re-render
    if (language !== initialLang) {
      setLanguageState(initialLang);
    }
  }, []); // Runs once on mount

  useEffect(() => {
    if (!language) return;

    const loadTranslations = async () => {
      setIsLoading(true);
      try {
        // Use relative path 'locales/' instead of absolute '/locales/'
        const response = await fetch(`locales/${language}.json`);
        if (!response.ok) {
          throw new Error(`Failed to load translations for ${language}`);
        }
        const data = await response.json();
        setTranslations(data);
      } catch (error) {
        console.error(error);
        if (language !== 'es') {
          try {
            // Fallback also uses relative path
            const response = await fetch(`locales/es.json`);
            const data = await response.json();
            setTranslations(data);
          } catch (fallbackError) {
             console.error("Failed to load fallback translations", fallbackError);
             setTranslations({});
          }
        } else {
             setTranslations({});
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadTranslations();
  }, [language]);

  const setLanguage = (lang: string) => {
    if (Object.keys(languages).includes(lang) && lang !== language) {
      setLanguageState(lang); // Optimistically update state for immediate UI feedback
      try {
        localStorage.setItem('language', lang);
        document.documentElement.lang = lang;
        
        const params = new URLSearchParams(window.location.search);
        params.set('lang', lang);
        const newSearch = '?' + params.toString();

        const newUrl = window.location.pathname + newSearch + window.location.hash;

        try {
          // Use replaceState to update the URL without adding a new history entry.
          // This can fail in sandboxed environments (e.g., with blob: URLs), hence the try-catch.
          window.history.replaceState(null, '', newUrl);
        } catch (e) {
          console.warn(`history.replaceState failed for URL '${newUrl}'. This is expected in some sandboxed environments. Falling back to page reload to set language.`);
          // Fallback to a full page reload, which is reliable.
          window.location.search = params.toString();
        }

      } catch (e) {
        console.error("An error occurred while setting the language.", e);
      }
    }
  };

  useEffect(() => {
    if (language) {
      try {
        document.documentElement.lang = language;
      } catch(e) {
        // can fail in some environments
      }
    }
  }, [language]);

  const t = useCallback((key: string, options?: { [key: string]: string | number | React.ReactNode }): any => {
    const keys = key.split('.');
    let result = keys.reduce((acc, currentKey) => {
      return acc && acc[currentKey] !== undefined ? acc[currentKey] : null;
    }, translations);

    if (result === null) {
      console.warn(`Translation key not found: ${key}`);
      return options?._default ?? key;
    }
    
    if (typeof result === 'string' && options) {
      Object.keys(options).forEach(optionKey => {
        if (optionKey !== '_default') {
            result = result.replace(new RegExp(`{{${optionKey}}}`, 'g'), String(options[optionKey]));
        }
      });
    }

    return result || (options?._default ?? key);
  }, [translations]);

  const value = useMemo(() => ({ language: language || 'es', setLanguage, t }), [language, setLanguage, t]);

  return (
    <LanguageContext.Provider value={value}>
      {!isLoading && language ? children : null}
    </LanguageContext.Provider>
  );
};

// Custom hook to use the language context
export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
