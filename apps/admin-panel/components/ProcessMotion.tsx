import React from 'react';

export const ProcessMotionStyles: React.FC = () => (
  <style>{`
    @keyframes entray-process-sheen {
      0% { transform: translateX(-130%); opacity: 0; }
      20% { opacity: .28; }
      100% { transform: translateX(130%); opacity: 0; }
    }

    @keyframes entray-process-breathe {
      0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(59,130,246,.18); }
      50% { transform: scale(1.015); box-shadow: 0 0 0 8px rgba(59,130,246,0); }
    }

    @keyframes entray-process-dot {
      0%, 80%, 100% { opacity: .35; transform: translateY(0); }
      40% { opacity: 1; transform: translateY(-1px); }
    }

    @keyframes entray-process-ring {
      0% { transform: scale(.8); opacity: .5; }
      100% { transform: scale(1.9); opacity: 0; }
    }

    @keyframes entray-step-enter {
      0% { opacity: 0; transform: translateY(6px) scale(.985); }
      100% { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes entray-countdown-alert {
      0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239,68,68,.18); }
      50% { transform: scale(1.04); box-shadow: 0 0 0 8px rgba(239,68,68,0); }
    }

    @keyframes entray-success-pop {
      0% { opacity: 0; transform: scale(.92) translateY(6px); }
      55% { opacity: 1; transform: scale(1.03) translateY(0); }
      100% { opacity: 1; transform: scale(1) translateY(0); }
    }

    @keyframes entray-success-sheen {
      0% { transform: translateX(-120%); opacity: 0; }
      25% { opacity: .25; }
      100% { transform: translateX(120%); opacity: 0; }
    }

    @keyframes entray-check-draw {
      0% { transform: scale(.65) rotate(-8deg); opacity: 0; }
      55% { transform: scale(1.08) rotate(0deg); opacity: 1; }
      100% { transform: scale(1) rotate(0deg); opacity: 1; }
    }

    @keyframes entray-progress-line {
      0% { transform: scaleX(.35); opacity: .35; }
      50% { transform: scaleX(1); opacity: .95; }
      100% { transform: scaleX(.35); opacity: .35; }
    }

    .entray-process-live {
      animation: entray-process-breathe 2.4s ease-in-out infinite;
      position: relative;
      overflow: hidden;
    }

    .entray-process-live::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(110deg, transparent 0%, rgba(255,255,255,.14) 35%, rgba(255,255,255,.34) 50%, transparent 70%);
      animation: entray-process-sheen 2.6s linear infinite;
      pointer-events: none;
    }

    .entray-progress-track {
      position: relative;
      overflow: hidden;
      isolation: isolate;
    }

    .entray-progress-track::after {
      content: "";
      position: absolute;
      inset: 0;
      width: 42%;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,.45), transparent);
      animation: entray-process-sheen 2.2s linear infinite;
      pointer-events: none;
    }

    .entray-working-dot {
      animation: entray-process-dot 1s ease-in-out infinite;
    }

    .entray-working-dot:nth-child(2) {
      animation-delay: .15s;
    }

    .entray-working-dot:nth-child(3) {
      animation-delay: .3s;
    }

    .entray-step-current {
      position: relative;
      overflow: visible;
    }

    .entray-step-current::after {
      content: "";
      position: absolute;
      inset: -2px;
      border-radius: 9999px;
      border: 2px solid currentColor;
      animation: entray-process-ring 1.6s ease-out infinite;
      pointer-events: none;
    }

    .entray-step-enter {
      animation: entray-step-enter .38s cubic-bezier(.22,1,.36,1);
    }

    .entray-countdown-urgent {
      animation: entray-countdown-alert 1.4s ease-in-out infinite;
    }

    .entray-success-card {
      position: relative;
      overflow: hidden;
      animation: entray-success-pop .42s cubic-bezier(.22,1,.36,1);
    }

    .entray-success-card::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(110deg, transparent 0%, rgba(255,255,255,.18) 42%, rgba(255,255,255,.38) 52%, transparent 72%);
      animation: entray-success-sheen 2.8s linear infinite;
      pointer-events: none;
    }

    .entray-success-check {
      animation: entray-check-draw .42s cubic-bezier(.22,1,.36,1);
      transform-origin: center;
    }

    .entray-progress-line {
      position: relative;
      overflow: hidden;
    }

    .entray-progress-line::before {
      content: "";
      position: absolute;
      left: 0;
      top: 50%;
      width: 100%;
      height: 2px;
      transform: translateY(-50%);
      transform-origin: left center;
      background: linear-gradient(90deg, currentColor, rgba(255,255,255,.2), currentColor);
      opacity: .4;
      animation: entray-progress-line 2.2s ease-in-out infinite;
      pointer-events: none;
    }

    .entray-action-idle {
      transition: transform .22s ease, box-shadow .22s ease, background-color .22s ease;
    }

    .entray-action-idle:hover {
      transform: translateY(-1px);
      box-shadow: 0 12px 26px rgba(15,23,42,.10);
    }
  `}</style>
);

export const WorkingDots: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={`inline-flex items-center gap-1 ${className}`}>
    <span className="entray-working-dot h-1.5 w-1.5 rounded-full bg-current" />
    <span className="entray-working-dot h-1.5 w-1.5 rounded-full bg-current" />
    <span className="entray-working-dot h-1.5 w-1.5 rounded-full bg-current" />
  </span>
);
