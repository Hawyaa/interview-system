'use client';
// app/login/page.js
// HR manager login page — email + password via Supabase Auth.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [mode,     setMode]     = useState('login'); // 'login' | 'signup'

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let result;

      if (mode === 'signup') {
        // Create a new HR account
        result = await supabase.auth.signUp({ email, password });
        if (result.error) throw result.error;
        setError(''); 
        alert('Account created! Check your email to confirm, then log in.');
        setMode('login');
      } else {
        // Sign in with existing account
        result = await supabase.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
        router.push('/dashboard');
      }
    } catch (err) {
      setError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface-900 flex items-center justify-center p-4">
      {/* Background grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative w-full max-w-sm">
        {/* Logo / wordmark */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="text-2xl">🎯</span>
            <span className="text-white text-2xl font-bold tracking-tight">ProctorAI</span>
          </div>
          <p className="text-gray-400 text-sm">Intelligent Interview Platform</p>
        </div>

        {/* Card */}
        <div className="bg-surface-800 border border-gray-700 rounded-2xl p-8 shadow-2xl">
          <h1 className="text-white text-xl font-semibold mb-1">
            {mode === 'login' ? 'HR Portal Sign-in' : 'Create HR Account'}
          </h1>
          <p className="text-gray-400 text-sm mb-6">
            {mode === 'login'
              ? 'Sign in to manage interviews and view reports.'
              : 'Set up your HR manager account.'}
          </p>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-900/40 border border-red-700 text-red-300 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Email address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-600 bg-surface-900
                           text-white placeholder-gray-500 text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-600 bg-surface-900
                           text-white placeholder-gray-500 text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-brand-500 text-white font-semibold text-sm
                         hover:bg-brand-600 active:bg-brand-700 disabled:opacity-40
                         transition-colors duration-150 mt-2"
            >
              {loading
                ? (mode === 'login' ? 'Signing in…' : 'Creating account…')
                : (mode === 'login' ? 'Sign in' : 'Create account')}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-5">
            {mode === 'login' ? (
              <>
                No account?{' '}
                <button
                  onClick={() => setMode('signup')}
                  className="text-brand-400 hover:text-brand-300 font-medium"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  onClick={() => setMode('login')}
                  className="text-brand-400 hover:text-brand-300 font-medium"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>

        <p className="text-center text-xs text-gray-600 mt-6">
          Candidate? Open the link your HR team sent you.
        </p>
      </div>
    </div>
  );
}
