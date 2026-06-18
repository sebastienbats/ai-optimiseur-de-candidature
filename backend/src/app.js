import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import documentRoutes from './routes/documents.js';
import adminRoutes from './routes/admin.js';

dotenv.config();

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL || 'https://yourdomain.com'
    : 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api', limiter);

// Limiter plus strict pour les routes admin
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30
});
app.use('/api/admin', adminLimiter);

// ✅ Augmenter la limite de taille et le timeout
app.use(express.json({ limit: '50mb' }));

// ✅ Timeout pour les requêtes longues (sauvegardes)
app.use((req, res, next) => {
  // Augmenter le timeout à 5 minutes pour les sauvegardes
  req.setTimeout(300000, () => {
    console.error('⏱️ Timeout de la requête:', req.method, req.url);
    res.status(504).json({ 
      success: false,
      error: 'La requête a pris trop de temps. Veuillez réessayer.' 
    });
  });
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  if (err.code === 'ECONNABORTED') {
    return res.status(504).json({ 
      success: false,
      error: 'La requête a expiré. Veuillez réessayer.' 
    });
  }
  
  res.status(500).json({ 
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Erreur serveur' 
      : err.message 
  });
});

export default app;
