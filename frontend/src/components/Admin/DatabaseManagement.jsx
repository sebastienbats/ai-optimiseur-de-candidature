import { useState, useEffect } from 'react';
import { api } from '../../services/api';

export default function DatabaseManagement() {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backupInProgress, setBackupInProgress] = useState(false);
  const [restoreInProgress, setRestoreInProgress] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  useEffect(() => {
    fetchBackups();
  }, []);

  const fetchBackups = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/database/backups');
      setBackups(response.data.backups || []);
      setError(null);
    } catch (error) {
      console.error('Erreur chargement sauvegardes:', error);
      setError('Erreur lors du chargement des sauvegardes');
    } finally {
      setLoading(false);
    }
  };

  const createBackup = async (type = 'full') => {
    setBackupInProgress(true);
    setError(null);
    setSuccessMessage(null);
    
    try {
      const response = await api.post('/admin/database/backup', { type });
      
      // ✅ Vérifier la réponse du serveur
      if (response.data && response.data.success === true) {
        setSuccessMessage(`✅ Sauvegarde ${type} créée avec succès !`);
        await fetchBackups();
        // Effacer le message après 5 secondes
        setTimeout(() => setSuccessMessage(null), 5000);
      } else {
        throw new Error(response.data?.error || 'Erreur inconnue');
      }
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
      const errorMsg = error.response?.data?.error || error.message || 'Erreur lors de la sauvegarde';
      setError(`❌ ${errorMsg}`);
      setTimeout(() => setError(null), 5000);
    } finally {
      setBackupInProgress(false);
    }
  };

  const restoreBackup = async (filename) => {
    if (!confirm(`⚠️ Restaurer la sauvegarde ${filename} ? Cette action est irréversible.`)) return;
    
    setRestoreInProgress(true);
    setError(null);
    setSuccessMessage(null);
    
    try {
      const response = await api.post('/admin/database/restore', { filename });
      
      if (response.data && response.data.success === true) {
        setSuccessMessage('✅ Base de données restaurée avec succès !');
        await fetchBackups();
        setTimeout(() => setSuccessMessage(null), 5000);
      } else {
        throw new Error(response.data?.error || 'Erreur inconnue');
      }
    } catch (error) {
      console.error('Erreur restauration:', error);
      const errorMsg = error.response?.data?.error || error.message || 'Erreur lors de la restauration';
      setError(`❌ ${errorMsg}`);
      setTimeout(() => setError(null), 5000);
    } finally {
      setRestoreInProgress(false);
    }
  };

  const downloadBackup = async (filename) => {
    try {
      const response = await api.get(`/admin/database/backups/download/${filename}`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erreur téléchargement:', error);
      setError('❌ Erreur lors du téléchargement');
      setTimeout(() => setError(null), 5000);
    }
  };

  const deleteBackup = async (filename) => {
    if (!confirm(`Supprimer la sauvegarde ${filename} ?`)) return;
    
    try {
      const response = await api.delete(`/admin/database/backups/${filename}`);
      
      if (response.data && response.data.success === true) {
        setSuccessMessage('✅ Sauvegarde supprimée avec succès');
        await fetchBackups();
        setTimeout(() => setSuccessMessage(null), 5000);
      } else {
        throw new Error(response.data?.error || 'Erreur inconnue');
      }
    } catch (error) {
      console.error('Erreur suppression:', error);
      setError('❌ Erreur lors de la suppression');
      setTimeout(() => setError(null), 5000);
    }
  };

  const exportData = async () => {
    try {
      const response = await api.get('/admin/database/export/json');
      
      if (response.data && response.data.success === true) {
        const dataStr = JSON.stringify(response.data.data, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `export_${new Date().toISOString().slice(0,10)}.json`;
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        setSuccessMessage('✅ Export JSON réussi');
        setTimeout(() => setSuccessMessage(null), 5000);
      } else {
        throw new Error('Erreur lors de l\'export');
      }
    } catch (error) {
      console.error('Erreur export:', error);
      setError('❌ Erreur lors de l\'export');
      setTimeout(() => setError(null), 5000);
    }
  };

  const importData = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = JSON.parse(e.target.result);
          const response = await api.post('/admin/database/import/json', { data });
          
          if (response.data && response.data.success === true) {
            setSuccessMessage('✅ Données importées avec succès !');
            await fetchBackups();
            setTimeout(() => setSuccessMessage(null), 5000);
          } else {
            throw new Error('Erreur lors de l\'import');
          }
        } catch (error) {
          console.error('Erreur import:', error);
          setError('❌ Erreur lors de l\'import');
          setTimeout(() => setError(null), 5000);
        }
      };
      reader.readAsText(file);
    } catch (error) {
      console.error('Erreur lecture fichier:', error);
      setError('❌ Erreur lors de la lecture du fichier');
      setTimeout(() => setError(null), 5000);
    }
    
    // Réinitialiser l'input
    event.target.value = '';
  };

  if (loading) {
    return <div className="text-gray-600 text-center py-8">Chargement...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Messages d'état */}
      {error && (
        <div className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="bg-green-50 border border-green-400 text-green-700 px-4 py-3 rounded-lg">
          {successMessage}
        </div>
      )}

      {/* Actions */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <button
          onClick={() => createBackup('full')}
          disabled={backupInProgress}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {backupInProgress ? '⏳ Sauvegarde...' : '💾 Sauvegarde complète'}
        </button>
        <button
          onClick={() => createBackup('incremental')}
          disabled={backupInProgress}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {backupInProgress ? '⏳ Sauvegarde...' : '📝 Sauvegarde incrémentielle'}
        </button>
        <button
          onClick={exportData}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          📤 Exporter JSON
        </button>
        <label className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 cursor-pointer text-center transition-colors">
          📥 Importer JSON
          <input
            type="file"
            accept=".json"
            onChange={importData}
            className="hidden"
          />
        </label>
      </div>

      {/* Liste des sauvegardes */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b">
          <h3 className="text-lg font-medium text-gray-900">Historique des sauvegardes</h3>
          <p className="text-sm text-gray-500">{backups.length} sauvegarde(s)</p>
        </div>
        
        {backups.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-500">
            Aucune sauvegarde disponible
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fichier</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Taille</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {backups.map((backup) => (
                  <tr key={backup.filename}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{backup.filename}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded ${
                        backup.type === 'complète' || backup.type === 'full'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {backup.type === 'complète' || backup.type === 'full' ? 'Complète' : 'Incrémentielle'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {(backup.size / 1024).toFixed(1)} KB
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(backup.created).toLocaleString('fr-FR')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                      <button
                        onClick={() => downloadBackup(backup.filename)}
                        className="text-indigo-600 hover:text-indigo-900 transition-colors"
                        title="Télécharger"
                      >
                        ⬇️
                      </button>
                      <button
                        onClick={() => restoreBackup(backup.filename)}
                        disabled={restoreInProgress}
                        className="text-green-600 hover:text-green-900 disabled:opacity-50 transition-colors"
                        title="Restaurer"
                      >
                        🔄
                      </button>
                      <button
                        onClick={() => deleteBackup(backup.filename)}
                        className="text-red-600 hover:text-red-900 transition-colors"
                        title="Supprimer"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
