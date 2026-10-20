# Lsan — anglais et darija

Application web installable pour apprendre l'anglais (objectif : 900 au TOEIC) et le darija de Casablanca (objectif : conversation courante), à raison d'une séance de 45 minutes par langue et par jour.

Le programme et les études sur lesquelles il s'appuie sont décrits dans le document « Programme Anglais & Darija ».

## Ce que fait l'app

- **Une séance guidée par jour et par langue**, en quatre étapes : réviser, leçon, écouter, parler. Une version courte de 20 minutes existe pour les jours chargés.
- **Révision espacée FSRS en rappel actif** : chaque mot existe dans les deux sens (reconnaître et produire). On tape ou on dit la réponse avant de la voir.
- **Une leçon par semaine**, ouverte le lundi : règle, mots, exercices, faux amis. Le dimanche, l'étape Leçon devient le bilan de la semaine ; les mots ratés reviennent en révision.
- **Oreille** : 12 écoutes par séance sur un son difficile pour un francophone, avec six voix en anglais. L'exercice s'arrête de lui-même après environ 7 heures, quand le gain plafonne.
- **Dialogue et shadowing**, **TOEIC partie 2** à partir de la semaine 2, **production** (avec enregistrement facultatif) puis **fluidité** en 4, 3 et 2 minutes.
- **Test de niveau** en anglais (30 questions, dont 6 d'écoute).
- **Progrès** : heures, série de jours, mots ancrés, estimation de la date d'atteinte de l'objectif, audios darija signalés.
- Fonctionne **hors connexion** une fois ouverte, et s'installe sur l'écran d'accueil.

La progression est enregistrée dans le navigateur de l'appareil. « Sauvegarder ma progression » (onglet Progrès) crée un fichier qui permet de la restaurer ailleurs.

## Installer sur le téléphone

- **iPhone** : ouvrir le lien dans Safari, bouton Partager, puis « Sur l'écran d'accueil ». Toujours ouvrir l'app depuis son icône ensuite.
- **Android** : ouvrir le lien dans Chrome, menu ⋮, puis « Installer l'application ».

## Ajouter des semaines

Le contenu est dans `content/en.json` et `content/dj.json`, une entrée par semaine (`weeks`). Chaque semaine contient :

| Champ | Contenu |
| --- | --- |
| `n`, `title` | Numéro et thème |
| `rule` | La règle : blocs `h` (titre), `p` (texte), `table` (lignes) |
| `items` | Les mots : `t` (mot), `fr`, `ex` et `exFr` (exemple), `alt` (variantes acceptées), et pour le darija `ar` (graphie arabe, lue par la voix) et `msa` (différence avec l'arabe standard) |
| `drills` | Exercices à trous : `q`, `a` (réponses acceptées), `fr` |
| `faux` | Faux amis (anglais) |
| `oreille` | `pairs` (paires de mots), `stress` (accent tonique) ou `letters` + `choices` (darija) |
| `dialogue` | Répliques `s` (A ou B), `t`, `fr`, et `ar` pour le darija |
| `toeic` | Questions de la partie 2 (facultatif) |
| `production` | Consigne et exemple de réponse |

**Ne change jamais le texte `t` d'un mot déjà publié** : la progression y est rattachée.

Après une modification, régénérer l'audio : `python3 tools/generate_audio.py` (prérequis en tête du script), puis publier.

## Audio

- Anglais : voix Kokoro (américaines et britanniques).
- Darija : voix arabe de synthèse qui lit la graphie arabe. Elle n'est pas native : signale les mots douteux dans l'app pour les faire vérifier.
