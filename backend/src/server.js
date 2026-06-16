import app from './app.js';
import { initializeDatabase } from './database.js';

const PORT = process.env.PORT || 5000;

// Initialize database and start server
(async () => {
  try {
    await initializeDatabase();
    console.log('✅ Base de données initialisée');

    app.listen(PORT, () => {
      console.log(`🚀 Serveur démarré sur le port ${PORT}`);
      console.log(`📊 API disponible: http://localhost:${PORT}/api`);
      console.log(`🔍 Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('❌ Erreur lors du démarrage:', error);
    process.exit(1);
  }
})();

// Gestion des signaux d'arrêt
process.on('SIGINT', () => {
  console.log('\n🛑 Arrêt du serveur...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Arrêt du serveur...');
  process.exit(0);
});
