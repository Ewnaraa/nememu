import { useCallback } from 'react'
import type { Language } from '@nememu/shared'
import { useSettingsStore } from '@/stores/settingsStore'

/**
 * Interface translation.
 *
 * The English text is the key. That keeps every call site readable — you see the
 * sentence, not `settings.audio.mute_label` — and it means English needs no
 * dictionary at all: a missing entry falls back to the key, which is already the
 * correct English. The cost is that changing an English string orphans its
 * translation, so `pnpm test` checks that every `t('...')` in the sources has a
 * French entry.
 *
 * `{name}` placeholders are substituted from `vars`.
 */

type Dict = Record<string, string>

const fr: Dict = {
  // Fenêtre des réglages
  'Settings': 'Réglages',
  'General': 'Général',
  'Accounts': 'Comptes',
  'Hotkeys': 'Raccourcis',
  'Teams': 'Équipes',
  'About': 'À propos',

  // Onglet Général
  'Language': 'Langue',
  'Interface language': "Langue de l'interface",
  'Display': 'Affichage',
  'Resolution': 'Résolution',
  'Game rendering resolution': 'Résolution de rendu du jeu',
  'Audio': 'Audio',
  'Mute audio': 'Couper le son',
  'Sound only when focused': 'Son uniquement au premier plan',
  'Mute when window is in background': "Coupe le son quand la fenêtre est en arrière-plan",
  'Game': 'Jeu',
  'Auto-group': 'Groupe automatique',
  'Followers auto-follow leader across maps': 'Les suiveurs suivent le meneur de carte en carte',
  'Auto-invite': 'Invitation automatique',
  'Automatically send and accept party invites': 'Envoie et accepte les invitations de groupe',
  'Notifications': 'Notifications',
  'Proxy': 'Proxy',
  'Enable proxy': 'Activer le proxy',
  'Host': 'Hôte',
  'Port': 'Port',
  'Username (optional)': 'Utilisateur (optionnel)',
  'Password (optional)': 'Mot de passe (optionnel)',
  'Applied to game traffic. The password is encrypted by your OS keychain before being written to disk.':
    "S'applique au trafic du jeu. Le mot de passe est chiffré par le trousseau de votre système avant d'être écrit sur le disque.",

  'Show FPS': 'Afficher les FPS',
  'The game caps itself at 60': 'Le jeu se limite lui-même à 60',

  'Open the chat': 'Ouvrir le chat',

  // Déplacement de carte
  'Travel': 'Déplacement',
  'Map to the left': 'Carte à gauche',
  'Map to the right': 'Carte à droite',
  'Map above': 'Carte au-dessus',
  'Map below': 'Carte en dessous',

  // Onglet Raccourcis
  'Reset to defaults': 'Réinitialiser',
  'Press keys...': 'Appuyez sur une touche…',
  'None': 'Aucune',
  'Other': 'Autres',

  // Groupes de raccourcis
  'Tabs': 'Onglets',
  'Window': 'Fenêtre',
  'Combat': 'Combat',
  'Game windows': 'Fenêtres du jeu',

  // Libellés des actions
  'Switch to Tab 1': "Aller à l'onglet 1",
  'Switch to Tab 2': "Aller à l'onglet 2",
  'Switch to Tab 3': "Aller à l'onglet 3",
  'Switch to Tab 4': "Aller à l'onglet 4",
  'Switch to Tab 5': "Aller à l'onglet 5",
  'New Tab': 'Nouvel onglet',
  'Close Tab': "Fermer l'onglet",
  'Toggle Mute': 'Couper / rétablir le son',
  'Toggle Notifications': 'Activer / couper les notifications',
  'Next Tab': 'Onglet suivant',
  'Previous Tab': 'Onglet précédent',
  'Zoom In': 'Zoom avant',
  'Zoom Out': 'Zoom arrière',
  'Reset Zoom': 'Zoom par défaut',
  'Reload Tab': "Recharger l'onglet",
  'Close Open Windows': 'Fermer les fenêtres ouvertes',
  'Ready for Fight': 'Prêt au combat',
  'End Turn': 'Fin du tour',
  'Spell 1': 'Sort 1',
  'Spell 2': 'Sort 2',
  'Spell 3': 'Sort 3',
  'Spell 4': 'Sort 4',
  'Spell 5': 'Sort 5',
  'Spell 6': 'Sort 6',
  'Spell 7': 'Sort 7',
  'Spell 8': 'Sort 8',
  'Tactical Mode': 'Mode tactique',
  'Creature Mode': 'Mode créature',
  'Transparent Mode': 'Mode transparent',
  'Highlight Interactives': 'Surbrillance des interactifs',
  'Map Coordinates': 'Coordonnées de la carte',
  'Player Names': 'Pseudos des joueurs',
  'Monster Group Info (hold)': 'Infos des groupes de monstres (maintien)',
  'Fullscreen': 'Plein écran',
  'Spell Animations': 'Animations de sorts',
  'Battle Grid': 'Grille de combat',
  'Inventory': 'Inventaire',
  'Characteristics': 'Caractéristiques',
  'Spells': 'Sorts',
  'World Map': 'Carte du monde',
  'Friends': 'Amis',
  'Game Options': 'Options du jeu',
  'Kolossium': 'Kolizéum',
  'Guild': 'Guilde',
  'Jobs': 'Métiers',
  'Quests': 'Quêtes',
  'Mount': 'Monture',

  // Barre de titre
  'New tab': 'Nouvel onglet',
  'Close this tab': 'Fermer cet onglet',
  'Minimize': 'Réduire',
  'Maximize': 'Agrandir',
  'Restore': 'Restaurer',
  'Close': 'Fermer',

  // Feuille des raccourcis
  'Keyboard shortcuts': 'Raccourcis clavier',
  'the game has none of its own': "le jeu n'en a aucun",
  'Every key here can be changed.': 'Toutes ces touches sont modifiables.',
  'Change shortcuts': 'Modifier les raccourcis',

  // Onglet Comptes
  'Saved accounts': 'Comptes enregistrés',
  'Saving an account keeps the Ankama device certificate of a session that is already signed in, so a linked tab reconnects on its own instead of asking for a new emailed code. Credentials are encrypted by your OS keychain and never leave this machine.':
    "Enregistrer un compte conserve le certificat d'appareil Ankama d'une session déjà connectée : l'onglet lié se reconnecte seul au lieu de redemander un code par mail. Les identifiants sont chiffrés par le trousseau de votre système et ne quittent jamais cette machine.",
  'No account saved yet.': 'Aucun compte enregistré.',
  'Account name': 'Nom du compte',
  'Linked to {name}': 'Lié à {name}',
  'Not linked to a tab': 'Lié à aucun onglet',
  ' — no stored credentials': ' — aucun identifiant enregistré',
  'Save': 'Enregistrer',
  'Rename': 'Renommer',
  'Unlink': 'Délier',
  'Use here': 'Utiliser ici',
  'Forget': 'Oublier',
  'Save the active tab': "Enregistrer l'onglet actif",
  'Save session': 'Enregistrer la session',
  'No game loaded in the active tab.': "Aucun jeu chargé dans l'onglet actif.",
  'The active tab is not signed in yet — log in first, then save.':
    "L'onglet actif n'est pas encore connecté — connectez-vous d'abord, puis enregistrez.",
  'Could not save: the OS refused to encrypt the credentials.':
    "Enregistrement impossible : le système a refusé de chiffrer les identifiants.",
  'Saved as "{label}" and linked to this tab.': 'Enregistré sous « {label} » et lié à cet onglet.',
  'Saved as "{label}", but no device certificate was found — Ankama may still email a code.':
    "Enregistré sous « {label} », mais aucun certificat d'appareil n'a été trouvé — Ankama peut encore envoyer un code par mail.",

  // Onglet Équipes
  'Active team': 'Équipe active',
  'Quick switch': 'Changement rapide',
  'Characters': 'Personnages',
  'Name': 'Nom',
  'Server': 'Serveur',
  'Account': 'Compte',
  'Remove': 'Retirer',
  'No characters added yet': 'Aucun personnage ajouté',
  'Team name': "Nom de l'équipe",
  'Create': 'Créer',
  'Active': 'Active',
  'Activate': 'Activer',
  'Duplicate': 'Dupliquer',
  'Delete': 'Supprimer',
  'Leader': 'Meneur',
  'Add member...': 'Ajouter un membre…',
  'No teams created yet': 'Aucune équipe créée',

  // Onglet À propos
  'Version': 'Version',
  'Platform': 'Système',
  'Engine': 'Moteur',

  // Écran de démarrage
  'Copying base files': 'Copie des fichiers de base',
  'Downloading manifests': 'Téléchargement des manifestes',
  'Downloading assets': 'Téléchargement des ressources',
  'Downloading game files': 'Téléchargement des fichiers du jeu',
  'Finding versions': 'Recherche des versions',
  'Applying patches': 'Application des correctifs',
  'Writing files': 'Écriture des fichiers',
  'Cleaning up': 'Nettoyage',
  'Saving manifests': 'Enregistrement des manifestes',
  'Done': 'Terminé',

  'Checking updates': 'Vérification des mises à jour',
  'Updating Nememu': 'Mise à jour de Nememu',
  'App update ready': "Mise à jour de l'application prête",
  'Update failed': 'Échec de la mise à jour',
  'Install failed': "Échec de l'installation",
  'Updating game': 'Mise à jour du jeu',
  'Installing game': 'Installation du jeu',
  'Checking the desktop app first, then game files.':
    "Vérification de l'application, puis des fichiers du jeu.",
  'Downloading the latest published release artifact.':
    'Téléchargement de la dernière version publiée.',
  'Restart Nememu to install the downloaded app update.':
    'Redémarrez Nememu pour installer la mise à jour téléchargée.',
  'The existing install can still be opened.': "L'installation existante reste utilisable.",
  'Retry the install.': "Relancez l'installation.",
  'Applying only the required file updates.': 'Application des seules mises à jour nécessaires.',
  'Downloading and patching the game files.': 'Téléchargement et correction des fichiers du jeu.',
  'Checking for updates...': 'Recherche de mises à jour…',
  'Preparing initial download...': 'Préparation du premier téléchargement…',
  'Checking for app update...': "Recherche d'une mise à jour de l'application…",
  'Downloading app update...': "Téléchargement de la mise à jour…",
  'App update ready.': 'Mise à jour prête.',
  'Waiting for updater...': 'En attente du programme de mise à jour…',
  'Preparing updater...': 'Préparation du programme de mise à jour…',
  'Download and install': 'Télécharger et installer',
  'Restart and Update': 'Redémarrer et mettre à jour',
  'Retry Update': 'Réessayer la mise à jour',
  'Retry Download': 'Réessayer le téléchargement',

  'App auto-update is enabled only in packaged builds.':
    "La mise à jour automatique n'existe que dans une version packagée.",
  'App update check failed.': "Échec de la recherche de mise à jour.",
  'App update download failed.': 'Échec du téléchargement de la mise à jour.',
  // Launcher
  'Play': 'Jouer',
  'Step {current} of {total}': 'Étape {current} sur {total}',
  'Ready to play': 'Prêt à jouer',
  'The game files are up to date.': 'Les fichiers du jeu sont à jour.',
  'The game files are still being prepared.': 'Les fichiers du jeu sont encore en préparation.',
  'Skip this screen next time': 'Passer cet écran au prochain lancement',
  'Unofficial Dofus Touch client': 'Client Dofus Touch non officiel',
  "What's new": 'Nouveautés',
  'No release notes for this version.': 'Pas de notes pour cette version.',

  'Nememu is up to date.': 'Nememu est à jour.',
  'No update available.': 'Aucune mise à jour disponible.',
  'Waiting to check for app updates.': 'En attente de la recherche de mise à jour.',
  'Copying base files...': 'Copie des fichiers de base…',
  'Downloading manifests...': 'Téléchargement des manifestes…',
  'Downloading assets...': 'Téléchargement des ressources…',
  'Downloading game files...': 'Téléchargement des fichiers du jeu…',
  'Finding versions...': 'Recherche des versions…',
  'Applying patches...': 'Application des correctifs…',
  'Writing files...': 'Écriture des fichiers…',
  'Cleaning up...': 'Nettoyage…',
  'Saving manifests...': 'Enregistrement des manifestes…',
  'This build does not update itself. Get new versions from whoever gave it to you.':
    "Cette version ne se met pas à jour toute seule. Demandez les nouvelles versions à la personne qui vous l'a donnée.",

  'Nememu {version} is available. Nothing is downloaded unless you ask.':
    'Nememu {version} est disponible. Rien ne se télécharge sans votre accord.',

  // Erreurs de démarrage, traduites en langage actionnable
  'Could not reach the Ankama servers.': "Impossible de joindre les serveurs d'Ankama.",
  'Check your internet connection, then try again. A VPN, a firewall or an antivirus can also block the download.':
    'Vérifiez votre connexion internet, puis réessayez. Un VPN, un pare-feu ou un antivirus peuvent aussi bloquer le téléchargement.',
  'Not enough free disk space.': 'Espace disque insuffisant.',
  'The game files need a few hundred megabytes. Free some space and try again.':
    'Les fichiers du jeu demandent quelques centaines de mégaoctets. Libérez de la place et réessayez.',
  'Windows refused access to a file.': "Windows a refusé l'accès à un fichier.",
  'An antivirus or a running copy of Nememu may be holding the game files. Close Nememu everywhere and try again.':
    "Un antivirus ou une copie de Nememu déjà ouverte retient peut-être les fichiers du jeu. Fermez Nememu partout et réessayez.",
  'A game file is in use by another program.': 'Un fichier du jeu est utilisé par un autre programme.',
  'Close any other running copy of Nememu and try again.':
    'Fermez toute autre copie de Nememu en cours et réessayez.',
  'The download failed.': 'Le téléchargement a échoué.',

  // Avertissement de port
  'Port {port} is taken by another program.': 'Le port {port} est occupé par un autre programme.',
  'Nememu fell back to port {port}, so the game starts from a different address each time and Ankama will email you a code at every launch. Close whatever is using port {preferred} and restart Nememu.':
    "Nememu s'est rabattu sur le port {port} : le jeu démarre donc d'une adresse différente à chaque fois, et Ankama vous enverra un code par mail à chaque lancement. Fermez le programme qui occupe le port {preferred}, puis relancez Nememu.",
  'Dismiss': 'Fermer',

  // Notifications système (toasts Windows) — les textes les plus vus du client
  'Private message from {name}': 'Message privé de {name}',
  'Unknown': 'Inconnu',
  'Party invitation': 'Invitation de groupe',
  '{name} invited you to a party.': '{name} vous invite dans son groupe.',
  'Tax collector attacked': 'Percepteur attaqué',
  'Kolossium fight ready': 'Combat Kolizéum prêt',
  'Aggression': 'Agression',
  'Your character is being attacked.': 'Votre personnage est attaqué.',
  'Item sold': 'Objet vendu',
  '+{kamas} kamas': '+{kamas} kamas',
  'quantity {quantity}': 'quantité {quantity}',
  'Trade request': "Demande d'échange",
  'Game notification': 'Notification du jeu',
  'Your turn': 'À vous de jouer',
  'Disconnected': 'Déconnecté',
  '{name} lost the connection to the server.': '{name} a perdu la connexion au serveur.',
  'The connection to the server was lost.': 'La connexion au serveur a été perdue.',
  'Disconnected — reload this tab to sign in again':
    'Déconnecté — rechargez cet onglet pour vous reconnecter',

  // Écran de jeu
  'Preparing the client': 'Préparation du client',
  'Loading game assets': 'Chargement des ressources du jeu',
  'Opening {name}. The game screen will appear as soon as the client finishes booting.':
    "Ouverture de {name}. L'écran de jeu apparaîtra dès que le client aura fini de démarrer.",
  'Starting Nememu': 'Démarrage de Nememu',
  'Loading the local game context and preparing the client shell.':
    "Chargement du contexte de jeu local et préparation de l'interface.",
  'Activity in this tab': 'Activité dans cet onglet',
  'Reload this tab': 'Recharger cet onglet'
}

const DICTIONARIES: Partial<Record<Language, Dict>> = { fr }

export type Translate = (text: string, vars?: Record<string, string | number>) => string

export function translate(
  language: Language,
  text: string,
  vars?: Record<string, string | number>
): string {
  let out = DICTIONARIES[language]?.[text] ?? text

  if (vars) {
    for (const [key, value] of Object.entries(vars)) {
      out = out.split(`{${key}}`).join(String(value))
    }
  }

  return out
}

/**
 * For code outside React — the notification matchers run on game events, not in
 * a render — so the language is read at call time rather than captured.
 */
export function tr(text: string, vars?: Record<string, string | number>): string {
  return translate(useSettingsStore.getState().language, text, vars)
}

/** Re-renders the caller when the language changes. */
export function useT(): Translate {
  const language = useSettingsStore((s) => s.language)
  return useCallback(
    (text: string, vars?: Record<string, string | number>) => translate(language, text, vars),
    [language]
  )
}

export const FRENCH_DICTIONARY = fr
