import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { completeWithFreeModel, OpenRouterError } from './openrouter.js'
import {
  NOTES_SYSTEM_PROMPT,
  QUIZ_SYSTEM_PROMPT,
  SKILLS_SYSTEM_PROMPT,
  notesUserPrompt,
  quizUserPrompt,
  skillsUserPrompt,
  teacherSystemPrompt,
} from './prompts.js'

const PORT = Number(process.env.PORT ?? 8787)

if (!process.env.OPENROUTER_API_KEY) {
  console.error('Missing OPENROUTER_API_KEY in backend/.env — see backend/.env.example')
  process.exit(1)
}

const app = express()
app.disable('x-powered-by')
app.use(cors())
app.use(express.json({ limit: '2mb' }))

function handleError(res: express.Response, err: unknown) {
  if (err instanceof OpenRouterError) {
    res.status(err.status).json({ error: err.message })
    return
  }
  res.status(500).json({ error: (err as Error).message })
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// Generate structured notes from a video transcript.
app.post('/summarize', async (req, res) => {
  const { title, channel, transcript } = req.body as {
    title?: string
    channel?: string
    transcript?: string
  }
  if (!transcript || typeof transcript !== 'string') {
    res.status(400).json({ error: 'Missing "transcript" in request body.' })
    return
  }
  try {
    const { content, model } = await completeWithFreeModel([
      { role: 'system', content: NOTES_SYSTEM_PROMPT },
      { role: 'user', content: notesUserPrompt(title ?? 'Unknown', channel ?? 'Unknown', transcript) },
    ])
    res.json({ content, model })
  } catch (err) {
    handleError(res, err)
  }
})

// Generate flashcard-style quiz cards from a video's notes.
app.post('/quiz', async (req, res) => {
  const { title, notes, count } = req.body as { title?: string; notes?: string; count?: number }
  if (!notes || typeof notes !== 'string') {
    res.status(400).json({ error: 'Missing "notes" in request body.' })
    return
  }
  const cardCount = Math.min(Math.max(Number(count) || 5, 1), 20)
  try {
    const { content, model } = await completeWithFreeModel(
      [
        { role: 'system', content: QUIZ_SYSTEM_PROMPT },
        { role: 'user', content: quizUserPrompt(title ?? 'Unknown', notes, cardCount) },
      ],
      { jsonMode: true },
    )
    let parsed: { cards?: { question: string; answer: string }[] }
    try {
      parsed = JSON.parse(content) as { cards?: { question: string; answer: string }[] }
    } catch {
      res.status(502).json({ error: 'Model returned invalid JSON for quiz cards.' })
      return
    }
    res.json({ cards: parsed.cards ?? [], model })
  } catch (err) {
    handleError(res, err)
  }
})

// Merge notes from one or more videos into a folder's cumulative skills.md.
app.post('/skills', async (req, res) => {
  const { existingSkills, videos } = req.body as {
    existingSkills?: string
    videos?: { title: string; notes: string }[]
  }
  if (!videos || videos.length === 0) {
    res.status(400).json({ error: 'Missing "videos" in request body.' })
    return
  }
  try {
    const { content, model } = await completeWithFreeModel([
      { role: 'system', content: SKILLS_SYSTEM_PROMPT },
      { role: 'user', content: skillsUserPrompt(existingSkills ?? '', videos) },
    ])
    res.json({ content, model })
  } catch (err) {
    handleError(res, err)
  }
})

// Teacher-mode chat, grounded in a folder's skills.md plus optional attached file text.
app.post('/chat', async (req, res) => {
  const { skills, attachments, history, message } = req.body as {
    skills?: string
    attachments?: { name: string; text: string }[]
    history?: { role: 'user' | 'assistant'; content: string }[]
    message?: string
  }
  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'Missing "message" in request body.' })
    return
  }
  const attachmentBlock = (attachments ?? [])
    .map((a) => `\n\n[Attached file: ${a.name}]\n${a.text.slice(0, 20_000)}`)
    .join('')

  try {
    const { content, model } = await completeWithFreeModel([
      { role: 'system', content: teacherSystemPrompt(skills ?? '') },
      ...(history ?? []),
      { role: 'user', content: `${message}${attachmentBlock}` },
    ])
    res.json({ content, model })
  } catch (err) {
    handleError(res, err)
  }
})

app.listen(PORT, () => {
  console.log(`Anchor backend listening on http://localhost:${PORT}`)
})
