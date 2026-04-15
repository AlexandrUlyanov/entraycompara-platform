
import React, { useState, useEffect, useMemo } from 'react';
import { FacebookIcon, InstagramIcon, WhatsAppIcon, YouTubeIcon, UserIconGeneric } from './Icons.tsx';
import { useLanguage } from '../context/LanguageContext.tsx';

type TestimonialSource = 'instagram' | 'facebook' | 'youtube' | 'whatsapp' | 'unknown';

interface Testimonial {
  id: number;
  text: string;
  author: string;
  name: string;
  city: string;
  avatarSrc: string;
  source: TestimonialSource;
}

const parseAuthor = (authorString: string): { name: string; city: string } => {
  const parts = authorString.split(',').map(part => part.trim());
  if (parts.length > 1) {
    return { name: parts[0], city: parts.slice(1).join(', ') };
  }
  return { name: parts[0], city: '' };
};

// Relative paths for production compatibility
const staticData = [
  { id: 1, avatarSrc: "image/ana-s.png" },
  { id: 2, avatarSrc: "image/juan-p.png" },
  { id: 3, avatarSrc: "image/maria.jpg" },
  { id: 4, avatarSrc: "image/carlos-r.png" },
  { id: 5, avatarSrc: "image/luis-m.png" }
];

const DISPLAY_DURATION_PER_CHAR_MS = 10; 
const PAUSE_BEFORE_NEXT_SLIDE_MS = 4000;

const TestimonialSlider: React.FC = () => {
  const { t } = useLanguage();

  const testimonialsData: Testimonial[] = useMemo(() => {
    const translatedTestimonials = t('testimonials', { _default: [] });
    if (!Array.isArray(translatedTestimonials) || translatedTestimonials.length === 0) return [];

    return staticData.map((staticItem, index) => {
      const translatedItem = translatedTestimonials[index];
      if (!translatedItem) return null;
      const sources: TestimonialSource[] = ['facebook', 'instagram', 'youtube', 'whatsapp'];
      // Use a deterministic random source based on ID to prevent flicker on re-render
      const sourceIndex = (staticItem.id * 7) % sources.length;
      const randomSource = sources[sourceIndex];

      return {
        ...staticItem,
        text: translatedItem.text,
        author: translatedItem.author,
        ...parseAuthor(translatedItem.author),
        source: randomSource,
      };
    }).filter((item): item is Testimonial => item !== null);
  }, [t]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [imgError, setImgError] = useState<Record<number, boolean>>({});
  
  const currentTestimonial = testimonialsData[currentIndex];

  // Typewriter Effect Logic
  useEffect(() => {
    if (!currentTestimonial) return;

    setDisplayedText('');
    setIsTyping(true);

    let charIndex = 0;
    const fullText = currentTestimonial.text;
    const totalTypingTime = fullText.length * DISPLAY_DURATION_PER_CHAR_MS;
    
    const typingInterval = setInterval(() => {
      charIndex++;
      setDisplayedText(fullText.slice(0, charIndex));
      if (charIndex >= fullText.length) {
        clearInterval(typingInterval);
        setIsTyping(false);
      }
    }, DISPLAY_DURATION_PER_CHAR_MS);

    const nextSlideTimeout = setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % testimonialsData.length);
    }, totalTypingTime + PAUSE_BEFORE_NEXT_SLIDE_MS);

    return () => {
      clearInterval(typingInterval);
      clearTimeout(nextSlideTimeout);
    };
  }, [currentIndex, currentTestimonial, testimonialsData.length]);

  const renderSourceIcon = (source: TestimonialSource) => {
    const iconProps = { className: "w-6 h-6 opacity-90" };
    switch (source) {
      case 'instagram': return <InstagramIcon {...iconProps} className="w-6 h-6 text-[#E1306C]" />;
      case 'facebook': return <FacebookIcon {...iconProps} className="w-6 h-6 text-[#1877F2]" />;
      case 'youtube': return <YouTubeIcon {...iconProps} className="w-6 h-6 text-[#FF0000]" />;
      case 'whatsapp': return <WhatsAppIcon {...iconProps} className="w-6 h-6 text-[#25D366]" />;
      default: return null;
    }
  };

  const handleImgError = (id: number) => {
    setImgError(prev => ({ ...prev, [id]: true }));
  };

  if (!testimonialsData.length) return <div className="h-[500px]"></div>;

  return (
    <div className="w-full flex flex-col items-center text-center justify-start pt-4">
      
      {/* Avatar & Info Container */}
      <div className="flex flex-col items-center animate-fadeInUp">
        <div className="relative mb-8 w-64 h-64">
          
          {/* Avatar Frame - Static Container */}
          <div className="absolute inset-0 rounded-full p-2 bg-white shadow-apple border border-slate-100 overflow-hidden">
             {/* Render ALL images stacked on top of each other for smooth cross-fade */}
             {testimonialsData.map((item, index) => {
               const isActive = index === currentIndex;
               return (
                 <div 
                    key={item.id}
                    className={`absolute inset-2 rounded-full overflow-hidden bg-white transition-all duration-1000 ease-[cubic-bezier(0.25,1,0.5,1)]
                      ${isActive ? 'opacity-100 scale-100 z-10' : 'opacity-0 scale-110 z-0'}
                    `}
                 >
                   {imgError[item.id] ? (
                     <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-400">
                       <UserIconGeneric className="w-24 h-24" />
                     </div>
                   ) : (
                     <img 
                       src={item.avatarSrc} 
                       alt={item.name}
                       className="w-full h-full object-cover"
                       onError={() => handleImgError(item.id)}
                     />
                   )}
                 </div>
               );
             })}
          </div>

          {/* Source Icon Badge - Stacked animation */}
          <div className="absolute bottom-4 right-4 w-12 h-12 z-20">
             {testimonialsData.map((item, index) => {
               const isActive = index === currentIndex;
               return (
                 <div 
                   key={`icon-${item.id}`} 
                   className={`absolute inset-0 bg-white rounded-full p-3 shadow-md border border-slate-50 flex items-center justify-center transition-all duration-700 ease-in-out
                     ${isActive ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-50'}
                   `}
                 >
                   {renderSourceIcon(item.source)}
                 </div>
               );
             })}
          </div>
        </div>

        {/* Name and City - Smooth Fade */}
        <div className="mb-8 h-20 flex flex-col items-center justify-center relative w-full">
           {testimonialsData.map((item, index) => {
             const isActive = index === currentIndex;
             return (
               <div 
                 key={`meta-${item.id}`}
                 className={`absolute top-0 left-0 right-0 transition-all duration-700 ease-in-out
                   ${isActive ? 'opacity-100 translate-y-0 blur-0' : 'opacity-0 -translate-y-4 blur-sm'}
                 `}
               >
                  <h4 className="text-2xl font-semibold text-secondary-DEFAULT">{item.name}</h4>
                  <p className="text-lg text-secondary-light">{item.city}</p>
               </div>
             );
           })}
        </div>
      </div>

      {/* Review Text Container */}
      <div className="max-w-xl mx-auto px-4 h-40 flex items-start justify-center overflow-hidden">
        <p 
          className={`text-xl md:text-2xl leading-relaxed text-secondary-DEFAULT font-medium transition-opacity duration-300 ${isTyping ? 'typewriter-cursor' : ''}`}
          aria-label={currentTestimonial?.text}
        >
          "{displayedText}"
        </p>
      </div>

      {/* Progress Dots */}
      <div className="flex space-x-2 mt-8">
        {testimonialsData.map((_, idx) => (
          <div 
            key={idx}
            className={`h-1.5 rounded-full transition-all duration-500 ${idx === currentIndex ? 'w-8 bg-primary' : 'w-2 bg-slate-200'}`}
          />
        ))}
      </div>

    </div>
  );
};

export default TestimonialSlider;
