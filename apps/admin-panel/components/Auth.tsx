import React, { useState } from 'react';
import { useTranslation } from '../i18n';

interface AuthProps {
  onTokenSet: (token: string) => void;
}

const Auth: React.FC<AuthProps> = ({ onTokenSet }) => {
  const [inputValue, setInputValue] = useState('');
  const { t } = useTranslation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onTokenSet(inputValue.trim());
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 relative overflow-hidden font-sans">
      
      {/* Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40rem] h-[40rem] bg-blue-200/30 rounded-full mix-blend-multiply filter blur-[100px] animate-blob"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40rem] h-[40rem] bg-indigo-200/30 rounded-full mix-blend-multiply filter blur-[100px] animate-blob animation-delay-2000"></div>

      <div className="max-w-md w-full bg-white/70 backdrop-blur-2xl p-10 rounded-[40px] shadow-apple border border-white/60 z-10 relative animate-fade-in-up">
        <div className="flex flex-col items-center mb-10">
            <div className="h-20 w-20 bg-gradient-to-br from-primary-500 to-primary-600 rounded-[20px] flex items-center justify-center mb-6 shadow-apple transform hover:scale-105 transition-transform duration-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
            </div>
            <h2 className="text-3xl font-bold text-secondary tracking-tight">{t('auth.title')}</h2>
            <p className="text-center text-secondary-light mt-3 text-sm leading-relaxed max-w-[260px] font-medium">
            {t('auth.prompt')}
            </p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
             <input
                type="password"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={t('auth.placeholder')}
                className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all outline-none text-secondary placeholder-slate-400 shadow-inner text-center tracking-widest font-medium"
                aria-label="Secret Key Input"
            />
          </div>
          <button
            type="submit"
            className="w-full px-6 py-4 text-sm font-bold text-white bg-primary rounded-2xl shadow-lg shadow-primary/30 hover:bg-primary-dark hover:shadow-primary/40 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-[0.98]"
            disabled={!inputValue.trim()}
          >
            {t('auth.button')}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Auth;