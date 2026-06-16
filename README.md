# 🎯 AI – Optimiseur de candidature

Application full-stack avec authentification sécurisée, gestion des clés API personnelles, interface d'administration complète, et intégration Claude API.

## ✨ Fonctionnalités

### 🔐 Sécurité & Multi-utilisateurs
- Authentification email + mot de passe (bcrypt)
- Clés API personnelles chiffrées (AES-256-GCM)
- Sessions JWT
- Base de données SQLite
- Administration complète avec logs

### 🛠️ Outils d'optimisation
1. **🚨 Détecteur de signaux d'alarme** – Identifie ce qui fait zapper votre CV en 10 secondes
2. **✍️ Réécriture complète** – Adapte votre CV au poste cible
3. **🤖 Anti-ATS & score** – Analyse de compatibilité
4. **🔑 Correcteur de mots-clés** – Optimise les compétences
5. **📨 Lettre de motivation** – Personnalisée, <250 mots
6. **🎤 Préparation entretien** – 10 questions + réponses

### 👑 Administration
- **Gestion des utilisateurs** : Liste, activation/désactivation, promotion admin, suppression
- **Base de données** :
  - Sauvegarde complète et incrémentielle
  - Restauration
  - Export/Import JSON
  - Historique des sauvegardes
- **Emails** : Envoi groupé, modèles prédéfinis, personnalisation
- **Journal d'administration** : Toutes les actions tracées

## 🚀 Installation

### Prérequis
- Node.js (v18+)
- npm

### Backend
```bash
cd backend
npm install
cp .env.example .env
# Éditer .env avec vos valeurs
npm run dev
```
### Frontend
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```
## 🔑 Accès Administrateur
Par défaut :
- Email : admin@example.com
- Mot de passe : admin123
⚠️ Changez immédiatement ces identifiants en production !

## 📧 Configuration Email
Pour l'envoi d'emails :
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=votre_email@gmail.com
SMTP_PASS=votre_mot_de_passe_application
```
## 🐳 Déploiement Docker
```bash
docker-compose up -d
```
## 🔒 Sécurité
- ✅ Mots de passe hashés (bcrypt)
- ✅ Clés API chiffrées (AES-256-GCM)
- ✅ JWT pour sessions
- ✅ Rate limiting
- ✅ Helmet pour headers HTTP
- ✅ CORS configuré

## 📊 API Endpoints
### Public
- POST /api/auth/register - Inscription
- POST /api/auth/login - Connexion

### Utilisateur
- POST /api/documents/save - Sauvegarder document
- GET /api/documents/user - Récupérer documents
- POST /api/documents/api-key - Sauvegarder clé API
- GET /api/documents/api-key - Récupérer clé API
- POST /api/documents/claude - Appeler Claude

### Administration (nécessite admin)
- GET /api/admin/users - Liste utilisateurs
- GET /api/admin/users/stats - Statistiques
- PATCH /api/admin/users/:id/toggle - Activer/désactiver
- DELETE /api/admin/users/:id - Supprimer
- PATCH /api/admin/users/:id/admin - Promouvoir admin
- POST /api/admin/database/backup - Sauvegarder DB
- GET /api/admin/database/backups - Liste sauvegardes
- POST /api/admin/database/restore - Restaurer DB
- GET /api/admin/database/export/json - Exporter JSON
- POST /api/admin/database/import/json - Importer JSON
- POST /api/admin/email/send - Envoyer emails
- GET /api/admin/email/templates - Modèles email
- GET /api/admin/logs - Journal d'administration

## 📄 Licence
MIT – Libre d'utilisation et de modification

## Instructions finales

1. **Créez la structure de dossiers** comme indiqué
2. **Copiez chaque fichier** dans son emplacement exact
3. **Installez les dépendances** :
   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```
4. Configurez les variables d'environnement :
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# Générez une clé de chiffrement
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
5. Lancez l'application :
```bash
# Terminal 1 - Backend
cd backend && npm run dev
# Terminal 2 - Frontend
cd frontend && npm run dev
```
6. Accédez à http://localhost:5173
7. Connectez-vous avec admin@example.com / admin123
