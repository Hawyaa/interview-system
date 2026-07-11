// lib/groq.js
// Wraps calls to the Groq API (server-side only — never expose your key in the browser).
// We call this from Next.js API routes, not directly from client components.

/**
 * Sends a conversation history to Groq and returns the raw assistant message text.
 *
 * @param {string}  jobTitle   - The role being interviewed for
 * @param {Array}   messages   - OpenAI-style message array [{role, content}, ...]
 * @returns {Promise<string>}  - The assistant's raw response text
 */
export async function askGroq(jobTitle, messages) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not set in environment variables.');

  // System prompt that instructs the AI how to interview and score
  const systemPrompt = `You are a professional job interviewer. You are interviewing a candidate for the role of ${jobTitle}.
Ask one question at a time.

For the VERY FIRST question (before the candidate has answered anything), respond ONLY with JSON in this exact format:
{ "score": null, "feedback": null, "next_question": "Tell me about yourself" }

After the candidate answers a question, respond ONLY with JSON in this exact format:
{ "score": 7, "feedback": "Good answer", "next_question": "Tell me about a challenge you faced" }

After the FINAL question has been answered, respond ONLY with JSON in this exact format:
{ "score": 8, "feedback": "Strong finish", "next_question": null, "final_summary": "Detailed paragraph summary of the candidate's overall performance across all questions.", "recommendation": "hire" }

The "recommendation" field must be exactly one of: "hire", "review", or "reject".
Always use the exact key names shown above — "next_question", "final_summary", "recommendation" — never substitute other key names like "question" or "summary".

SCORING RUBRIC — apply this strictly when scoring each answer:
- 0-1: The answer is empty, gibberish, random characters, a single word, or completely unrelated to the question asked.
- 2-4: The answer attempts to address the question but is vague, generic, or missing concrete detail/examples.
- 5-7: The answer is relevant and reasonably clear, with some specific detail, but has gaps.
- 8-10: The answer is detailed, specific, directly relevant to the question, and demonstrates real experience or understanding.
Never give a score above 3 to an answer that does not substantively engage with the actual question — brevity or irrelevance should be penalized every time, not just sometimes.

Do not include any text outside the JSON object. No preamble, no explanation — only valid JSON.`;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      temperature: 0.7,
      max_tokens: 1024,
      response_format: { type: 'json_object' }, // forces the model to return valid JSON only
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from Groq.');
  return text;
}

/**
 * Safely parses Groq's JSON response.
 * Groq occasionally wraps JSON in markdown code fences — this strips them first.
 *
 * @param {string} text - Raw text from askGroq()
 * @returns {object}    - Parsed JSON object
 */
export function parseGroqJSON(text) {
  // Strip markdown code fences if present
  const clean = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/,          '')
    .trim();

  try {
    return JSON.parse(clean);
  } catch {
    // If parsing fails, extract the first {...} block and try again
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error(`Could not parse Groq response as JSON: ${clean}`);
  }
}