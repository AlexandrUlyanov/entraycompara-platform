
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext.tsx';
import { UserGroupIcon } from './Icons.tsx'; // Ensure this icon exists or use a standard one

const INITIAL_MONTHLY_COUNT = 1538;
const MAX_FEED_ITEMS = 6; // Reduced items for cleaner look

interface FeedItem {
  id: number;
  timestamp: Date;
}

const LiveRequestsBlock: React.FC = () => {
  const { language, t } = useLanguage();
  const [animatedMonthlyCount, setAnimatedMonthlyCount] = useState(INITIAL_MONTHLY_COUNT);
  const [actualMonthlyCount, setActualMonthlyCount] = useState(INITIAL_MONTHLY_COUNT);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isCounterVisible, setIsCounterVisible] = useState(false);
  
  const counterRef = useRef<HTMLParagraphElement>(null);
  const animationFrameId = useRef<number | null>(null);

  const formatTimeAgo = useCallback((timestamp: Date | null, now: Date): string => {
    if (!timestamp) return '';
    const seconds = Math.round((now.getTime() - timestamp.getTime()) / 1000);
  
    if (seconds < 5) return t('liveRequests.time.now');
  
    try {
      const rtf = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
      if (seconds < 60) return rtf.format(-seconds, 'second');
      const minutes = Math.round(seconds / 60);
      if (minutes < 60) return rtf.format(-minutes, 'minute');
      const hours = Math.round(minutes / 60);
      if (hours < 24) return rtf.format(-hours, 'hour');
      const days = Math.round(hours / 24);
      return rtf.format(-days, 'day');
    } catch (e) {
      if (seconds < 60) return `${seconds}s`;
      const minutes = Math.round(seconds / 60);
      if (minutes < 60) return `${minutes}m`;
      const hours = Math.round(minutes / 60);
      return `${hours}h`;
    }
  }, [language, t]);

  const formatFullDateTime = useCallback((date: Date): string => {
    return new Intl.DateTimeFormat(language, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }, [language]);


  useEffect(() => {
    setActualMonthlyCount(INITIAL_MONTHLY_COUNT + Math.floor(Math.random() * 50));
  }, []);

  useEffect(() => {
    const timerId = setInterval(() => {
      setCurrentTime(new Date());
    }, 30000);
    return () => clearInterval(timerId);
  }, []);

  const addFakeSubmission = useCallback(() => {
    setActualMonthlyCount(prevCount => prevCount + 1);
    const newItem: FeedItem = { id: Date.now(), timestamp: new Date() };
    setFeedItems(prevItems => [newItem, ...prevItems].slice(0, MAX_FEED_ITEMS));
  }, []);

  useEffect(() => {
    const now = new Date();
    const initialTimestamps: Date[] = [
      new Date(now.getTime() - 8 * 60 * 1000),
      new Date(now.getTime() - 5 * 60 * 1000),
      new Date(now.getTime() - 2 * 60 * 1000),
    ];
    setFeedItems(initialTimestamps.map(ts => ({ id: ts.getTime(), timestamp: ts })).reverse());
    const submissionInterval = setInterval(addFakeSubmission, Math.random() * 60000 + 60000);
    return () => clearInterval(submissionInterval);
  }, [addFakeSubmission]);

  useEffect(() => {
    const observer = new IntersectionObserver(
        (entries) => { if (entries[0].isIntersecting) setIsCounterVisible(true); },
        { threshold: 0.3 }
    );
    const currentCounterRef = counterRef.current;
    if (currentCounterRef) observer.observe(currentCounterRef);
    return () => {
      if (currentCounterRef) observer.unobserve(currentCounterRef);
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };
  }, []);

  useEffect(() => {
    if (!isCounterVisible || animatedMonthlyCount === actualMonthlyCount) return;

    const animateCount = (start: number, end: number, duration: number) => {
        let startTime: number | null = null;
        const step = (timestamp: number) => {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);
            setAnimatedMonthlyCount(Math.floor(start + (end - start) * progress));
            if (progress < 1) animationFrameId.current = requestAnimationFrame(step);
        };
        animationFrameId.current = requestAnimationFrame(step);
    };
    
    animateCount(animatedMonthlyCount, actualMonthlyCount, 1500);

    return () => { if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current); };
  }, [actualMonthlyCount, isCounterVisible, animatedMonthlyCount]);

  const lastRequestTimeDisplay = feedItems.length > 0 ? formatTimeAgo(feedItems[0].timestamp, currentTime) : t('liveRequests.not_available');

  return (
    <section id="live-requests" className="py-12 md:py-24 bg-transparent border-t border-slate-100">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
        
        <div className="text-center mb-12">
           <h2 className="text-4xl md:text-5xl font-semibold text-secondary-DEFAULT mb-4 tracking-tight">
             {t('liveRequests.title')}
           </h2>
           <p className="text-xl text-secondary-light">{t('liveRequests.subtitle')}</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
           {/* Stats Card */}
           <div className="bg-background-off rounded-[30px] p-8 flex flex-col justify-between h-full relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10 text-primary">
                  <UserGroupIcon className="w-32 h-32" />
              </div>
              <div>
                 <p className="text-lg font-medium text-secondary-light uppercase tracking-wide mb-2">{t('liveRequests.monthly_requests')}</p>
                 <p 
                   ref={counterRef}
                   className="text-7xl font-semibold text-secondary-DEFAULT tracking-tighter"
                 >
                   {animatedMonthlyCount.toLocaleString(language)}
                 </p>
              </div>
              <div className="mt-8 pt-8 border-t border-slate-200/50">
                 <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <p className="text-base text-secondary-light font-medium">
                        {t('liveRequests.last_request')}: <span className="text-secondary-DEFAULT">{lastRequestTimeDisplay}</span>
                    </p>
                 </div>
              </div>
           </div>

           {/* Feed Card - Notification Center Style */}
           <div className="bg-white border border-slate-100 rounded-[30px] p-8 shadow-apple h-[340px] flex flex-col">
              <div className="flex items-center justify-between mb-6">
                 <h3 className="text-lg font-semibold text-secondary-DEFAULT">{t('liveRequests.history_title')}</h3>
                 <span className="px-2 py-1 bg-slate-100 rounded-md text-xs font-medium text-secondary-light">Live</span>
              </div>
              
              <div className="flex-1 overflow-hidden relative">
                 {/* Fade overlay at bottom */}
                 <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white to-transparent pointer-events-none z-10"></div>
                 
                 <ul className="space-y-4">
                    {feedItems.map((item, idx) => (
                      <li key={item.id} className={`flex items-center justify-between p-3 rounded-xl transition-all duration-500 hover:bg-slate-50 ${idx === 0 ? 'bg-blue-50/50 animate-pulse-subtle' : ''}`}>
                        <div className="flex items-center space-x-3">
                           <div className={`w-2 h-2 rounded-full ${idx === 0 ? 'bg-primary' : 'bg-slate-300'}`}></div>
                           <span className="text-base font-medium text-secondary-DEFAULT">{t('liveRequests.request_received')}</span>
                        </div>
                        <span className="text-sm font-medium text-secondary-light tabular-nums">
                           {formatFullDateTime(item.timestamp)}
                        </span>
                      </li>
                    ))}
                 </ul>
              </div>
           </div>
        </div>

      </div>
    </section>
  );
};

export default LiveRequestsBlock;
