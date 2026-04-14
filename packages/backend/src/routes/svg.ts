import { Router, type Request, type Response } from 'express'
import fs from 'fs'
import { getJob } from '../services/fileStore'

const router = Router()

// GET /api/svg/:jobId — stream the converted SVG
router.get('/:jobId', (req: Request, res: Response) => {
  const job = getJob(req.params['jobId'] ?? '')

  if (!job) {
    res.status(404).json({ error: 'Job not found' })
    return
  }

  if (job.status !== 'done' || !job.outputPath) {
    res.status(409).json({ error: `Job is not complete (status: ${job.status})` })
    return
  }

  if (!fs.existsSync(job.outputPath)) {
    res.status(410).json({ error: 'SVG file has been cleaned up' })
    return
  }

  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
  res.setHeader('Content-Disposition', 'inline')
  res.setHeader('Cache-Control', 'private, max-age=3600')

  const stream = fs.createReadStream(job.outputPath)
  stream.pipe(res)
  stream.on('error', () => res.status(500).json({ error: 'Failed to read SVG' }))
})

export default router
