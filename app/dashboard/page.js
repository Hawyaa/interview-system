'use client';
// app/dashboard/page.js
// HR Dashboard: create interview sessions, view completed results, copy share links.

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

// ── Helper: generate a random URL-safe token ──────────────────────────────────
function generateToken(length = 24) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ── Recommendation badge colours ─────────────────────────────────────────────
function RecBadge({ rec }) {
  const map = {
    hire:   'badge-green',
    review: 'badge-yellow',
    reject: 'badge-red',
  };
  return <span className={map[rec] || 'badge-gray'}>{rec || 'pending'}</span>;
}

export default function DashboardPage() {
  const router = useRouter();

  // Auth state
  const [user,        setUser]        = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Form state for new interview
  const [jobTitle,   setJobTitle]   = useState('');
  const [candName,   setCandName]   = useState('');
  const [numQ,       setNumQ]       = useState(5);
  const [creating,   setCreating]   = useState(false);
  const [newLink,    setNewLink]    = useState('');

  // Interview list
  const [interviews, setInterviews] = useState([]);
  const [listLoading,setListLoading]= useState(true);

  // ── Check auth on mount ───────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return; }
      setUser(session.user);
      setAuthLoading(false);
    });
  }, [router]);

  // ── Load interviews once user is known ────────────────────────────────────
  const loadInterviews = useCallback(async () => {
    if (!user) return;
    setListLoading(true);

    // Fetch interviews created by this HR user, newest first
    const { data, error } = await supabase
      .from('interviews')
      .select(`
        id, candidate_name, job_title, status, created_at, share_token,
        interview_results ( overall_score, recommendation )
      `)
      .eq('hr_user_id', user.id)
      .order('created_at', { ascending: false });

    if (!error) setInterviews(data || []);
    setListLoading(false);
  }, [user]);

  useEffect(() => { loadInterviews(); }, [loadInterviews]);

  // ── Create a new interview session ───────────────────────────────────────
  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    setNewLink('');

    const token = generateToken();

    const { data, error } = await supabase.from('interviews').insert({
      hr_user_id:      user.id,
      candidate_name:  candName.trim(),
      job_title:       jobTitle.trim(),
      num_questions:   parseInt(numQ, 10),
      status:          'pending',
      share_token:     token,
    }).select().single();

    setCreating(false);

    if (error) { alert('Failed to create interview: ' + error.message); return; }

    const link = `${window.location.origin}/interview/${token}`;
    setNewLink(link);
    setJobTitle('');
    setCandName('');
    setNumQ(5);
    loadInterviews();
  }

  // ── Sign out ──────────────────────────────────────────────────────────────
  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  // ── Copy link to clipboard ────────────────────────────────────────────────
  function copyLink(token) {
    const link = `${window.location.origin}/interview/${token}`;
    navigator.clipboard.writeText(link).then(() => alert('Link copied to clipboard!'));
  }

  if (authLoading) return <LoadingScreen />;

  return (
    <div className="min-h-screen bg-surface-50">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🎯</span>
          <span className="font-bold text-gray-900 text-lg">ProctorAI</span>
          <span className="text-gray-300 mx-2">|</span>
          <span className="text-sm text-gray-500">HR Dashboard</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 hidden sm:block">{user?.email}</span>
          <button onClick={handleSignOut} className="btn-ghost text-sm py-1.5 px-3">
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">

        {/* ── Create Interview ───────────────────────────────────────────── */}
        <section className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">New Interview Session</h2>
          <p className="text-sm text-gray-500 mb-5">
            Fill in the details below — we'll generate a private link for your candidate.
          </p>

          <form onSubmit={handleCreate} className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Candidate Name</label>
              <input
                className="input"
                placeholder="Jane Doe"
                value={candName}
                onChange={e => setCandName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Job Title</label>
              <input
                className="input"
                placeholder="Senior Backend Engineer"
                value={jobTitle}
                onChange={e => setJobTitle(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Number of Questions</label>
              <select
                className="input"
                value={numQ}
                onChange={e => setNumQ(e.target.value)}
              >
                {[3,4,5,6,7,8,10].map(n => (
                  <option key={n} value={n}>{n} questions</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-3 flex items-center gap-4">
              <button type="submit" disabled={creating} className="btn-primary">
                {creating ? 'Creating…' : '+ Create interview'}
              </button>
              {newLink && (
                <div className="flex-1 flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                  <span className="text-xs text-green-700 font-medium flex-1 truncate">{newLink}</span>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(newLink).then(() => alert('Copied!'))}
                    className="text-xs text-green-700 font-semibold hover:underline shrink-0"
                  >
                    Copy
                  </button>
                </div>
              )}
            </div>
          </form>
        </section>

        {/* ── Interview List ─────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">All Interviews</h2>
            <button onClick={loadInterviews} className="btn-ghost text-xs py-1.5 px-3">
              ↻ Refresh
            </button>
          </div>

          {listLoading ? (
            <div className="card text-center text-gray-400 py-10">Loading…</div>
          ) : interviews.length === 0 ? (
            <div className="card text-center text-gray-400 py-10">
              No interviews yet. Create one above.
            </div>
          ) : (
            <div className="space-y-3">
              {interviews.map(iv => {
                const result = iv.interview_results?.[0];
                return (
                  <div key={iv.id} className="card flex flex-col sm:flex-row sm:items-center gap-4">
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{iv.candidate_name}</p>
                      <p className="text-sm text-gray-500">{iv.job_title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(iv.created_at).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                      </p>
                    </div>

                    {/* Status & score */}
                    <div className="flex items-center gap-3">
                      <span className={iv.status === 'completed' ? 'badge-green' : 'badge-blue'}>
                        {iv.status}
                      </span>
                      {result && (
                        <>
                          <span className="text-sm font-semibold text-gray-700">
                            {result.overall_score?.toFixed(1)}/10
                          </span>
                          <RecBadge rec={result.recommendation} />
                        </>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => copyLink(iv.share_token)}
                        className="btn-ghost text-xs py-1.5 px-3"
                      >
                        Copy link
                      </button>
                      {iv.status === 'completed' && (
                        <button
                          onClick={() => router.push(`/report/${iv.id}`)}
                          className="btn-primary text-xs py-1.5 px-3"
                        >
                          View report →
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50">
      <div className="text-gray-400 text-sm animate-pulse">Loading dashboard…</div>
    </div>
  );
}
