import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import validationRouter from './routes/validation.js';
import { fetchErddapJson } from './services/erddap.js';
import { isModelConfigured } from './services/modelGrid.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const HEALTH_PING_TIMEOUT_MS = parseInt(process.env.HEALTH_PING_TIMEOUT_MS || '8000', 10);

/**
 * Health check pings the dataset's .das (a few KB of metadata) rather than
 * /erddap/index.json, which is the full server catalogue and can take many
 * seconds to build. A health check that times out looks like an outage.
 */
const HEALTH_PING_URL =
  process.env.ERDDAP_HEALTH_URL ||
  'https://erddap.ifremer.fr/erddap/info/ArgoFloats/index.json';

const corsOptions =
  CORS_ORIGIN === '*'
    ? { origin: '*' }
    : { origin: CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean) };

app.use(cors(corsOptions));
app.use(express.json());
app.use('/api', validationRouter);

app.get(['/health', '/api/health'], async (_req, res) => {
  const started = Date.now();
  try {
    await fetchErddapJson(HEALTH_PING_URL, { retries: 0, timeoutMs: HEALTH_PING_TIMEOUT_MS });
    res.json({
      status: 'ok',
      erddap: 'connected',
      latency_ms: Date.now() - started,
      model_configured: isModelConfigured(),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    // 503 is correct: the API is up but its upstream is not. Do not report ok.
    res.status(503).json({
      status: 'degraded',
      erddap: 'unreachable',
      error: err.message,
      model_configured: isModelConfigured(),
      timestamp: new Date().toISOString(),
    });
  }
});

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Ocean backend listening on :${PORT}`);
    console.log(`  core Argo : ${process.env.ERDDAP_IFREMER_BASE || 'default Ifremer ArgoFloats'}`);
    console.log(`  BGC Argo  : ${process.env.ERDDAP_BGC_BASE || 'default ArgoFloats-synthetic-BGC'}`);
    console.log(
      `  model     : ${isModelConfigured() ? process.env.MODEL_DATASET_ID : 'NOT CONFIGURED (model values will report available:false)'}`
    );
  });
}

export default app;
