# 🎯 AI – Optimiseur de candidature

Application full-stack avec authentification sécurisée, gestion multi‑fournisseurs d’IA, système de fallback automatique, et interface d’administration complète.

## ✨ Fonctionnalités
### 🔐 Authentification & multi‑utilisateurs
- Inscription / connexion par email + mot de passe (hashé avec bcrypt)
- Sessions JWT (stockées en localStorage)
- Chaque utilisateur possède son propre espace sécurisé
- Gestion des rôles (utilisateur / administrateur)
### 🧠 Multi‑fournisseurs d’IA avec fallback automatique
- Google Gemini (Gemini 2.5 Flash & Pro) – gratuit
- Groq (Llama 3.1 8B & 70B) – gratuit
- Mistral (Small, Large, Codestral) – gratuit
- Claude (Anthropic) – payant (inclus pour compatibilité)
- Fallback intelligent : si le provider principal échoue, le système tente automatiquement les autres providers configurés
- Gestion individuelle des clés API par provider (chiffrées en base de données avec AES‑256‑GCM)
### 🛠️ Outils d'optimisation
1. **🚨 Détecteur de signaux d'alarme** – Identifie ce qui fait zapper votre CV en 10 secondes
2. **✍️ Réécriture complète** – Adapte votre CV au poste cible
3. **🤖 Anti-ATS & score** – Analyse de compatibilité
4. **🔑 Correcteur de mots-clés** – Optimise les compétences
5. **📨 Lettre de motivation** – Personnalisée, <250 mots
6. **🎤 Préparation entretien** – 10 questions + réponses
### 👑 Administration
L’interface d’administration est accessible via le bouton « 🔐 Administration » dans le dashboard (visible uniquement pour les admins).
#### 👥 Utilisateurs
- Liste paginée de tous les utilisateurs
- Activer / désactiver un compte
- Promouvoir / rétrograder un administrateur
- Supprimer un compte (irréversible)
- Statistiques globales (total, actifs, admins, inscriptions)
#### 💾 Base de données
- Sauvegarde complète – export de la base entière (VACUUM INTO)
- Sauvegarde incrémentielle – export des modifications
- Restaurer une sauvegarde existante
- Télécharger une sauvegarde
- Exporter en JSON – toutes les tables
- Importer depuis JSON – avec transaction rollback en cas d’erreur
- Historique des sauvegardes (nom, taille, date)
#### 📧 Emails
- Envoyer un email à tous les utilisateurs actifs ou à une sélection
- Utiliser des modèles prédéfinis (Bienvenue, Newsletter, Inactif, Maintenance)
- Personnaliser le sujet et le contenu
- Utiliser [NOM] dans le message pour personnaliser par utilisateur
#### 📧 Authentification SMTP
##### OAuth 2.0 (Recommandé pour Gmail)
- ✅ Sécurisé et moderne
- ✅ Rafraîchissement automatique des tokens
- ✅ Pas de mot de passe stocké en base
- ✅ Configuration via Google Cloud Console
###### 📝 Configuration OAuth 2.0
- Créer un projet dans Google Cloud Console
- Activer l'API Gmail
- Créer des credentials (OAuth 2.0 Client ID)
- Configurer les scopes : https://www.googleapis.com/auth/gmail.send
- Ajouter l'URI de redirection : urn:ietf:wg:oauth:2.0:oob
- Copier Client ID et Client Secret dans l'interface
- Obtenir l'URL d'autorisation et autoriser l'accès
- Échanger le code contre des tokens
##### Authentification par mot de passe
- ✅ Compatibilité avec tous les serveurs SMTP
- ✅ Simple à configurer
- ⚠️ Moins sécurisé que OAuth 2.0

## 🚀 Installation

### Prérequis
- Node.js (v18+)
- npm

1. **Cloner le dépôt**
   ```bash
   git clone https://github.com/sebastienbats/ai-optimiseur-de-candidature.git
   cd ai-optimiseur-de-candidature
   ```
2. **Installez les dépendances** :
   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   cd ..
   ```
3. Configurez les variables d'environnement :
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# Générez une clé de chiffrement
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
4. Lancez l'application :
```bash
# Terminal 1 - Backend
cd backend && npm run dev
# Terminal 2 - Frontend
cd frontend && npm run dev
```
5. Accédez à http://localhost:5173
6. Connectez-vous avec admin@example.com / admin123
 
## 🔑 Accès Administrateur
Par défaut :
- Email : admin@example.com
- Mot de passe : admin123
⚠️ Changez immédiatement ces identifiants en production !

## 🔒 Sécurité
- Mots de passe : hashés avec bcrypt (coût 12)
- Clés API : chiffrées avec AES‑256‑GCM (IV et auth tag stockés)
- Sessions : JWT signés, stockés en localStorage
- Rate limiting : 100 requêtes/min par IP, 30 pour les routes admin
- Helmet : headers HTTP sécurisés
- CORS : restreint aux origines autorisées
- Validation : des entrées utilisateur
- Journalisation : toutes les actions admin sont tracées (IP, date, action)
- Protection : contre les injections SQL (via SQLite préparé)
## 🐳 Déploiement Docker
```bash
docker-compose up -d
```
## Manuellement (production)
``` bash
# Backend
cd backend
npm install --production
NODE_ENV=production node src/server.js

# Frontend
cd frontend
npm install
npm run build
# Servir le dossier dist/ avec Nginx ou autre
```
## Exemple de configuration Nginx
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        root /var/www/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
## 🔒 Sécurité
- ✅ Mots de passe hashés (bcrypt)
- ✅ Clés API chiffrées (AES-256-GCM)
- ✅ JWT pour sessions
- ✅ Rate limiting
- ✅ Helmet pour headers HTTP
- ✅ CORS configuré

## 📡 API
- Toutes les routes sont préfixées par /api.
### Authentification (public)
|Méthode|	Route|Description|
|-------|------|-----------|
|POST|/auth/register|Inscription|
|POST|/auth/login|Connexion|
### Utilisateur (authentifié)
|Méthode|Route|Description|
|-------|-----|-----------|
|POST|/documents/save|Sauvegarder un document (CV, offre, résultat)|
|GET|/documents/user|Récupérer tous les documents|
|GET|/documents/user/:type|Récupérer les documents par type|
|DELETE|/documents/:id|Supprimer un document|
|PUT|/documents/:id|Mettre à jour un document|
|POST|/documents/provider-keys|Sauvegarder une clé API (provider)|
|GET|/documents/provider-keys|Récupérer toutes les clés API|
|GET|/documents/provider-keys/:provider|Récupérer une clé spécifique|
|DELETE|/documents/provider-keys/:provider|Supprimer une clé|
|POST|/documents/ai/call|Appel IA unifié avec fallback|
|GET|/documents/providers|Liste des providers supportés|
|GET|/documents/stats|Statistiques des documents|
### Administration (authentifié + admin)
|Méthode|	Route	|Description|
|-------|-------|-----------|
|GET|/admin/users|Liste des utilisateurs|
|GET|/admin/users/stats|Statistiques|
|PATCH|/admin/users/:id/toggle|Activer/désactiver|
|DELETE|/admin/users/:id|Supprimer|
|PATCH|/admin/users/:id/admin|Promouvoir admin|
|POST|/admin/database/backup|Sauvegarde|
|GET|/admin/database/backups|Liste des sauvegardes|
|POST|/admin/database/restore|Restaurer|
|GET|/admin/database/export/json|Export JSON|
|POST|/admin/database/import/json|Import JSON|
|DELETE|/admin/database/backups/:filename|Supprimer une sauvegarde|
|POST|/admin/email/send|Envoi d’emails groupés|
|GET|/admin/email/templates|	Modèles d’email|
|GET|/admin/smtp/config|Récupérer config SMTP|
|POST|/admin/smtp/config|Sauvegarder config SMTP|
|POST|/admin/smtp/test|Tester config SMTP|
|DELETE|/admin/smtp/config|Supprimer config|
|GET|/admin/logs|Journal d’administration|

## 🔧 Maintenance
### Sauvegarde automatique (Cron)
```bash
# Ajouter une tâche cron pour la sauvegarde quotidienne
0 2 * * * cd /path/to/backend && npm run backup
```
### Commandes utiles
```bash
# Démarrer en mode développement
npm run dev
# Démarrer en production
npm start
# Sauvegarde manuelle
npm run backup
# Vérifier l'intégrité de la base
sqlite3 database.sqlite "PRAGMA integrity_check;"
```
## 📄 Licence
MIT – Libre d'utilisation et de modification.
