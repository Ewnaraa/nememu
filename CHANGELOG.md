# Journal des versions

Numéros : `MAJEUR.MINEUR.CORRECTIF` — correctif = des bugs corrigés, mineur =
du nouveau, majeur = tes habitudes changent.

**Comment écrire une entrée** : une ligne, deux au maximum. Ce qui change à
l'écran, pas pourquoi c'était cassé. Le « pourquoi » vit dans les commits ; ici
on écrit pour quelqu'un qui veut juste savoir s'il doit mettre à jour. Ce
fichier est affiché tel quel dans le launcher : ce qui est long n'y est pas lu.

## 0.3.1

À installer si tu es en 0.3.0.

### Corrigé

- Le launcher pouvait rester bloqué sur « Vérification des mises à jour », bouton
  Jouer grisé pour de bon.
- Il attend au maximum 8 secondes la vérification de mise à jour, puis lance le
  téléchargement du jeu sans elle.
- Le launcher n'écrivait rien dans le journal. C'était le seul écran sur lequel
  on peut rester coincé, et le seul dont on n'avait aucune trace.
- Si les réglages ne se chargeaient pas, le client repartait en anglais sans
  rien dire.

## 0.3.0

### Ajouté

- **Un launcher.** À la place du bandeau qui se refermait tout seul : l'état du
  téléchargement, les nouveautés, et un bouton Jouer.
- Les nouveautés de la version s'affichent dans le launcher.
- Case « Passer cet écran au prochain lancement », si le clic t'agace.
- Les réglages sont accessibles depuis le launcher, sans démarrer le jeu.

### Changé

- Le client utilise la police du système, la même pour tout le monde.
- Fini le Courier New dans les onglets et les numéros de version.

## 0.2.1

### Corrigé

- Le journal ne disait pas si la recherche de mise à jour avait eu lieu.

## 0.2.0

Première version sous le nom **Nememu**.

### Changé

- **L'application s'appelle Nememu.** Ton compte, tes raccourcis, ta fenêtre et
  le jeu déjà téléchargé sont déplacés automatiquement — pas de code par mail à
  cause du changement de nom.
- **Nouvelle icône** : un œuf de Dofus marqué d'un N.
- La marque apparaît dans la barre de titre, la version s'affiche au survol.

### Corrigé

- L'icône de la fenêtre n'était pas embarquée dans l'installeur.
- La croix de fermeture d'un onglet ne s'éclaircissait pas toujours au survol.
- Infobulles ajoutées sur les boutons qui n'en avaient pas.

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
- **Journal sur disque**, pour pouvoir diagnostiquer un problème.

### Corrigé

- **Les chiffres du haut du clavier ne lançaient aucun sort en AZERTY.**
- **Espace hors combat faisait planter le client.**
- Les mises à jour pointaient vers le dépôt d'origine : chaque copie était à un
  clic de se remplacer par un binaire non audité.
- Le port local occupé était invisible, alors qu'il fait revenir le code par
  mail. Un bandeau le signale et nomme le port à libérer.
- Les erreurs de démarrage sont traduites en phrases actionnables.
