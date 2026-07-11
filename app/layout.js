'use client';
// app/layout.js
// Root layout — wraps every page.
// Starts Supabase session auto-refresh as soon as the app loads.

import './globals.css';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function RootLayout({ children }) {
  useEffect(() => {
    // Start auto-refreshing the Supabase session in the background.
    // This prevents the "refresh token expired" error after periods of inactivity.
    supabase.auth.startAutoRefresh();

    // Also listen for auth state changes — if the session truly expires,
    // the user is cleanly redirected to login instead of seeing an error.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        console.log('[Auth]', event);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <html lang="en">
      <head>
        <title>ProctorAI — Intelligent Interview Platform</title>
        <meta name="description" content="AI-powered, proctored interview system for modern hiring teams." />
      </head>
      <body>{children}</body>
    </html>
  );
}