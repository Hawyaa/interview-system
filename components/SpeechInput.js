'use client';
// components/SpeechInput.js
// Handles speech-to-text (via Web Speech API) AND text fallback input.
// Props:
//   onResult(transcript)  — called when a final transcript is ready
//   onInterim(transcript) — called with live partial transcripts while speaking
//   disabled              — when true, disables recording

import { useEffect, useRef, useState } from 'react';

export default function SpeechInput({ onResult, onInterim, disabled = false }) {
  const recognitionRef = useRef(null);
  const [isListening, setIsListening] = useState(false);
  const [textInput,   setTextInput]   = useState('');
  const [supported,   setSupported]   = useState(true);
  const [interimText, setInterimText] = useState('');

  // ── Initialise Web Speech API ─────────────────────────────────────────────
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous      = true;   // Keep listening until stopped
    recognition.interimResults  = true;   // Fire events as the user speaks
    recognition.lang            = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript   = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      if (interimTranscript) {
        setInterimText(interimTranscript);
        onInterim?.(interimTranscript);
      }

      if (finalTranscript.trim()) {
        setInterimText('');
        setTextInput(prev => prev + finalTranscript);
        onInterim?.('');
      }
    };

    recognition.onerror = (event) => {
      console.warn('Speech recognition error:', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimText('');
    };

    recognitionRef.current = recognition;

    return () => recognition.abort();
  }, [onInterim]);

  // ── Start / Stop recording ───────────────────────────────────────────────
  function toggleListening() {
    if (!recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch {
        // Already started — ignore
      }
    }
  }

  // ── Submit the answer ─────────────────────────────────────────────────────
  function handleSubmit() {
    const answer = textInput.trim();
    if (!answer) return;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }

    onResult(answer);
    setTextInput('');
    setInterimText('');
  }

  return (
    <div className="space-y-3">
      {/* Text area — editable, shows dictated + manually typed text */}
      <div className="relative">
        <textarea
          rows={4}
          value={textInput + (interimText ? ' ' + interimText : '')}
          onChange={e => setTextInput(e.target.value)}
          disabled={disabled}
          placeholder="Click the microphone to speak, or type your answer here…"
          className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900
                     text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500
                     disabled:opacity-50 disabled:cursor-not-allowed"
        />
        {/* Live "recording" indicator */}
        {isListening && (
          <span className="absolute top-3 right-3 flex items-center gap-1 text-xs text-red-600 font-medium">
            <span className="relative w-2 h-2 ring-pulse">
              <span className="absolute inset-0 rounded-full bg-red-500" />
            </span>
            Listening
          </span>
        )}
      </div>

      {/* Interim transcript shown as ghost text below */}
      {interimText && (
        <p className="text-xs text-gray-400 italic px-1">{interimText}</p>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3">
        {supported ? (
          <button
            type="button"
            onClick={toggleListening}
            disabled={disabled}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                        disabled:opacity-40 disabled:cursor-not-allowed
                        ${isListening
                          ? 'bg-red-100 text-red-700 hover:bg-red-200'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            {isListening ? '⏹ Stop recording' : '🎙 Start recording'}
          </button>
        ) : (
          <p className="text-xs text-yellow-600 bg-yellow-50 px-3 py-2 rounded-lg">
            Speech recognition not supported — please type your answer.
          </p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled || !textInput.trim()}
          className="btn-primary"
        >
          Submit answer →
        </button>
      </div>
    </div>
  );
}
