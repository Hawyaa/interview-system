'use client';
// app/report/[id]/page.js
// HR-facing report page showing full interview results, scores, and proctoring flags.
// Accessible only to logged-in HR users.

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

// ── Recommendation colours and labels ────────────────────────────────────────
const REC = {
  hire:   { label: '✅ Hire',   cls: 'bg-green-100 text-green-800 border-green-200' },
  review: { label: '⚠️ Review', cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  reject: { label: '❌ Reject', cls: 'bg-red-100 text-red-800 border-red-200' },
};

// ── Score bar ─────────────────────────────────────────────────────────────────
function ScoreBar({ score, max = 10 }) {
  const pct = (score / max) * 100;
  const color =
    score >= 7 ? 'bg-green-500' :
    score >= 5 ? 'bg-yellow-500' :
                 'bg-red-500';
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-2 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-semibold text-gray-700 w-12 text-right">
        {score}/10
      </span>
    </div>
  );
}

// ── Flag icon per type ────────────────────────────────────────────────────────
function flagIcon(type) {
  return {
    TAB_SWITCH:           '🔀',
    NO_FACE:              '👤',
    MULTIPLE_FACES:       '👥',
    SCREEN_SHARE_STOPPED: '🖥',
    WRONG_SCREEN_SHARE:   '⚠️',
  }[type] || '🚩';
}

export default function ReportPage() {
  const { id }    = useParams();
  const router    = useRouter();

  const [loading,   setLoading]   = useState(true);
  const [interview, setInterview] = useState(null);
  const [result,    setResult]    = useState(null);
  const [answers,   setAnswers]   = useState([]);
  const [flags,     setFlags]     = useState([]);
  const [error,     setError]     = useState('');

  // ── Auth guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return; }
      loadReport(session.user.id);
    });
  }, [id, router]);

  // ── Load report ───────────────────────────────────────────────────────────
  async function loadReport(userId) {
    // Fetch interview + result in one query
    const { data: iv, error: ivErr } = await supabase
      .from('interviews')
      .select('*, interview_results(*)')
      .eq('id', id)
      .eq('hr_user_id', userId)  // Prevent viewing other HR's reports
      .order('completed_at', { referencedTable: 'interview_results', ascending: false })
      .single();

    if (ivErr || !iv) {
      setError("Report not found or you don't have access.");
      setLoading(false);
      return;
    }

    const res = iv.interview_results?.[0];
    if (!res) {
      setError('This interview has not been completed yet.');
      setLoading(false);
      return;
    }

    setInterview(iv);
    setResult(res);

    try { setAnswers(JSON.parse(res.answers_json || '[]')); } catch { setAnswers([]); }
    try { setFlags(JSON.parse(res.flags_json    || '[]')); } catch { setFlags([]);   }

    setLoading(false);
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50">
      <p className="text-gray-400 animate-pulse">Loading report…</p>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50">
      <div className="text-center">
        <p className="text-red-600 font-medium">{error}</p>
        <button onClick={() => router.push('/dashboard')} className="btn-ghost mt-4">
          ← Back to dashboard
        </button>
      </div>
    </div>
  );

  const rec = REC[result.recommendation] || REC.review;
  const completedDate = new Date(result.completed_at).toLocaleString('en-US', {
    dateStyle: 'long', timeStyle: 'short',
  });

  return (
    <div className="min-h-screen bg-surface-50">
      {/* Print-friendly nav */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4 print:hidden">
        <button onClick={() => router.push('/dashboard')} className="btn-ghost text-sm py-1.5 px-3">
          ← Dashboard
        </button>
        <span className="text-gray-300">|</span>
        <span className="font-semibold text-gray-800">Interview Report</span>
        <div className="ml-auto">
          <button onClick={() => window.print()} className="btn-ghost text-sm py-1.5 px-3">
            🖨 Print / Save PDF
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-8 print:py-4">

        {/* ── Header card ─────────────────────────────────────────────────── */}
        <div className="card">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">🎯</span>
                <span className="font-bold text-gray-900">ProctorAI Report</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mt-2">{interview.candidate_name}</h1>
              <p className="text-gray-500 text-sm">{interview.job_title}</p>
              <p className="text-gray-400 text-xs mt-1">Completed {completedDate}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              {/* Overall score ring */}
              <div className="w-20 h-20 rounded-full border-4 border-brand-500 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-brand-600 leading-none">
                  {result.overall_score?.toFixed(1)}
                </span>
                <span className="text-xs text-gray-400">/ 10</span>
              </div>
              {/* Recommendation */}
              <span className={`badge border text-sm px-3 py-1 ${rec.cls}`}>
                {rec.label}
              </span>
            </div>
          </div>
        </div>

        {/* ── Webcam recording ────────────────────────────────────────────── */}
        {result.video_url && (
          <div className="card">
            <h2 className="text-base font-semibold text-gray-900 mb-3">Interview Recording</h2>
            <video
              src={result.video_url}
              controls
              playsInline
              className="w-full rounded-xl bg-black max-h-[480px]"
            />
          </div>
        )}

        {/* ── AI Summary ──────────────────────────────────────────────────── */}
        <div className="card">
          <h2 className="text-base font-semibold text-gray-900 mb-3">AI Evaluation Summary</h2>
          <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">
            {result.final_report}
          </p>
        </div>

        {/* ── Per-question scores ──────────────────────────────────────────── */}
        <div className="card">
          <h2 className="text-base font-semibold text-gray-900 mb-5">Question-by-Question Breakdown</h2>
          <div className="space-y-6">
            {answers.map((a, i) => (
              <div key={i} className="border-b border-gray-100 last:border-0 pb-5 last:pb-0">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <p className="text-sm font-medium text-gray-800">
                    <span className="text-gray-400 mr-2">Q{i+1}.</span>{a.question}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg px-4 py-3 mb-2">
                  <p className="text-sm text-gray-700">{a.answer}</p>
                </div>
                <ScoreBar score={a.score} />
                <p className="text-xs text-gray-500 mt-1.5 italic">{a.feedback}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Proctoring flags ─────────────────────────────────────────────── */}
        <div className="card">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Proctoring Log</h2>
          <p className="text-xs text-gray-400 mb-4">
            {flags.length === 0
              ? 'No proctoring violations detected during this interview.'
              : `${flags.length} flag${flags.length > 1 ? 's' : ''} recorded during the interview.`}
          </p>

          {flags.length === 0 ? (
            <div className="text-center py-6 text-sm text-green-600 bg-green-50 rounded-xl">
              ✅ Clean session — no flags raised
            </div>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-2">Time</th>
                    <th className="text-left px-4 py-2">Type</th>
                    <th className="text-left px-4 py-2">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {flags.map((f, i) => (
                    <tr key={i} className="bg-white">
                      <td className="px-4 py-2.5 text-gray-500 font-mono text-xs whitespace-nowrap">
                        {new Date(f.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-1.5 text-red-700 font-medium">
                          {flagIcon(f.type)}
                          {f.type.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{f.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Print footer */}
        <p className="text-center text-xs text-gray-300 pb-8 print:block hidden">
          Generated by ProctorAI · {new Date().toLocaleDateString()}
        </p>
      </main>
    </div>
  );
}