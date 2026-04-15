import React, { useMemo } from 'react';

const BackgroundParticles = () => {
  const particles = useMemo(() => {
    return [...Array(15)].map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      size: `${Math.random() * 60 + 20}px`,
      duration: `${Math.random() * 15 + 15}s`,
      delay: `${Math.random() * 10}s`,
      // Money/Trust colors: Emerald, Amber, Blue
      colorClass: i % 3 === 0 ? 'bg-emerald-200' : i % 3 === 1 ? 'bg-amber-200' : 'bg-blue-200'
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

interface CRMLayoutProps {
  children: React.ReactNode;
}

const CRMLayout: React.FC<CRMLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen relative bg-slate-50 overflow-hidden font-sans text-secondary-DEFAULT">
      
      {/* --- BACKGROUND --- */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        {/* Layer 1: Grid */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImgridIiIHg9IjAiIHk9IjAiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTTAgNDBMMDQgMEgwIiBmaWxsPSJub25lIiBzdHJva2U9IiNlNWU3ZWIiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-40"></div>

        {/* Layer 2: Gradient Blobs */}
        <div className="absolute top-[-10%] left-[-10%] w-[45rem] h-[45rem] bg-emerald-100/60 rounded-full mix-blend-multiply filter blur-[90px] animate-blob"></div>
        <div className="absolute top-[20%] right-[-10%] w-[40rem] h-[40rem] bg-amber-100/50 rounded-full mix-blend-multiply filter blur-[90px] animate-blob delay-2000"></div>
        <div className="absolute bottom-[-20%] left-[20%] w-[50rem] h-[50rem] bg-blue-100/60 rounded-full mix-blend-multiply filter blur-[90px] animate-blob delay-4000"></div>

        {/* Layer 3: Floating Particles */}
        <BackgroundParticles />
      </div>

      {/* --- CONTENT --- */}
      <div className="relative z-10 flex flex-col h-screen">
           {children}
      </div>
    </div>
  );
};

export default CRMLayout;