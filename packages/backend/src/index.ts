import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import convertRouter from './routes/convert'
import svgRouter from './routes/svg'

const app = express()
const PORT = parseInt(process.env['PORT'] ?? '3001', 10)

// Middleware
app.use(cors({ origin: 'http://localhost:5173', credentials: true }))
app.use(express.json())

// Rate limiting: 10 conversions per minute per IP
const convertLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many conversion requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Routes
app.use('/api/convert', convertLimiter, convertRouter)
app.use('/api/svg', svgRouter)

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Global error handler
app.use(
  (
    err: Error & { status?: number },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    const status = err.status ?? 500
    const message = err.message ?? 'Internal server error'
    console.error(`[error] ${status} ${message}`)
    res.status(status).json({ error: message })
  }
)

app.listen(PORT, () => {
  console.log(`[backend] Server running on http://localhost:${PORT}`)
})
