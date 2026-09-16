import express from 'express';
import cors from 'cors';
import validationRouter from './routes/validation.js';

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

// Register API routes
app.use('/api', validationRouter);

import fetch from 'node-fetch';

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Ping ERDDAP with a 3-second timeout to verify real internet connectivity
    const controller = new AbortController();
    const timeout = setTimeout(() => { controller.abort(); }, 3000);
    const erddapPing = await fetch('https://erddap.ifremer.fr/erddap/index.json', { signal: controller.signal });
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
