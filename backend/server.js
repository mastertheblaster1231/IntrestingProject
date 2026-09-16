import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import validationRouter from './routes/validation.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const ERDDAP_IFREMER_INDEX = process.env.ERDDAP_IFREMER_INDEX || 'https://erddap.ifremer.fr/erddap/index.json';
const HEALTH_PING_TIMEOUT_MS = parseInt(process.env.HEALTH_PING_TIMEOUT_MS || '3000', 10);

const corsOptions = CORS_ORIGIN === '*'
  ? { origin: '*' }
  : { origin: CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean) };

app.use(cors(corsOptions));
app.use(express.json());

// Register API routes (validation, fleet, profile, depth-slice, model/point)
app.use('/api', validationRouter);

// Health check endpoint — also expose /api/health for frontend parity with Python
app.get(['/health', '/api/health'], async (req, res) => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => { controller.abort(); }, HEALTH_PING_TIMEOUT_MS);
    const erddapPing = await fetch(ERDDAP_IFREMER_INDEX, { signal: controller.signal });
    clearTimeout(timeout);
    if (erddapPing.ok) {
      res.json({ status: 'ok', erddap: 'connected', timestamp: new Date().toISOString() });
    } else {
      res.status(503).json({ status: 'fallback', erddap: 'offline', error: 'ERDDAP responded with error' });
    }
  } catch (err) {
    res.status(503).json({ status: 'fallback', erddap: 'offline', error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Ocean ERDDAP Validation Backend running on port ${PORT}`);
});
