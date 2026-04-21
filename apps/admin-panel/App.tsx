import React, { useState, useRef } from 'react';
import Dashboard from './components/Dashboard';
import DetailView from './components/DetailView';
import Header from './components/Header';
import Auth from './components/Auth';
import CRMLayout from './components/CRMLayout';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTranslation } from './i18n';
import { Application } from './types';

const queryClient = new QueryClient();

function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('authToken'));
  const [activeView, setActiveView] = useState<{ view: 'dashboard' | 'detail'; appId: string | null; appDataFromList?: Application }>({ view: 'dashboard', appId: null });
  const { setLanguage } = useTranslation();
  const mainRef = useRef<HTMLElement>(null);

  const handleTokenSet = (newToken: string) => {
    localStorage.setItem('authToken', newToken);
    setToken(newToken);
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    setToken(null);
    // Reset view to dashboard on logout
    setActiveView({ view: 'dashboard', appId: null });
  };
  
  const handleSelectApplication = (app: Application) => {
    setActiveView({ view: 'detail', appId: app.id, appDataFromList: app });
    window.scrollTo(0, 0);
    mainRef.current?.scrollTo(0, 0);
  };

  const handleBackToDashboard = () => {
    setActiveView({ view: 'dashboard', appId: null });
  };

  if (!token) {
    return <Auth onTokenSet={handleTokenSet} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <CRMLayout>
        <Header onLogout={handleLogout} onLogoClick={handleBackToDashboard} setLanguage={setLanguage} />
        <main ref={mainRef} className="p-4 sm:p-6 lg:p-10 flex-1 overflow-auto">
          {activeView.view === 'dashboard' ? (
            <Dashboard onSelectApplication={handleSelectApplication} />
          ) : (
            <DetailView appId={activeView.appId!} appDataFromList={activeView.appDataFromList} onBack={handleBackToDashboard} />
          )}
        </main>
      </CRMLayout>
    </QueryClientProvider>
  );
}

export default App;