import type { ChatTurn } from './llmProviders'
import { sendMessageWithRetry } from './messaging'

export type LlmEndpoint = 'summarize' | 'quiz' | 'skills' | 'chat'

export interface LlmCompleteResult {
  ok: boolean
  content?: string
  cards?: { question: string; answer: string }[]
  model?: string
  error?: string
}

export type LlmCompleteFn = (
  endpoint: LlmEndpoint,
  body: Record<string, unknown>,
  turns: ChatTurn[],
) => Promise<LlmCompleteResult>

// Default: reach the background service worker via chrome.runtime messaging
// — required for callers in another JS context (popup, notebook page).
// Callers that already run inside the background worker itself (the
// auto-generation pipeline) should pass their own completion function that
// calls the underlying logic directly instead — see background/pipeline.ts
// and background/llmComplete.ts. Routing an in-worker caller through
// chrome.runtime.sendMessage means the worker sends itself a message and
// waits for its own listener to answer, which is unnecessary indirection
// that can fail with "Could not establish connection. Receiving end does
// not exist." under real-world conditions.
const defaultLlmComplete: LlmCompleteFn = (endpoint, body, turns) =>
  sendMessageWithRetry({ type: 'LLM_COMPLETE', endpoint, body, turns })

const NOTES_SYSTEM_PROMPT = `You are Anchor, a note-taking assistant. You read a YouTube video's transcript and produce structured Markdown notes so the reader doesn't have to watch the video. Always use this structure:

## Summary
## Key Points
## Takeaways

Be concise and factual. Do not invent information that isn't in the transcript.`

export async function generateNotes(
  title: string,
  channel: string,
  transcript: string,
  complete: LlmCompleteFn = defaultLlmComplete,
): Promise<string> {
  const res = await complete(
    'summarize',
    { title, channel, transcript },
    [
      { role: 'system', content: NOTES_SYSTEM_PROMPT },
      { role: 'user', content: `Video title: ${title}\nChannel: ${channel}\n\nTranscript:\n${transcript}` },
    ],
  )
  if (!res.ok || !res.content) throw new Error(res.error ?? 'Note generation failed.')
  return res.content
}

const QUIZ_SYSTEM_PROMPT = `You are Anchor, a study assistant. You read notes generated from a YouTube video and produce flashcard-style quiz questions that test understanding of the material. Respond with ONLY a JSON object of the exact shape:

{"cards": [{"question": "...", "answer": "..."}]}

Questions must be answerable from the given material alone. Do not include any text outside the JSON object.`

export async function generateQuizCards(
  title: string,
  notes: string,
  count = 5,
  complete: LlmCompleteFn = defaultLlmComplete,
): Promise<{ question: string; answer: string }[]> {
  const res = await complete(
    'quiz',
    { title, notes, count },
    [
      { role: 'system', content: QUIZ_SYSTEM_PROMPT },
      { role: 'user', content: `Video title: ${title}\nNumber of cards to generate: ${count}\n\nNotes:\n${notes}` },
    ],
  )
  if (!res.ok) throw new Error(res.error ?? 'Quiz generation failed.')
  if (res.cards) return res.cards
  if (res.content) {
    try {
      const parsed = JSON.parse(res.content) as { cards?: { question: string; answer: string }[] }
      return parsed.cards ?? []
    } catch {
      throw new Error('Model returned invalid JSON for quiz cards.')
    }
  }
  return []
}

const SKILLS_SYSTEM_PROMPT = `You are Anchor, a curriculum assistant. You maintain a single Markdown "skills" document for a folder of study videos — a structured knowledge base a tutor could use to answer questions. Given the current skills document (may be empty) and notes from one or more newly added videos, produce an UPDATED skills document that:

- Merges new concepts into existing sections where they belong
- Adds new sections for genuinely new topics
- Removes near-duplicate restatements
- Stays organized under clear ## headings per topic/skill area

Respond with ONLY the updated Markdown document — no commentary, no code fences.`

export async function generateSkills(
  existingSkills: string,
  videos: { title: string; notes: string }[],
  complete: LlmCompleteFn = defaultLlmComplete,
): Promise<string> {
  const videoBlocks = videos.map((v) => `### ${v.title}\n${v.notes}`).join('\n\n')
  const userPrompt = `Current skills document:\n${existingSkills || '(empty — this is the first generation)'}\n\nNew video notes to incorporate:\n\n${videoBlocks}`
  const res = await complete(
    'skills',
    { existingSkills, videos },
    [
      { role: 'system', content: SKILLS_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  )
  if (!res.ok || !res.content) throw new Error(res.error ?? 'Skills generation failed.')
  return res.content
}

function teacherSystemPrompt(skills: string): string {
  return `You are Anchor's Teacher Mode — a tutor that answers questions using ONLY the knowledge in the skills document below, plus any files the student attaches to a specific question (e.g. homework, essays, resumes). If a question can't be answered from this material, say so plainly instead of guessing or using outside knowledge.

When a student attaches a file (like homework) and asks about a specific problem, check their work against the skills document and explain any mistakes clearly.

# Skills document

${skills}`
}

export async function sendChatMessage(
  skills: string,
  history: ChatTurn[],
  message: string,
  attachments: { name: string; text: string }[],
  complete: LlmCompleteFn = defaultLlmComplete,
): Promise<string> {
  const attachmentBlock = attachments
    .map((a) => `\n\n[Attached file: ${a.name}]\n${a.text.slice(0, 20_000)}`)
    .join('')
  const turns: ChatTurn[] = [
    { role: 'system', content: teacherSystemPrompt(skills) },
    ...history,
    { role: 'user', content: `${message}${attachmentBlock}` },
  ]
  const res = await complete(
    'chat',
    {
      skills,
      attachments,
      history: history.map((h) => ({ role: h.role, content: h.content })),
      message,
    },
    turns,
  )
  if (!res.ok || !res.content) throw new Error(res.error ?? 'Chat request failed.')
  return res.content
}
