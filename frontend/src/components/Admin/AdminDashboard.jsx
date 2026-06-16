import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import UserManagement from './UserManagement';
import DatabaseManagement from './DatabaseManagement';
import EmailManagement from './EmailManagement';
import SmtpConfig from './SmtpConfig';
import { useAuth } from '../../contexts/AuthContext';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('users');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await api.get('/admin/users/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Erreur chargement stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              🔐 Administration - AI Optimiseur
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Connecté en tant que {user?.email} (Administrateur)
            </p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 text-sm font-medium text-white bg-gray-600 rounded-lg hover:bg-gray-700"
          >
            ← Retour au dashboard
          </button>
        </div>

        {/* Statistiques */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="text-sm font-medium text-gray-500">Total Utilisateurs</h3>
              <p className="text-2xl font-bold text-gray-900">{stats.stats.total_users}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="text-sm font-medium text-gray-500">Utilisateurs Actifs</h3>
              <p className="text-2xl font-bold text-green-600">{stats.stats.active_users}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="text-sm font-medium text-gray-500">Administrateurs</h3>
              <p className="text-2xl font-bold text-indigo-600">{stats.stats.admin_users}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="text-sm font-medium text-gray-500">Inscriptions (7j)</h3>
              <p className="text-2xl font-bold text-blue-600">
                {stats.recentSignups.reduce((sum, day) => sum + day.count, 0)}
              </p>
            </div>
          </div>
        )}

        {/* Navigation des onglets */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8 overflow-x-auto">
            {[
              { id: 'users', label: '👥 Utilisateurs' },
              { id: 'database', label: '💾 Base de données' },
              { id: 'email', label: '📧 Emails' },
              { id: 'smtp', label: '📨 Configuration SMTP' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap
                  ${activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
                `}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Contenu des onglets */}
        <div>
          {activeTab === 'users' && <UserManagement />}
          {activeTab === 'database' && <DatabaseManagement />}
          {activeTab === 'email' && <EmailManagement />}
          {activeTab === 'smtp' && <SmtpConfig />}
        </div>
      </div>
    </div>
  );
}
