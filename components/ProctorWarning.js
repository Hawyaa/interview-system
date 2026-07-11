'use client';
// components/ProctorWarning.js
// Shows a dismissable warning banner when a proctoring flag is raised
// (tab switch, no face, multiple faces).

import { useState, useEffect } from 'react';

export default function ProctorWarning({ latestFlag }) {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');

  // Whenever a new flag arrives, show the banner for 6 seconds
  useEffect(() => {
    if (!latestFlag) return;

    const LABELS = {
      TAB_SWITCH:      '⚠️ Tab switch detected — leaving this tab is flagged.',
      NO_FACE:         '⚠️ No face detected in your webcam — please stay visible.',
      MULTIPLE_FACES:  '⚠️ Multiple faces detected — only the candidate should be visible.',
    };

    setMessage(LABELS[latestFlag.type] || `⚠️ Proctoring flag: ${latestFlag.message}`);
    setVisible(true);

    const timer = setTimeout(() => setVisible(false), 6000);
    return () => clearTimeout(timer);
  }, [latestFlag]);

  if (!visible) return null;

  return (
    <div
      role="alert"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50
                 flex items-center gap-3
                 bg-red-700 text-white text-sm font-medium
                 px-5 py-3 rounded-xl shadow-2xl
                 animate-bounce"
      style={{ animationIterationCount: 2, animationDuration: '0.4s' }}
    >
      <span className="flex-1">{message}</span>
      <button
        onClick={() => setVisible(false)}
        className="text-white/70 hover:text-white ml-2 font-bold text-lg leading-none"
        aria-label="Dismiss warning"
      >
        ×
      </button>
    </div>
  );
}
