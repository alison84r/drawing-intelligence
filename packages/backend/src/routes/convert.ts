import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { convertPdfToSvg } from '../services/converter'
import {
  createJob,
  updateJob,
  getJob,
  getJobDir,
  ensureBaseDir,
} from '../services/fileStore'

const router = Router()

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureBaseDir()
    cb(null, require('os').tmpdir())
  },
  filename: (_req, _file, cb) => {
    cb(null, `upload-${uuidv4()}.pdf`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true)
    } else {
      cb(new Error('Only PDF files are supported'))
    }
  },
})

// POST /api/convert — upload PDF, start conversion
router.post('/', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' })
    return
  }

  // Basic PDF magic-bytes check
  const fd = fs.openSync(req.file.path, 'r')
  const header = Buffer.alloc(4)
  fs.readSync(fd, header, 0, 4, 0)
  fs.closeSync(fd)
  if (header.toString('ascii') !== '%PDF') {
    fs.unlink(req.file.path, () => {})
    res.status(400).json({ error: 'File does not appear to be a valid PDF' })
    return
  }

  const jobId = uuidv4()
  const jobDir = getJobDir(jobId)
  fs.mkdirSync(jobDir, { recursive: true })

  const inputPath = path.join(jobDir, 'input.pdf')
  fs.renameSync(req.file.path, inputPath)

  const outputBase = path.join(jobDir, 'output.svg')
  const job = createJob(jobId, inputPath)

  res.status(202).json({
    jobId,
    status: job.status,
    estimatedSeconds: 5,
  })

  // Run conversion asynchronously
  updateJob(jobId, { status: 'running', progress: 10 })

  convertPdfToSvg(inputPath, outputBase)
    .then((actualOutputPath) => {
      updateJob(jobId, {
        status: 'done',
        progress: 100,
        outputPath: actualOutputPath,
      })
    })
    .catch((err: Error) => {
      updateJob(jobId, {
        status: 'failed',
        progress: 0,
        error: err.message,
      })
    })
})

// GET /api/convert/:jobId — poll status
router.get('/:jobId', (req: Request, res: Response) => {
  const job = getJob(req.params['jobId'] ?? '')
  if (!job) {
    res.status(404).json({ error: 'Job not found' })
    return
  }

  res.json({
    jobId: job.jobId,
    status: job.status,
    progress: job.progress,
    svgUrl: job.status === 'done' ? `/api/svg/${job.jobId}` : null,
    error: job.error,
  })
})

export default router
