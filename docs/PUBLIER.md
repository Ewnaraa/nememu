# Publier une mise a jour

Ce que tes potes voient quand tu publies : au lancement suivant, leur Nememu
affiche « Nememu X.Y.Z est disponible » et un bouton. Rien ne se telecharge tant
qu'ils ne cliquent pas.

## 1. Preparer la version

Deux fichiers a toucher, dans cet ordre :

- `package.json` -> `version`
- `CHANGELOG.md` -> une nouvelle section `## X.Y.Z` tout en haut

Le numero suit `MAJEUR.MINEUR.CORRECTIF` :

| Tu as... | Nouvelle version |
|---|---|
| corrige des bugs, rien de nouveau | `0.3.**1**` |
| ajoute une fonctionnalite, un reglage, un raccourci | `0.**4**.0` |
| change quelque chose qui casse les habitudes | `**1**.0.0` |

La section du CHANGELOG n'est pas decorative : elle est lue a la compilation et
finit **a deux endroits** — dans le launcher (panneau « Nouveautes ») et dans le
corps de la release GitHub. Si elle manque, le build te previent et les deux
sont vides.

## 2. Verifier et construire

```
pnpm test
pnpm run typecheck
pnpm run dist
```

`pnpm run dist` ecrit dans `release/` et affiche a la fin l'empreinte SHA256 et
la liste exacte des fichiers a joindre. Il te previent aussi si `latest.yml`
manque.

## 3. Publier

### Le plus simple, une fois configure

```
pnpm run release
```

Construit, packge, **et televerse tout seul** dans une release GitHub en
brouillon. Il ne te reste qu'a ouvrir la release sur GitHub, coller
`release/NOTES.md` en description, et cliquer sur *Publish release*.

Ca demande un jeton GitHub, une seule fois (voir plus bas).

### A la main, sans jeton

1. Pousser le code : `git push` (et `git push --tags` si tu as pose un tag).
2. `github.com/Ewnaraa/nememu/releases/new`
3. *Choose a tag* -> tape `vX.Y.Z` -> **Create new tag on publish**
4. Titre : `Nememu X.Y.Z`
5. Description : colle le contenu de `release/NOTES.md`
6. Joins **les trois** fichiers :
   - `Nememu-Setup-X.Y.Z.exe`
   - `Nememu-Setup-X.Y.Z.exe.blockmap`
   - `latest.yml`
7. *Publish release*

## Les deux facons de rater une release

Elles echouent toutes les deux **en silence** : la release a l'air correcte,
personne ne recoit rien, et rien n'apparait dans aucun journal.

- **`latest.yml` oublie.** C'est le seul fichier que lit le systeme de mise a
  jour. Sans lui, les copies deja installees ne voient rien : le bouton ne
  trouve rien, et l'annonce comme s'il n'y avait rien a trouver.
- **Le nom de l'installeur a change.** `latest.yml` nomme le fichier qu'il
  attend, au caractere pres. GitHub reecrit les espaces des noms televerses
  (`A B.exe` devient `A.B.exe`), c'est pour ca que l'installeur s'appelle
  `Nememu-Setup-X.Y.Z.exe` sans espace. Ne le renomme pas a la main.

## Verifier que ca a marche

Relance Nememu. Comme ta machine est deja sur la derniere version, le journal
(`%APPDATA%\Nememu\nememu.log`) doit dire :

```
[INFO] Update check: nothing newer than X.Y.Z (latest published: X.Y.Z).
```

Les deux numeros identiques = l'app a bien lu ta release. S'il y a un 404, la
release n'est pas publique ou le tag ne correspond pas.

## Le jeton GitHub, une seule fois

`pnpm run release` a besoin d'un jeton pour televerser a ta place.

1. `github.com/settings/tokens` -> *Generate new token (classic)*
2. Coche uniquement **`repo`**, mets une expiration longue
3. Copie le jeton (il ne sera plus jamais affiche)
4. Dans PowerShell, pour l'enregistrer une bonne fois :

   ```powershell
   [Environment]::SetEnvironmentVariable('GH_TOKEN', 'colle_le_jeton_ici', 'User')
   ```

   Ferme et rouvre ton terminal pour qu'il le voie.

Un jeton donne acces en ecriture a tes depots : ne le colle nulle part
d'autre, et ne le commite jamais. Si tu penses l'avoir expose, revoque-le sur
la meme page et refais-en un.
