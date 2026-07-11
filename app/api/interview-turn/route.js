// app/api/interview-turn/route.js
// Server-side API route: receives a candidate's answer, calls Groq, returns scored JSON.
// Keeps the GROQ_API_KEY secret (never exposed to the browser).

import { NextResponse } from 'next/server';
import { askGroq, parseGroqJSON } from '@/lib/groq';

// A hard, deterministic floor for low-effort answers — this runs regardless
// of what the AI decides, so "ss", "hi", "idk" etc. can never slip through
// with an inflated score.
function isLowEffortAnswer(answer) {
  if (!answer) return true;
  const trimmed = answer.trim();
  if (trimmed.length < 8) return true;               // e.g. "ss", "hh", "hi there"

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 3) return true;                  // fewer than 3 words

  // Reject if there's no word with a vowel in it long enough to be real
  // language (catches keyboard-mash like "asdkj kjasd")
  const hasRealWord = words.some(w => /[aeiou]/i.test(w) && w.length >= 3);
  if (!hasRealWord) return true;

  return false;
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { messageHistory, jobTitle, numQ, questionIndex, candidateAnswer } = body;

    if (!jobTitle) {
      return NextResponse.json({ error: 'jobTitle is required' }, { status: 400 });
    }

    // Build message array to send to Groq.
    // On the very first call, there's no candidateAnswer yet — we just ask for Q1.
    const messages = messageHistory || [];

    if (candidateAnswer !== null && candidateAnswer !== undefined) {
      messages.push({ role: 'user', content: candidateAnswer });
    }

    // Add a system instruction about which question this is
    // so Groq knows when to fire the final summary.
    const augmentedMessages = [
      ...messages,
      {
        role: 'user',
        content: candidateAnswer === null || candidateAnswer === undefined
          ? `Please ask question 1 of ${numQ} for the ${jobTitle} role.`
          : questionIndex >= numQ
            ? `That was the final answer (question ${numQ} of ${numQ}). Please provide the final summary JSON now.`
            : `That was question ${questionIndex} of ${numQ}. Please score it and ask question ${questionIndex + 1}.`,
      },
    ];

    // Ask Groq (server-side; API key stays secret)
    const rawText = await askGroq(jobTitle, augmentedMessages);

    // Parse the JSON response from Groq
    const parsed  = parseGroqJSON(rawText);

    // Safety net: if the model ever drifts from the exact key names we
    // asked for, map common alternates instead of silently breaking the UI.
    const normalized = {
      ...parsed,
      next_question: parsed.next_question ?? parsed.question ?? null,
      final_summary: parsed.final_summary ?? parsed.summary ?? null,
    };

    // Hard floor: force a 0 score for low-effort/gibberish answers, no
    // matter what the AI decided. This only applies when we're actually
    // scoring an answer (i.e. not the very first "ask question 1" call).
    if (
      candidateAnswer !== null &&
      candidateAnswer !== undefined &&
      isLowEffortAnswer(candidateAnswer)
    ) {
      normalized.score = 0;
      normalized.feedback = 'No substantive answer was given — this response does not address the question.';
    }

    return NextResponse.json(normalized);

  } catch (err) {
    console.error('[interview-turn] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}