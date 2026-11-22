# Fitouria

Prototype universitaire pour explorer l’extraction d’huile d’olive, la valorisation du grignon et l’instrumentation d’un moulin. Quatre pages **Accueil**, **Simulation**, **Capteurs IoT** et **Intelligence artificielle**.

## Démarrage local

Prérequis. Python 3.11 ou supérieur et Node.js 22.12 ou supérieur. Exécuter les commandes depuis la racine du projet.

Backend, dans un premier terminal PowerShell.

```powershell
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
.venv/Scripts/python.exe -m uvicorn backend.main:app --reload
```

Sur Linux ou macOS, remplacer `.venv/Scripts/python.exe` par `.venv/bin/python`.

Frontend, dans un second terminal.

```powershell
cd frontend
npm ci
npm run dev
```

Ouvrir [Fitouria](http://localhost:5173). Vite relaie les requêtes `/api` vers FastAPI sur le port 8000. La documentation interactive est accessible dans [Swagger UI](http://127.0.0.1:8000/docs). Pour une autre adresse de backend, définir `FITOURIA_API_TARGET` avant de lancer Vite.

## Démonstration

1. Dans **Simulation**, modifier la masse et le rendement, puis sélectionner **Calculer et animer**. Ouvrir **Prix et coûts** pour personnaliser les hypothèses. Chaque calcul valide crée un lot en SQLite et devient le scénario actif.
2. Dans **Capteurs IoT**, les **Mesures de laboratoire** présentent les résultats publiés par Abid et al. (2022) sur le biochar et les margines. **Wokwi / ESP32** affiche les relevés simulés reçus par MQTT. Le lot indiqué sur chaque relevé est celui qui était actif à sa réception.
3. Dans **Intelligence artificielle**, comparer les débouchés du lot actif avec des prix et des coûts de traitement distincts par filière. Le détecteur demande 31 relevés comparables. Les références de laboratoire ne constituent pas un historique pour le diagnostic.
4. Revenir à **Accueil** pour retrouver les ordres de grandeur du dernier scénario calculé.

Les données locales sont stockées dans `backend/fitouria.sqlite3`. `FITOURIA_DB` permet d’utiliser un autre fichier. Le prototype utilise un espace de travail partagé et se lance avec un processus API.

## Modèle matière et économique

Les préréglages tunisiens proposent Sfax et Kairouan pour le Chemlali, et Siliana pour le Chemcheli. Les couples région–variété correspondent à des provenances d’échantillons publiées. Les masses, rendements et filières présélectionnés servent à comparer trois scénarios pédagogiques modifiables. [Étude sur les variétés tunisiennes](https://pmc.ncbi.nlm.nih.gov/articles/PMC12044574/)

La simulation représente un moulin à deux phases simplifié, sans apport d’eau. La masse des olives se répartit en huile et en grignon humide. Le volume d’huile découle d’une densité de 0,915 kg/L. La fraction traitée du grignon fournit 40 % de granulés en masse. Le reste de cette fraction est compté comme eau retirée. Les prix, les coûts et le coefficient de granulés sont des hypothèses pédagogiques.

Trois filières sont disponibles. La granulation conserve 40 % de la masse humide sous forme de granulés. La pyrolyse transforme 30 % du grignon séché en biochar et le reste en gaz et condensats, sans revenu attribué à ces derniers. La co-digestion ajoute un cosubstrat dont la proportion et le coût sont réglables. Le mélange fournit 0,08 m³ de biogaz par kg, avec une densité de calcul de 1,2 kg/m³. Le reste est compté comme digestat. Ces coefficients sont des hypothèses de simulation.

Les recettes viennent de l’huile et du produit de valorisation sélectionné. La marge soustrait l’achat des olives, l’extraction, la valorisation et l’éventuel achat du cosubstrat. Le gain net de valorisation compare la marge obtenue à celle du même lot sans traitement du grignon. Les valeurs affichées sont en dinars tunisiens.

## MQTT et Wokwi

Le backend fonctionne immédiatement sans broker. Pour activer MQTT, configurer les variables ci-dessous avant le lancement de FastAPI. L’ESP32 et le backend doivent utiliser le même broker et le même sujet.

```powershell
$env:MQTT_HOST = "test.mosquitto.org"
$env:MQTT_PORT = "1883"
$env:MQTT_TOPIC = "fitouria/mon-groupe-unique/telemetry"
.venv/Scripts/python.exe -m uvicorn backend.main:app --reload
```

Le [projet Wokwi Zitori](https://wokwi.com/projects/481333689027006465) utilise les fichiers [sketch.ino](backend/wokwi/sketch.ino), [diagram.json](backend/wokwi/diagram.json) et [libraries.txt](backend/wokwi/libraries.txt). Démarrer la simulation, puis ouvrir **Capteurs IoT → Wokwi / ESP32**. Le moniteur série du sketch du dépôt affiche le broker, le sujet et le résultat de chaque publication. Le tableau de bord indique séparément la connexion MQTT et l’heure du dernier relevé. Pour Render, le Blueprint configure `broker.hivemq.com:1883` et `Zitori/Zitori/data`, les mêmes paramètres que le sketch. Le broker public sert aux données de démonstration.

Le message JSON attendu contient `device_id`, `temperature_c`, `humidity_pct` et `power_w`. Les messages invalides ou retenus sont ignorés. Le backend prend également en charge `MQTT_USER`, `MQTT_PASSWORD`, `MQTT_TLS=1` et `MQTT_CA_CERT` pour un broker authentifié compatible. Le sketch Wokwi fourni utilise MQTT en clair.

Le sketch historique du projet Django est également pris en charge. Pour l’utiliser, définir `MQTT_HOST=broker.hivemq.com` et `MQTT_TOPIC=Zitori/Zitori/data`. La page IoT affiche alors les valeurs `temp`, `moist`, `ph` et `bio` comme température du réacteur, humidité du grignon, pH de contrôle du biochar et phase de pyrolyse. Les champs non fournis par le sketch restent indisponibles.

## Comparaison et détection des écarts

Le comparateur applique le même bilan de simulation aux trois débouchés, classe les résultats par marge et calcule le prix de vente qui couvre les coûts de valorisation. Les prix et coûts sont paramétrables en dinars. Le comparateur utilise des hypothèses de scénario et ne reprend pas de prix de marché.

La détection non supervisée ajuste une mise à l’échelle robuste et un modèle de voisinage sur au moins 20 relevés historiques du même appareil et, en pyrolyse, de la même phase. Les dix mesures suivantes servent à calibrer le seuil de distance. La mesure la plus récente est évaluée à part. Les historiques simulés et MQTT sont indépendants. Un écart indique une mesure inhabituelle dans cet historique. La cause d’une panne et les seuils de sécurité relèvent des procédures de l’installation.

Photographie d’accueil par Ayssar Mahjoub. [Unsplash](https://unsplash.com/photos/a-bunch-of-olives-growing-on-a-tree-gokVa-6SzwU)

## Vérifications

```powershell
.venv/Scripts/python.exe -m pytest backend/tests
cd frontend
npm run build
```

Le frontend compilé se trouve dans `frontend/dist`. Pour l’essayer localement avec le backend déjà démarré, lancer `npm run preview`. Pour un hébergement séparé, configurer le proxy HTTP `/api` vers FastAPI et une réécriture vers `index.html` pour les routes React.

## Hébergement sur Render

Le `Dockerfile` compile React puis sert les quatre pages et l’API FastAPI sur une même URL HTTPS. Le Blueprint `render.yaml` crée le service de démonstration gratuit à partir de la branche React + FastAPI. Les données SQLite de développement et les variables d’environnement locales sont exclues de l’image.

Le service de démonstration partage ses scénarios et ses relevés entre les visiteurs. Son stockage SQLite est temporaire sur l’offre gratuite et peut être effacé au redémarrage ou au redéploiement. Pour un stockage durable, configurer un disque persistant sur une offre compatible, puis indiquer son chemin dans `FITOURIA_DB`. Configurer MQTT uniquement pour les capteurs de démonstration destinés à cet espace partagé. [Offre gratuite Render](https://render.com/docs/free) · [Disques persistants](https://render.com/docs/disks)
