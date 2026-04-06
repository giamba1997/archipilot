# ArchiPilot V3

Copilote IA pour architectes — Gestion de chantier et génération de PV.

## Démarrage rapide

### Prérequis
- Node.js 18+ (https://nodejs.org — télécharge la version LTS)

### Installation et lancement

```bash
# 1. Entre dans le dossier
cd archipilot-project

# 2. Installe les dépendances
npm install

# 3. Lance le serveur de développement
npm run dev
```

Le navigateur s'ouvre automatiquement sur `http://localhost:3000`.

### Avec Claude Code

Si tu utilises Claude Code, tu peux simplement lui dire :
```
Ouvre le projet archipilot-project, installe les dépendances et lance le serveur de dev.
```

## Structure du projet

```
archipilot-project/
├── index.html          # Point d'entrée HTML
├── package.json        # Dépendances Node.js
├── vite.config.js      # Configuration Vite (bundler)
├── README.md
└── src/
    ├── main.jsx        # Point d'entrée React
    └── App.jsx         # Application ArchiPilot complète
```

## Fonctionnalités

- Gestion multi-projets avec sidebar
- 7 statuts de projet (Esquisse → Clôturé)
- Participants avec email + téléphone
- Prise de notes par poste du cahier des charges
- Génération de PV via API Claude
- Historique des PV avec consultation
- Actions ouvertes avec suivi entre PV
- Création / duplication / archivage de projets
- Récurrence des réunions
