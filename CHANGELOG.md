# Journal des versions

Les versions suivent `MAJEUR.MINEUR.CORRECTIF` :

- **CORRECTIF** (0.2.**1**) — que des corrections, rien de nouveau à apprendre.
- **MINEUR** (0.**3**.0) — nouvelles fonctionnalités, réglages ou raccourcis.
- **MAJEUR** (**1**.0.0) — quelque chose change de comportement chez les joueurs
  qui ont déjà installé, ou une mise à jour demande une action de leur part.

Chaque entrée est écrite pour quelqu'un qui joue, pas pour quelqu'un qui lit le
code : ce qui change à l'écran, et ce qu'il faut faire s'il y a quelque chose à
faire.

## 0.2.1

### Corrigé

- **Le journal ne disait pas si la recherche de mise à jour avait eu lieu.**
  Seuls les échecs y laissaient une trace : une vérification qui aboutissait
  n'écrivait rien du tout. Impossible, à la lecture, de distinguer une
  vérification qui a tourné et n'a rien trouvé d'une vérification qui n'est
  jamais partie — c'est-à-dire impossible de répondre à « le bouton de mise à
  jour ne fait rien ». Les deux issues sont maintenant journalisées.

## 0.2.0

Première version sous le nom **Nememu**.

### Changé

- **L'application s'appelle Nememu.** Au premier lancement, le compte
  enregistré, les raccourcis remappés, la taille de fenêtre et le jeu déjà
  téléchargé sont déplacés automatiquement vers le nouveau dossier de données —
  y compris le certificat d'appareil d'Ankama, donc **pas de code par mail** à
  cause du changement de nom.
- **Nouvelle icône** : un œuf de Dofus marqué d'un N. Elle est dessinée en deux
  versions, une pour les grandes tailles et une plus lisible en 16-32 px, pour
  rester nette dans la barre des tâches.
- La marque apparaît à gauche de la barre de titre, et la version s'affiche au
  survol — c'est ce numéro qu'il faut donner en cas de problème.
- L'écran de premier lancement affiche la version au lieu d'une mention interne
  (« Install window ») qui n'aurait jamais dû être visible.

### Corrigé

- **L'icône de la fenêtre n'était pas embarquée dans l'installeur.** Le chemin
  pointait à l'intérieur de l'archive de l'application, où le fichier n'était
  pas copié. Sur Windows ça ne se voyait pas — l'exécutable porte l'icône
  compilée en dur — mais le regroupement dans la barre des tâches et la fenêtre
  de mise à jour retombaient sur l'icône par défaut d'Electron.
- La croix de fermeture d'un onglet ne s'éclaircissait pas toujours au survol :
  le pointeur atterrissait sur le tracé de l'icône, pas sur la zone stylée.
- Infobulles ajoutées sur les boutons qui n'en avaient pas : réglages, nouvel
  onglet, fermer l'onglet, réduire, agrandir, restaurer, fermer.

## 0.1.0

Première version distribuée (sous le nom DofEmu).

### Ajouté

- **Raccourcis clavier**, que le jeu tactile n'a pas : sorts 1-8, passer son
  tour, prêt au combat, changement d'onglet, fenêtres du jeu (sorts, quêtes,
  métiers, amis, guilde), ouverture du chat avec Entrée, changement de map aux
  flèches, compteur de FPS.
- **Feuille des raccourcis** ouverte au premier lancement puis accessible par
  l'icône clavier — elle affiche les touches réellement configurées, pas les
  touches par défaut.
- **Interface en français**, avec sélecteur de langue.
- **Compte enregistré** : le certificat d'appareil d'une session déjà connectée
  est conservé, chiffré par le trousseau de Windows, pour éviter le code par
  mail à chaque lancement.
- **Détection des déconnexions** : l'onglet est grisé, une pastille rouge
  apparaît et une notification système prévient.
- **Journal sur disque** dans le dossier de données, le lancement précédent
  conservé, plafonné à 2 Mo, répétitions repliées.

### Corrigé

- **Les chiffres du haut du clavier ne lançaient aucun sort en AZERTY** : la
  touche « 1 » y produit `&`. Les raccourcis chiffrés se lisent maintenant sur
  la touche physique.
- **Appuyer sur Espace hors combat faisait planter le client** : le raccourci
  « prêt au combat » envoyait le message au serveur sans vérifier qu'il y avait
  un combat.
- **Les mises à jour de l'application pointaient vers le dépôt d'origine.**
  Chaque copie distribuée était à un clic de se remplacer par un binaire non
  audité. Le flux est désactivé.
- **Le port local occupé était invisible** : le repli sur un autre port change
  l'adresse du jeu, donc perd le certificat d'appareil et ramène le code par
  mail. Un bandeau le dit maintenant, et nomme le port à libérer.
- Les erreurs de démarrage (« fetch failed », « ENOSPC »…) sont traduites en
  phrases actionnables, le texte brut conservé en dessous.
