'use client';
// app/interview/[token]/page.js
// The candidate-facing interview page.
// Stages: setup → permissions → interview → complete

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import FaceMonitor   from '@/components/FaceMonitor';
import SpeechInput   from '@/components/SpeechInput';
import ProctorWarning from '@/components/ProctorWarning';

// ── Text-to-speech helper ────────────────────────────────────────────────────
function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel(); // Stop any in-progress speech
  const utt  = new SpeechSynthesisUtterance(text);
  utt.rate   = 0.95;
  utt.pitch  = 1;
  utt.volume = 1;
  window.speechSynthesis.speak(utt);
}

export default function InterviewPage() {
  const { token } = useParams();

  // ── Stage: setup | permissions | interview | submitting | complete | error
  const [stage,     setStage]     = useState('setup');
  const [interview, setInterview] = useState(null);  // Row from `interviews` table
  const [errorMsg,  setErrorMsg]  = useState('');

  // ── Permissions ───────────────────────────────────────────────────────────
  const [camOk,    setCamOk]    = useState(false);
  const [micOk,    setMicOk]    = useState(false);
  const [screenOk, setScreenOk] = useState(false);
  const [permError,setPermError]= useState('');

  // ── Webcam ────────────────────────────────────────────────────────────────
  const videoRef   = useRef(null);
  const streamRef  = useRef(null);  // Webcam MediaStream
  const screenRef  = useRef(null);  // Screen-share MediaStream

  // ── Webcam video recording ───────────────────────────────────────────────
  const mediaRecorderRef   = useRef(null);   // MediaRecorder instance
  const recordedChunksRef  = useRef([]);     // Recorded video blob chunks
  const [recording, setRecording] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);

  // ── Interview state ───────────────────────────────────────────────────────
  const [questionIndex, setQuestionIndex] = useState(0);  // Which question we're on
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [answers,   setAnswers]   = useState([]);  // Array of {question, answer, score, feedback}
  const [messages,  setMessages]  = useState([]);  // Groq conversation history
  const [aiLoading, setAiLoading] = useState(false);
  const [interimSpeech, setInterimSpeech] = useState('');

  // ── Proctoring flags ──────────────────────────────────────────────────────
  const [flags,      setFlags]      = useState([]);   // All logged flags
  const [latestFlag, setLatestFlag] = useState(null); // Triggers warning banner

  // ── Add a proctoring flag ─────────────────────────────────────────────────
  const addFlag = useCallback((flag) => {
    const f = { ...flag, timestamp: flag.timestamp || new Date().toISOString() };
    setFlags(prev => [...prev, f]);
    setLatestFlag(f);
    console.warn('[PROCTOR FLAG]', f);
  }, []);

  // ── Tab visibility monitoring ─────────────────────────────────────────────
  useEffect(() => {
    if (stage !== 'interview') return;

    function onVisibilityChange() {
      if (document.hidden) {
        addFlag({ type: 'TAB_SWITCH', message: 'Candidate switched away from tab' });
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [stage, addFlag]);

  // ── Load interview metadata from Supabase ─────────────────────────────────
  useEffect(() => {
    async function fetchInterview() {
      const { data, error } = await supabase
        .from('interviews')
        .select('*')
        .eq('share_token', token)
        .single();

      if (error || !data) {
        setErrorMsg('Interview not found. Please check your link.');
        setStage('error');
        return;
      }

      if (data.status === 'completed') {
        setStage('complete');
        return;
      }

      setInterview(data);
      setStage('permissions');
    }
    if (token) fetchInterview();
  }, [token]);

  // ── Request webcam + mic ──────────────────────────────────────────────────
  async function requestCamera() {
    setPermError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current       = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCamOk(true);
      setMicOk(true);
    } catch (err) {
      setPermError('Camera/microphone access was denied. Please allow access and refresh.');
    }
  }

  // ── Request screen share ──────────────────────────────────────────────────
  async function requestScreen() {
    setPermError('');
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'monitor' },
      });
      screenRef.current = stream;

      // Warn if the user shares a window rather than the full monitor
      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();
      if (settings.displaySurface && settings.displaySurface !== 'monitor') {
        addFlag({
          type:    'WRONG_SCREEN_SHARE',
          message: `Candidate shared '${settings.displaySurface}' instead of entire screen`,
        });
      }

      setScreenOk(true);

      // If they stop sharing mid-interview, flag it
      track.addEventListener('ended', () => {
        addFlag({ type: 'SCREEN_SHARE_STOPPED', message: 'Screen share was ended by candidate' });
        setScreenOk(false);
      });
    } catch (err) {
      setPermError('Screen share was denied. You must share your entire screen to continue.');
    }
  }

  // ── Start recording the candidate's webcam ────────────────────────────────
  // Records video+audio from the webcam stream (streamRef) for the whole
  // interview, so the HR report can show what actually happened on camera —
  // not just the transcribed answers.
  function startRecording() {
    const stream = streamRef.current;
    if (!stream) return;

    recordedChunksRef.current = [];

    // Pick a mimeType the browser actually supports
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    const mimeType = candidates.find(t => window.MediaRecorder?.isTypeSupported?.(t)) || '';

    try {
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      recorder.start(1000); // collect a chunk every second
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch (err) {
      console.error('Could not start webcam recording:', err);
      // Recording is best-effort — don't block the interview if it fails
    }
  }

  // ── Stop recording and return the finished video as a Blob ───────────────
  function stopRecording() {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        resolve(recordedChunksRef.current.length
          ? new Blob(recordedChunksRef.current, { type: 'video/webm' })
          : null);
        return;
      }

      recorder.onstop = () => {
        setRecording(false);
        const blob = recordedChunksRef.current.length
          ? new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'video/webm' })
          : null;
        resolve(blob);
      };

      recorder.stop();
    });
  }

  // ── Upload the recorded video to Supabase Storage ─────────────────────────
  // Bucket: "interview-recordings" (create it once in the Supabase dashboard,
  // or via the SQL in supabase-schema.sql). Returns the public URL, or null
  // if the upload fails — a failed video upload should never block the
  // candidate from submitting their report.
  async function uploadRecording(blob, interviewId) {
    if (!blob) return null;
    setUploadingVideo(true);
    try {
      const path = `${interviewId}/${Date.now()}.webm`;
      const { error: uploadErr } = await supabase.storage
        .from('interview-recordings')
        .upload(path, blob, { contentType: 'video/webm', upsert: true });

      if (uploadErr) {
        console.error('Video upload failed:', uploadErr);
        return null;
      }

      const { data } = supabase.storage.from('interview-recordings').getPublicUrl(path);
      return data?.publicUrl || null;
    } catch (err) {
      console.error('Video upload error:', err);
      return null;
    } finally {
      setUploadingVideo(false);
    }
  }

  // ── Start interview ───────────────────────────────────────────────────────
  async function startInterview() {
    setStage('interview');
    setAiLoading(true);
    startRecording(); // begin capturing webcam video for the whole session

    // Ask the AI for the first question
    const response = await callGroqAPI([], interview.job_title, interview.num_questions, 0, null);
    if (response) {
      setCurrentQuestion(response.next_question);
      setMessages([
        { role: 'assistant', content: JSON.stringify(response) }
      ]);
      speak(response.next_question);
    }
    setAiLoading(false);
  }

  // ── Send answer to Groq via our API route ─────────────────────────────────
  async function callGroqAPI(messageHistory, jobTitle, numQ, qIndex, candidateAnswer) {
    try {
      const res = await fetch('/api/interview-turn', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messageHistory, jobTitle, numQ, questionIndex: qIndex, candidateAnswer }),
      });

      if (!res.ok) throw new Error(await res.text());
      return await res.json();

    } catch (err) {
      console.error('Groq API error:', err);
      setErrorMsg('AI service error. Please try refreshing.');
      return null;
    }
  }

  // ── Handle candidate submitting an answer ─────────────────────────────────
  async function handleAnswer(answerText) {
    if (aiLoading) return;
    setAiLoading(true);

    const newMessages = [
      ...messages,
      { role: 'user', content: answerText },
    ];

    const nextIndex = questionIndex + 1;
    const isFinal   = nextIndex >= (interview?.num_questions || 5);

    const response = await callGroqAPI(
      newMessages,
      interview.job_title,
      interview.num_questions,
      nextIndex,
      answerText
    );

    if (!response) { setAiLoading(false); return; }

    // Record this answer + score
    const updatedAnswers = [
      ...answers,
      {
        question: currentQuestion,
        answer:   answerText,
        score:    response.score,
        feedback: response.feedback,
      },
    ];
    setAnswers(updatedAnswers);

    const updatedMessages = [
      ...newMessages,
      { role: 'assistant', content: JSON.stringify(response) },
    ];
    setMessages(updatedMessages);

    if (response.next_question === null || isFinal) {
      // ── Interview over — save report ──────────────────────────────────────
      await saveReport(updatedAnswers, response, flags);
    } else {
      // ── Next question ─────────────────────────────────────────────────────
      setQuestionIndex(nextIndex);
      setCurrentQuestion(response.next_question);
      speak(response.next_question);
    }

    setAiLoading(false);
  }

  // ── Save results to Supabase ──────────────────────────────────────────────
  async function saveReport(finalAnswers, lastResponse, allFlags) {
    setStage('submitting');

    const scores       = finalAnswers.map(a => a.score);
    const overallScore = scores.reduce((s, x) => s + x, 0) / (scores.length || 1);

    // Stop recording and upload the candidate's webcam video before we
    // stop the tracks (stopping the tracks also stops the recorder, but we
    // want the finished Blob first).
    const videoBlob = await stopRecording();
    const videoUrl  = await uploadRecording(videoBlob, interview.id);

    // Mark interview as completed
    const { error: updateErr } = await supabase
      .from('interviews')
      .update({ status: 'completed' })
      .eq('id', interview.id);

    if (updateErr) {
      console.error('Failed to mark interview completed:', updateErr);
    }

    // Insert the detailed result
    const { error: insertErr } = await supabase.from('interview_results').insert({
      interview_id:  interview.id,
      answers_json:  JSON.stringify(finalAnswers),
      scores_json:   JSON.stringify(scores),
      flags_json:    JSON.stringify(allFlags),
      final_report:  lastResponse.final_summary || 'No summary generated.',
      overall_score: parseFloat(overallScore.toFixed(2)),
      recommendation: lastResponse.recommendation || 'review',
      video_url:     videoUrl, // null if recording/upload failed — report just hides the player
    });

    if (insertErr) {
      console.error('Failed to save interview results:', insertErr);
      // Stop media before bailing out so the candidate isn't left recording forever
      streamRef.current?.getTracks().forEach(t => t.stop());
      screenRef.current?.getTracks().forEach(t => t.stop());
      window.speechSynthesis?.cancel();

      setErrorMsg(
        `We couldn't save your results (${insertErr.message}). Please contact the recruiter — do not close this tab yet.`
      );
      setStage('error');
      return;
    }

    // Stop all media streams
    streamRef.current?.getTracks().forEach(t => t.stop());
    screenRef.current?.getTracks().forEach(t => t.stop());
    window.speechSynthesis?.cancel();

    setStage('complete');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  if (stage === 'setup') return <LoadingScreen message="Loading interview…" />;
  if (stage === 'error') return <ErrorScreen message={errorMsg} />;
  if (stage === 'complete') return <CompleteScreen />;
  if (stage === 'submitting') {
    return (
      <LoadingScreen
        message={uploadingVideo ? 'Uploading your interview recording…' : 'Saving your results…'}
      />
    );
  }

  // ── Permissions stage ─────────────────────────────────────────────────────
  if (stage === 'permissions') {
    return (
      <PermissionsScreen
        interview={interview}
        camOk={camOk}
        micOk={micOk}
        screenOk={screenOk}
        videoRef={videoRef}
        permError={permError}
        onRequestCamera={requestCamera}
        onRequestScreen={requestScreen}
        onStart={startInterview}
      />
    );
  }

  // ── Interview stage ───────────────────────────────────────────────────────
  const total       = interview?.num_questions || 5;
  const progress    = Math.round(((questionIndex) / total) * 100);

  return (
    <div className="min-h-screen bg-surface-900 text-white flex flex-col">
      {/* Proctoring warning banner */}
      <ProctorWarning latestFlag={latestFlag} />

      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎯</span>
          <span className="font-bold text-lg">ProctorAI</span>
        </div>
        <div className="text-sm text-gray-400">
          {interview?.candidate_name} · {interview?.job_title}
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span>Question {questionIndex + 1} of {total}</span>
          <span className="text-xs bg-green-800 text-green-300 px-2 py-0.5 rounded-full">
            🔴 Live
          </span>
        </div>
      </header>

      {/* Progress bar */}
      <div className="w-full h-1 bg-gray-800">
        <div
          className="h-1 bg-brand-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: interview panel ──────────────────────────────────────── */}
        <div className="flex-1 flex flex-col p-6 md:p-10 overflow-y-auto">
          <div className="max-w-2xl mx-auto w-full flex-1 flex flex-col gap-6">

            {/* AI question card */}
            <div className="bg-surface-800 border border-gray-700 rounded-2xl p-6">
              <div className="flex items-start gap-3">
                <span className="text-2xl mt-0.5">🤖</span>
                <div className="flex-1">
                  <p className="text-xs text-gray-400 font-medium mb-2 uppercase tracking-wide">
                    Interviewer
                  </p>
                  {aiLoading && !currentQuestion ? (
                    <div className="flex items-center gap-2 text-gray-400">
                      <span className="animate-pulse">Preparing question…</span>
                    </div>
                  ) : (
                    <p className="text-white text-lg leading-relaxed">
                      {currentQuestion || 'Waiting for interviewer…'}
                    </p>
                  )}
                </div>
              </div>
              {/* Speak button */}
              {currentQuestion && !aiLoading && (
                <button
                  onClick={() => speak(currentQuestion)}
                  className="mt-4 text-xs text-gray-400 hover:text-white flex items-center gap-1.5"
                >
                  🔊 Hear question again
                </button>
              )}
            </div>

            {/* Previous answers (collapsible history) */}
            {answers.length > 0 && (
              <details className="bg-surface-800/50 border border-gray-700 rounded-xl">
                <summary className="px-5 py-3 cursor-pointer text-sm text-gray-400 hover:text-white select-none">
                  View previous answers ({answers.length})
                </summary>
                <div className="px-5 pb-4 space-y-4 max-h-60 overflow-y-auto">
                  {answers.map((a, i) => (
                    <div key={i} className="text-sm border-t border-gray-700 pt-3 first:border-0 first:pt-0">
                      <p className="text-gray-400">Q{i+1}: {a.question}</p>
                      <p className="text-white mt-1">{a.answer}</p>
                      <p className="text-brand-400 mt-1 text-xs">Score: {a.score}/10 — {a.feedback}</p>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* Answer input */}
            <div className="mt-auto">
              <p className="text-sm text-gray-400 mb-3 font-medium">Your answer</p>
              <SpeechInput
                onResult={handleAnswer}
                onInterim={setInterimSpeech}
                disabled={aiLoading || !currentQuestion}
              />
              {aiLoading && (
                <p className="text-xs text-brand-400 animate-pulse mt-2">
                  AI is processing your answer…
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: webcam sidebar ──────────────────────────────────────── */}
        <aside className="w-56 md:w-64 shrink-0 bg-surface-900 border-l border-gray-700 p-4 flex flex-col gap-4">
          {/* Webcam feed */}
          <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            <FaceMonitor videoRef={videoRef} onFlag={addFlag} enabled />
            {recording && (
              <span className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 text-red-400 text-[10px] font-semibold px-2 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                REC
              </span>
            )}
          </div>

          {/* Flags log */}
          <div className="flex-1 overflow-y-auto">
            <p className="text-xs text-gray-500 font-medium mb-2 uppercase tracking-wide">
              Proctoring log
            </p>
            {flags.length === 0 ? (
              <p className="text-xs text-gray-600 italic">No flags raised</p>
            ) : (
              <div className="space-y-1.5">
                {flags.map((f, i) => (
                  <div key={i} className="text-xs bg-red-900/30 border border-red-800/50 rounded-lg px-2 py-1.5">
                    <p className="text-red-300 font-medium">{f.type.replace(/_/g, ' ')}</p>
                    <p className="text-gray-500">{new Date(f.timestamp).toLocaleTimeString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// ── Sub-screens ───────────────────────────────────────────────────────────────

function PermissionsScreen({
  interview, camOk, micOk, screenOk, videoRef, permError,
  onRequestCamera, onRequestScreen, onStart
}) {
  const allOk = camOk && micOk && screenOk;

  return (
    <div className="min-h-screen bg-surface-900 flex items-center justify-center p-6">
      <div className="max-w-lg w-full space-y-6">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">🎯</span>
            <span className="text-white font-bold text-xl">ProctorAI</span>
          </div>
          <h1 className="text-2xl font-bold text-white mt-4">
            Hello, {interview?.candidate_name}!
          </h1>
          <p className="text-gray-400 mt-1 text-sm">
            You're interviewing for <strong className="text-white">{interview?.job_title}</strong>.
            Before we begin, we need to set up your environment.
          </p>
        </div>

        {/* Camera preview */}
        <div className="rounded-xl overflow-hidden bg-black aspect-video border border-gray-700 relative">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
          />
          {!camOk && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-sm">
              Camera preview will appear here
            </div>
          )}
        </div>

        {/* Permission steps */}
        <div className="bg-surface-800 border border-gray-700 rounded-2xl p-5 space-y-4">
          <p className="text-sm text-gray-400 font-medium uppercase tracking-wide">Required steps</p>

          {/* Camera + mic */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-white text-sm font-medium">📷 Camera &amp; 🎙 Microphone</p>
              <p className="text-gray-500 text-xs">Required for the interview and proctoring</p>
            </div>
            {camOk ? (
              <span className="badge-green">✓ Granted</span>
            ) : (
              <button onClick={onRequestCamera} className="btn-primary text-xs py-1.5 px-3">
                Allow access
              </button>
            )}
          </div>

          {/* Screen share */}
          <div className="flex items-center justify-between gap-4 border-t border-gray-700 pt-4">
            <div>
              <p className="text-white text-sm font-medium">🖥 Screen sharing</p>
              <p className="text-gray-500 text-xs">Share your entire screen (required for proctoring)</p>
            </div>
            {screenOk ? (
              <span className="badge-green">✓ Sharing</span>
            ) : (
              <button
                onClick={onRequestScreen}
                disabled={!camOk}
                className="btn-ghost text-xs py-1.5 px-3 disabled:opacity-40"
              >
                Share screen
              </button>
            )}
          </div>
        </div>

        {/* Error */}
        {permError && (
          <div className="bg-red-900/40 border border-red-700 rounded-xl px-4 py-3 text-red-300 text-sm">
            {permError}
          </div>
        )}

        {/* Important rules */}
        <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-xl px-4 py-3 text-yellow-200 text-xs space-y-1">
          <p className="font-semibold">⚠️ Important proctoring rules:</p>
          <ul className="list-disc list-inside space-y-0.5 text-yellow-300/80">
            <li>Keep your face visible in the camera at all times</li>
            <li>Do not switch browser tabs or windows</li>
            <li>No other person may appear on camera</li>
            <li>Keep your screen shared for the entire interview</li>
          </ul>
        </div>

        {/* Start button */}
        <button
          onClick={onStart}
          disabled={!allOk}
          className="w-full py-3 rounded-xl bg-brand-500 text-white font-bold text-base
                     hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed
                     transition-colors duration-150 shadow-lg"
        >
          {allOk ? 'Begin interview →' : 'Complete all steps above to continue'}
        </button>
      </div>
    </div>
  );
}

function CompleteScreen() {
  return (
    <div className="min-h-screen bg-surface-900 flex items-center justify-center p-6">
      <div className="text-center space-y-4 max-w-md">
        <div className="text-6xl">✅</div>
        <h1 className="text-3xl font-bold text-white">Interview Complete</h1>
        <p className="text-gray-400">
          Thank you for completing the interview. Your responses have been recorded and will be
          reviewed by the hiring team. You may now close this window.
        </p>
        <div className="text-sm text-gray-600 mt-4">
          Good luck! 🍀
        </div>
      </div>
    </div>
  );
}

function LoadingScreen({ message }) {
  return (
    <div className="min-h-screen bg-surface-900 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-400 text-sm">{message}</p>
      </div>
    </div>
  );
}

function ErrorScreen({ message }) {
  return (
    <div className="min-h-screen bg-surface-900 flex items-center justify-center p-6">
      <div className="text-center space-y-4 max-w-md">
        <div className="text-5xl">❌</div>
        <h1 className="text-2xl font-bold text-white">Something went wrong</h1>
        <p className="text-gray-400">{message}</p>
      </div>
    </div>
  );
}