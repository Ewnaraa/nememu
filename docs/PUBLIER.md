# Publier une mise a jour

Ce que tes potes voient quand tu publies : au lancement suivant, leur Nememu
affiche « Nememu X.Y.Z est disponible » et un bouton. Rien ne se telecharge tant
qu'ils ne cliquent pas.

## En bref

```
1. package.json  -> monte "version"
2. CHANGELOG.md  -> ajoute une section "## X.Y.Z" tout en haut
3. git commit
4. npm run tag
```

C'est tout. `npm run tag` verifie, pose le tag et le pousse ; GitHub construit
et publie la release tout seul. Tu suis l'avancement sur l'onglet **Actions** du
depot.

> Les commandes ci-dessous utilisent `npm`, qui est deja installe sur ta
> machine. Si tu installes un jour pnpm (le gestionnaire du projet), `pnpm run
> tag` fait exactement la meme chose.

## 1. Preparer la version

Le numero suit `MAJEUR.MINEUR.CORRECTIF` :

| Tu as... | Nouvelle version |
|---|---|
| corrige des bugs, rien de nouveau | `0.3.**1**` |
| ajoute une fonctionnalite, un reglage, un raccourci | `0.**4**.0` |
| change quelque chose qui casse les habitudes | `**1**.0.0` |

La section du CHANGELOG n'est pas decorative : elle est lue a la compilation et
finit **a deux endroits** — le panneau « Nouveautes » du launcher, et le corps
de la release GitHub. Une seule source, deux destinations. Si elle manque,
`npm run tag` refuse de partir.

## 2. Lancer la release

```
npm run tag
```

Avant de pousser quoi que ce soit, il refuse :

- si des modifications ne sont pas commitees — la release est construite depuis
  le **commit**, donc tout ce qui traine dans ton dossier serait absent du
  binaire sans que rien ne le dise ;
- s'il n'y a pas de section `## X.Y.Z` dans le CHANGELOG ;
- si le tag existe deja — une version publiee ne se remplace pas, on monte le
  numero.

Puis il pousse la branche, pose le tag `vX.Y.Z` et le pousse. C'est le tag qui
declenche tout.

## 3. Ce que fait GitHub a ta place

Voir `.github/workflows/release.yml`. Sur une machine Windows vierge :
installation, verification que le tag correspond a `package.json`, typecheck,
tests, build, packaging, puis creation de la release avec `NOTES.md` en
description et les **trois** fichiers attaches.

Trois raisons de faire ca la-bas plutot que sur ton PC :

- **Ca construit ce qui est commite.** Un build local emballe ton dossier de
  travail : une modif oubliee part chez tout le monde et le depot ne decrit
  plus le binaire que les gens font tourner. C'est arrive a la 0.3.0.
- **Aucun jeton a garder.** Le jeton de la CI est cree pour ce run et meurt
  avec lui. Rien de permanent ne traine sur ta machine.
- **Ca ne peut pas oublier `latest.yml`.** Toujours les memes lignes, toujours
  les trois memes fichiers.

Si un run echoue, rien n'est publie : tu corriges, tu supprimes le tag
(`git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z`) et tu relances.

## Verifier que ca a marche

Relance Nememu. Comme ta machine est deja sur la derniere version, le journal
(`%APPDATA%\Nememu\nememu.log`) doit dire :

```
[INFO] Update check: nothing newer than X.Y.Z (latest published: X.Y.Z).
```

Les deux numeros identiques = l'app a bien lu ta release. S'il y a un 404, la
release n'est pas publique ou le tag ne correspond pas.

## Les deux facons de rater une release

Le workflow les empeche toutes les deux. C'est ecrit ici parce que si tu publies
un jour a la main, ce sont les seules choses qui comptent — et elles echouent
**en silence** : la release a l'air correcte, personne ne recoit rien, et rien
n'apparait dans aucun journal.

- **`latest.yml` oublie.** C'est le seul fichier que lit le systeme de mise a
  jour. Sans lui, les copies deja installees ne voient rien : le bouton ne
  trouve rien, et l'annonce comme s'il n'y avait rien a trouver.
- **Le nom de l'installeur a change.** `latest.yml` nomme le fichier qu'il
  attend, au caractere pres. GitHub reecrit les espaces des noms televerses
  (`A B.exe` devient `A.B.exe`), c'est pour ca que l'installeur s'appelle
  `Nememu-Setup-X.Y.Z.exe` sans espace. Ne le renomme pas.

## Publier a la main, en depannage

Si la CI est cassee ou indisponible :

```
npm test && npm run typecheck && npm run dist
```

puis `github.com/Ewnaraa/nememu/releases/new` : tag `vX.Y.Z`, titre
`Nememu X.Y.Z`, colle `release/NOTES.md` en description, et joins
`Nememu-Setup-X.Y.Z.exe`, son `.blockmap` et `latest.yml`.
