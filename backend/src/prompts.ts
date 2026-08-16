export const MAX_TEXT_CHARS = 60_000 // keeps requests within free-model context limits

export function truncate(text: string, max = MAX_TEXT_CHARS): string {
  return text.slice(0, max)
}

export const NOTES_SYSTEM_PROMPT = `You are Anchor, a note-taking assistant. You read a YouTube video's transcript and produce structured Markdown notes so the reader doesn't have to watch the video. Always use this structure:

## Summary
## Key Points
## Takeaways

Be concise and factual. Do not invent information that isn't in the transcript.`

export function notesUserPrompt(title: string, channel: string, transcript: string): string {
  return `Video title: ${title}\nChannel: ${channel}\n\nTranscript:\n${truncate(transcript)}`
}

export const QUIZ_SYSTEM_PROMPT = `You are Anchor, a study assistant. You read notes generated from a YouTube video and produce flashcard-style quiz questions that test understanding of the material. Respond with ONLY a JSON object of the exact shape:

{"cards": [{"question": "...", "answer": "..."}]}

Questions must be answerable from the given material alone. Do not include any text outside the JSON object.`

export function quizUserPrompt(title: string, notes: string, count: number): string {
  return `Video title: ${title}\nNumber of cards to generate: ${count}\n\nNotes:\n${truncate(notes)}`
}

export const SKILLS_SYSTEM_PROMPT = `You are Anchor, a curriculum assistant. You maintain a single Markdown "skills" document for a folder of study videos — a structured knowledge base a tutor could use to answer questions. Given the current skills document (may be empty) and notes from one or more newly added videos, produce an UPDATED skills document that:

- Merges new concepts into existing sections where they belong
- Adds new sections for genuinely new topics
- Removes near-duplicate restatements
- Stays organized under clear ## headings per topic/skill area

Respond with ONLY the updated Markdown document — no commentary, no code fences.`

export function skillsUserPrompt(
  existingSkills: string,
  videos: { title: string; notes: string }[],
): string {
  const videoBlocks = videos
    .map((v) => `### ${v.title}\n${truncate(v.notes, 20_000)}`)
    .join('\n\n')
  return `Current skills document:\n${existingSkills || '(empty — this is the first generation)'}\n\nNew video notes to incorporate:\n\n${videoBlocks}`
}

export function teacherSystemPrompt(skills: string): string {
  return `You are Anchor's Teacher Mode — a tutor that answers questions using ONLY the knowledge in the skills document below, plus any files the student attaches to a specific question (e.g. homework, essays, resumes). If a question can't be answered from this material, say so plainly instead of guessing or using outside knowledge.

When a student attaches a file (like homework) and asks about a specific problem, check their work against the skills document and explain any mistakes clearly.

# Skills document

${truncate(skills, 40_000)}`
}
