import { useState, useEffect } from 'react';
import { api } from '../../services/api';

export default function DatabaseManagement() {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backupInProgress, setBackupInProgress] = useState(false);
  const [restoreInProgress, setRestoreInProgress] = useState(false);

  useEffect(() => {
    fetchBackups();
  }, []);

  const fetchBackups = async () => {
    try {
      const response = await api.get('/admin/database/backups');
      setBackups(response.data.backups || []);
    } catch (error) {
      console.error('Erreur chargement sauvegardes:', error);
    } finally {
      setLoading(false);
    }
  };

  const createBackup = async (type = 'full') => {
    setBackupInProgress(true);
    try {
      await api.post('/admin/database/backup', { type });
      await fetchBackups();
      alert('✅ Sauvegarde créée avec succès !');
    } catch (error) {
      alert('❌ Erreur lors de la sauvegarde');
    } finally {
      setBackupInProgress(false);
    }
  };

  const restoreBackup = async (filename) => {
    if (!confirm(`⚠️ Restaurer la sauvegarde ${filename} ? Cette action est irréversible.`)) return;
    
    setRestoreInProgress(true);
    try {
      await api.post('/admin/database/restore', { filename });
      alert('✅ Base de données restaurée avec succès !');
      await fetchBackups();
    } catch (error) {
      alert('❌ Erreur lors de la restauration');
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
    } catch (error) {
      alert('❌ Erreur lors du téléchargement');
    }
  };

  const deleteBackup = async (filename) => {
    if (!confirm(`Supprimer la sauvegarde ${filename} ?`)) return;
    
    try {
      await api.delete(`/admin/database/backups/${filename}`);
      await fetchBackups();
      alert('✅ Sauvegarde supprimée');
    } catch (error) {
      alert('❌ Erreur lors de la suppression');
    }
  };

  const exportData = async () => {
    try {
      const response = await api.get('/admin/database/export/json');
      const dataStr = JSON.stringify(response.data, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `export_${new Date().toISOString().slice(0,10)}.json`;
      link.click();
      link.remove();
      alert('✅ Export JSON réussi');
    } catch (error) {
      alert('❌ Erreur lors de l\'export');
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
          await api.post('/admin/database/import/json', { data });
          alert('✅ Données importées avec succès !');
        } catch (error) {
          alert('❌ Erreur lors de l\'import');
        }
      };
      reader.readAsText(file);
    } catch (error) {
      alert('❌ Erreur lors de la lecture du fichier');
    }
  };

  if (loading) {
    return <div className="text-gray-600 text-center py-8">Chargement...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <button
          onClick={() => createBackup('full')}
          disabled={backupInProgress}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {backupInProgress ? '⏳ Sauvegarde...' : '💾 Sauvegarde complète'}
        </button>
        <button
          onClick={() => createBackup('incremental')}
          disabled={backupInProgress}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {backupInProgress ? '⏳ Sauvegarde...' : '📝 Sauvegarde incrémentielle'}
        </button>
        <button
          onClick={exportData}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          📤 Exporter JSON
        </button>
        <label className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 cursor-pointer text-center">
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
                        className="text-indigo-600 hover:text-indigo-900"
                        title="Télécharger"
                      >
                        ⬇️
                      </button>
                      <button
                        onClick={() => restoreBackup(backup.filename)}
                        disabled={restoreInProgress}
                        className="text-green-600 hover:text-green-900 disabled:opacity-50"
                        title="Restaurer"
                      >
                        🔄
                      </button>
                      <button
                        onClick={() => deleteBackup(backup.filename)}
                        className="text-red-600 hover:text-red-900"
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
