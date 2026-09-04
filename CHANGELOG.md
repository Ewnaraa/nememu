# Journal des versions

Numéros : `MAJEUR.MINEUR.CORRECTIF` — correctif = des bugs corrigés, mineur =
du nouveau, majeur = tes habitudes changent.

**Ce qui a le droit d'être ici** : ce qu'un joueur peut faire, voit à l'écran,
ou doit faire de son côté. Une correction de bug qu'il a pu rencontrer. Rien
d'autre.

**Ce qui n'y a pas sa place** : le travail interne. Refactorisations, tests,
outillage, chaîne de publication, choix de polices ou de dépendances — même
quand c'est du vrai travail, ça ne change rien pour celui qui joue, et ça noie
les lignes qui comptent. Ça vit dans les commits.

Une ligne par entrée. Ce qui change, pas pourquoi c'était cassé. Si une version
n'apporte rien de visible, on l'écrit en une phrase plutôt que de la remplir.

## 0.3.6

### Changé

- **La mise à jour s'installe sans fenêtre d'installateur.** Plus d'écran gris
  « en cours d'installation » par-dessus le launcher : Nememu se ferme et rouvre
  tout seul sur la nouvelle version.

### Corrigé

- **Le téléchargement d'une mise à jour ne s'affichait nulle part** : la barre
  du launcher ne bougeait pas tant que l'installateur ne prenait pas l'écran.
  Elle avance maintenant, avec le pourcentage.
- Une mise à jour qui échoue rend la main au launcher au lieu de le laisser sur
  une barre de progression morte.

## 0.3.5

### Corrigé

- **Aucune mise à jour de Nememu ne pouvait s'installer si « lancer le jeu
  automatiquement » était coché** : le launcher filait dans le jeu avant d'avoir
  pu la proposer. Il attend maintenant ta réponse quand une version est
  disponible, et le dit à l'écran.

## 0.3.4

### Changé

- **Le launcher reste ouvert.** Il se réduit dans la barre des tâches quand le
  jeu démarre, au lieu de disparaître : un clic dessus et il revient.
- Le logo Nememu, en haut à gauche de la fenêtre de jeu, rouvre le launcher.
- Fermer le jeu ramène au launcher au lieu de quitter Nememu.

### Corrigé

- **« Lancer le jeu automatiquement » ne pouvait plus être décoché** : la case
  ne vivait que sur l'écran qu'elle faisait disparaître. Elle est maintenant
  aussi dans Réglages > Démarrage.
- La version affichée dans Réglages > À propos était restée bloquée sur 0.1.0.

## 0.3.3

### Corrigé

- **Toute l'interface s'affichait en Times New Roman.** Elle utilise maintenant
  la police de Windows, partout et à l'identique d'une machine à l'autre.
- Les animations du launcher ne marchaient qu'à moitié : le bouton Jouer ne
  s'allumait pas et les changements d'état sautaient au lieu de glisser.

## 0.3.2

### Changé

- Le launcher est plus vivant : le fond dérive lentement et le contenu se met en
  place à l'ouverture.

## 0.3.1

À installer si tu es en 0.3.0.

### Corrigé

- Le launcher pouvait rester bloqué sur « Vérification des mises à jour », le
  bouton Jouer grisé pour de bon.
- Le client repartait parfois en anglais, avec les raccourcis d'origine.

## 0.3.0

### Ajouté

- **Un launcher.** À la place du bandeau qui se refermait tout seul : l'état du
  téléchargement, les nouveautés de la version, et un bouton Jouer.
- Case « Passer cet écran au prochain lancement », si le clic t'agace.
- Les réglages sont accessibles depuis le launcher, sans démarrer le jeu.

## 0.2.0

Première version sous le nom **Nememu**.

### Changé

- **L'application s'appelle Nememu.** Ton compte, tes raccourcis, ta fenêtre et
  le jeu déjà téléchargé sont déplacés automatiquement — pas de code par mail à
  cause du changement de nom.
- **Nouvelle icône** : un œuf de Dofus marqué d'un N.

## 0.1.0

Première version distribuée (sous le nom DofEmu).

### Ajouté

- **Raccourcis clavier**, que le jeu tactile n'a pas : sorts 1-8, passer son
  tour, prêt au combat, changement d'onglet, fenêtres du jeu, chat avec Entrée,
  changement de map aux flèches, compteur de FPS.
- **Feuille des raccourcis** au premier lancement, puis via l'icône clavier.
- **Interface en français.**
- **Compte enregistré** : plus de code par mail à chaque lancement.
- **Détection des déconnexions** : onglet grisé, pastille rouge, notification.

### Corrigé

- **Les chiffres du haut du clavier ne lançaient aucun sort en AZERTY.**
- **Espace hors combat faisait planter le client.**
- Le port local occupé faisait revenir le code par mail sans rien expliquer. Un
  bandeau le signale maintenant et nomme le programme à fermer.
- Les erreurs de démarrage disent quoi faire au lieu d'afficher un message
  technique.
