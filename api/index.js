/**
 * Vercel serverless entry point for the Express backend.
 *
 * The backend's Express app is exported as the handler; vercel.json rewrites
 * /api/(.*) to this function so every existing endpoint keeps its URL:
 *   /api/health, /api/fleet, /api/profile/:id, /api/argo/depth-slice,
 *   /api/model/point, /api/validation, ...
 */
import app from '../backend/server.js';

export default app;