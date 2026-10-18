# Party Camera

Een wegwerpcamera als webapp, voor je feest. Gasten scannen een QR-code, melden zich aan met hun naam en krijgen een **rolletje** (standaard 50 foto's). Ze fotograferen met een live zoeker, maar zien hun foto's pas bij de **Reveal**. Daarna gaat de **galerij** open: foto's bekijken (eventueel met watermark), downloaden en delen.

Jij (de host) beheert alles via `/admin`: overzicht en moderatie, instellingen, watermark, downloads (zip) en QR-codes met printbare kaartjes.

Techniek: Next.js op **Vercel**, met **Supabase** als database en privé-opslag voor de foto's.

> Deze handleiding is geschreven voor iemand die geen ontwikkelaar is. Reken op ongeveer 30 minuten. De knoppen in Supabase en Vercel kunnen er net iets anders uitzien of heten dan hier beschreven, want die websites veranderen geregeld. Zoek dan naar een knop met een gelijkaardige naam.

## Inhoud

1. [Wat heb je nodig?](#1-wat-heb-je-nodig)
2. [Supabase opzetten](#2-supabase-opzetten)
3. [Lokaal draaien en testen](#3-lokaal-draaien-en-testen)
4. [Online zetten op Vercel](#4-online-zetten-op-vercel)
5. [De admin gebruiken](#5-de-admin-gebruiken)
6. [Opslag en kosten](#6-opslag-en-kosten)
7. [Checklist vóór het feest](#7-checklist-vóór-het-feest)
8. [Na het feest](#8-na-het-feest)
9. [Problemen oplossen](#9-problemen-oplossen)
10. [Alle omgevingsvariabelen](#10-alle-omgevingsvariabelen)

---

## 1. Wat heb je nodig?

- Een (gratis) account op [supabase.com](https://supabase.com) en op [vercel.com](https://vercel.com). Log op Vercel het makkelijkst in met je GitHub-account.
- De code op GitHub: `arnealb/halloween-foto-app`.
- Op je computer: [Node.js](https://nodejs.org) versie 24 (LTS), of minstens 22.9, en Git. Controleer in de Terminal:

  ```bash
  node --version
  git --version
  ```

- De code op je computer (sla over als je die al hebt):

  ```bash
  git clone https://github.com/arnealb/halloween-foto-app.git
  cd halloween-foto-app
  npm install
  ```

  Is de repository privé, dan vraagt `git clone` om in te loggen bij GitHub (of gebruik [GitHub Desktop](https://desktop.github.com)). Vercel heeft dan ook toegang nodig: die geef je bij het importeren (zie 4.1).

---

## 2. Supabase opzetten

### 2.1 Project aanmaken

1. Ga naar [supabase.com/dashboard](https://supabase.com/dashboard) en klik op **New project**.
2. Geef het een naam (bv. `party-camera`).
3. **Database password**: klik op *Generate a password* en **bewaar het meteen** (bv. in je wachtwoordbeheerder). Je hebt het straks nodig.
   Tip: een wachtwoord met alleen letters en cijfers is het makkelijkst (zie 2.3).
4. **Region**: kies een regio dicht bij België: **West EU (Ireland)**, dat is `eu-west-1`. Vercel draait de app in Dublin (`dub1`), vlak bij die database. Dat is de makkelijkste keuze: dan hoef je niets aan te passen. Kies je toch een andere regio, dan moet je `vercel.json` aanpassen (zie 4.4).
5. Klik op **Create new project** en wacht een paar minuten.

### 2.2 URL en geheime sleutel ophalen

1. Ga in je project naar **Project Settings** (tandwiel linksonder) → **Data API** (of **API**). Kopieer de **Project URL**, bv. `https://abcdefgh.supabase.co`. Dat wordt `SUPABASE_URL`.
2. Ga naar **Project Settings** → **API Keys**. Kopieer een **Secret key** (begint met `sb_secret_...`). Zie je alleen de oudere sleutels, neem dan de **service_role**-key (niet de `anon`-key!). Dat wordt `SUPABASE_SERVICE_ROLE_KEY`.

> De secret key geeft volledige toegang tot je database en alle foto's. Deel hem met niemand en zet hem nooit in git.

### 2.3 De verbindingsstring voor de migratie

1. Klik bovenaan in je project op de knop **Connect**.
2. Kies het tabblad of type **Session pooler** (niet "Direct connection" en niet "Transaction pooler") en kopieer de **URI**. Die ziet er zo uit:

   ```
   postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:5432/postgres
   ```

   - `postgres.abcdefgh` is je gebruikersnaam (met je project-ref erin).
   - `[YOUR-PASSWORD]` vervang je door je databasewachtwoord (zonder de vierkante haken).
   - Het stuk `aws-0-eu-west-1...` kan bij jou net anders zijn (bv. `aws-1-...`). Neem gewoon over wat Supabase toont.
   - Poort `5432` hoort bij de session pooler.

3. **Speciale tekens in het wachtwoord** (zoals `@ # / : ? %`) moet je *URL-encoderen*, anders snapt de verbinding het niet. Laat Node dat voor je doen:

   ```bash
   node -e 'console.log(encodeURIComponent(process.argv[1]))' 'plak-hier-je-wachtwoord'
   ```

   Gebruik de uitvoer in de URI. Bijvoorbeeld `ab@c#1` wordt `ab%40c%231`.
   Wachtwoord kwijt? Je kunt een nieuw instellen bij **Project Settings** → **Database** → **Reset database password**.

Dit wordt `SUPABASE_DB_URL`. Die heb je alleen nodig om de migratie te draaien, niet op Vercel.

### 2.4 Het `.env`-bestand invullen

Maak in de projectmap een kopie van het voorbeeld:

```bash
cp .env.example .env
```

Open `.env` in een teksteditor en vul alles in. Elke regel heeft er uitleg bij. Een sterke `SESSION_SECRET` en een sterk `ADMIN_PASSWORD` maak je zo:

```bash
openssl rand -base64 32   # voor SESSION_SECRET
openssl rand -base64 18   # voor ADMIN_PASSWORD (of kies een lange zin die je kunt onthouden)
```

Zet voorlopig `PUBLIC_BASE_URL=http://localhost:3000`. Na de deploy pas je die aan (zie stap 4).

> `.env` staat in `.gitignore` en komt dus nooit op GitHub. Hou dat zo.

### 2.5 De database klaarzetten (migratie)

```bash
npm run db:migrate
```

Dat voert alle bestanden uit `supabase/migrations/` uit, op volgorde en elk precies één keer. Je mag het commando gerust opnieuw draaien: wat al gedaan is, wordt overgeslagen. Zo controleer je wat er al is toegepast:

```bash
npm run db:migrate -- --status
```

Wat de migratie aanmaakt:

- **Tabellen**: `guests` (gasten en hoeveel foto's ze al namen), `photos` (één rij per foto), `shot_reservations` (zorgt dat een upload die opnieuw geprobeerd wordt niet dubbel telt), `event_settings` (één rij met de instellingen van je feest). Row Level Security staat overal aan: alleen de server (met de secret key) kan erbij.
- **Functies**: onder meer `reserve_shot`, `release_shot` en `record_shot` (een foto nemen zonder over de limiet van het rolletje te gaan), `list_guests_with_photo_counts` (het overzicht in de admin) en `update_event_settings` (instellingen veilig bewaren).
- De tabel `schema_migrations` maakt het migratiescript zelf aan (niet een migratiebestand): zo weet het welke migraties al gedaan zijn.
- **Opslag**: een **privé** bucket `party-camera`. Alle foto's gaan via de app, er zijn geen publieke links. Daarin komen de mappen `originals/` (de originele foto's), `derived/` (kleine versies en watermark-versies voor de galerij) en `watermark/` (je logo).

Controleer gerust in Supabase: **Table Editor** toont de tabellen, **Storage** de bucket `party-camera`.

---

## 3. Lokaal draaien en testen

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (aanmelden als gast) en [http://localhost:3000/admin](http://localhost:3000/admin) (de admin, wachtwoord = `ADMIN_PASSWORD`). Stoppen doe je met `Ctrl+C`.

> Lokaal test je het best op je computer zelf. Op een telefoon werkt de camera alleen via `https`, dus test met telefoons op de Vercel-versie.

Controles (doe ze vóór je iets online zet):

```bash
npm test           # de automatische tests (hebben geen Supabase nodig)
npm run lint       # controleert de code op fouten en stijl
npx tsc --noEmit   # controleert de TypeScript-types
npm run build      # bouwt de app zoals Vercel dat doet
```

---

## 4. Online zetten op Vercel

### 4.1 Project importeren

1. Ga naar [vercel.com/new](https://vercel.com/new).
2. Bij **Import Git Repository** kies je `arnealb/halloween-foto-app` (staat hij er niet bij, of is hij privé? Klik dan op de link om de Vercel-app op GitHub te configureren en geef die toegang tot deze repository) en klik op **Import**.
3. **Framework Preset**: **Next.js** (wordt normaal automatisch herkend). Laat *Root Directory*, *Build Command* en *Output Directory* op de standaardwaarden staan.

### 4.2 Omgevingsvariabelen

Klap op hetzelfde scherm **Environment Variables** open en voeg deze toe (de waarden uit je `.env`):

| Naam | Geheim? | Opmerking |
| --- | --- | --- |
| `SUPABASE_URL` | nee | |
| `SUPABASE_SERVICE_ROLE_KEY` | **ja** | |
| `ADMIN_PASSWORD` | **ja** | sterk wachtwoord |
| `SESSION_SECRET` | **ja** | minstens 32 tekens |
| `PUBLIC_BASE_URL` | nee | eerst een gok, zie 4.3 |

`SUPABASE_DB_URL` en `SUPABASE_DB_PASSWORD` zijn **niet** nodig op Vercel.

Belangrijk:

- Zorg dat de variabelen gelden voor **Production** (later kun je dat nakijken bij **Settings** → **Environment Variables**). Vink ook *Preview* aan als je preview-deploys wilt laten werken.
- Vercel gebruikt deze variabelen ook tijdens het **bouwen** (build). Dat is nodig: bij het bouwen leest de app de feestnaam uit de database (voor de paginatitel en het label op het beginscherm). Ontbreken de Supabase-variabelen, dan lukt de build wel, maar werkt de app niet (Vercel gebruikt dezelfde variabelen tijdens het draaien). Voeg ze dan toe en **redeploy** (zie hieronder). Zijn ze wél ingevuld maar fout (verkeerde sleutel), dan mislukt de build met `getSettings failed`.
- Wijzig je later een variabele, dan geldt die pas na een **nieuwe deploy**: ga naar **Deployments**, klik op de drie puntjes bij de bovenste en kies **Redeploy**.

Klik op **Deploy** en wacht tot het klaar is.

### 4.3 `PUBLIC_BASE_URL` juist zetten

De QR-codes wijzen naar `PUBLIC_BASE_URL`. Dat moet het **vaste productie-adres** zijn.

1. Ga na de deploy naar je project → **Settings** → **Domains**. Daar staat je productie-domein, bv. `halloween-foto-app.vercel.app`. Gebruik **niet** het lange adres met een willekeurige code erin (zoals `halloween-foto-app-abc123-arnealb.vercel.app`): dat hoort bij één specifieke deploy.
2. Zet bij **Settings** → **Environment Variables** `PUBLIC_BASE_URL` op `https://halloween-foto-app.vercel.app` (met `https://`, zonder `/` of pad erachter).
3. **Redeploy** (zie hierboven).
4. Open `/admin/qr`. Is de URL fout (localhost, geen https, ontbreekt), dan zie je daar een rode waarschuwing "Niet afdrukken".

Eigen domein (optioneel): voeg het toe bij **Settings** → **Domains**, volg de DNS-instructies van Vercel, en zet daarna `PUBLIC_BASE_URL` op dat domein en redeploy.

### 4.4 Functieregio, Fluid compute en beveiliging

- **Regio**: het bestand `vercel.json` in de repo zet de server-functies in **Dublin** (`dub1`), dicht bij de Supabase-database in Ierland. Controleer bij **Settings** → **Functions** dat de regio Dublin is. Staat je database in een andere regio, pas dan `"regions"` in `vercel.json` aan naar de dichtstbijzijnde Vercel-regio (bv. `fra1` voor Frankfurt / `eu-central-1`). Alleen het bestand op je computer aanpassen is niet genoeg: zet de wijziging ook op GitHub, dan deployt Vercel vanzelf opnieuw:

  ```bash
  git commit -am "Vercel-regio aanpassen"
  git push
  ```

  Makkelijker: kies bij Supabase gewoon West EU (Ireland), dan klopt `dub1` al.
- **Fluid compute**: de zip-downloads mogen tot 5 minuten lopen (`maxDuration = 300`). Daarvoor moet **Fluid Compute** aan staan. Op nieuwe projecten staat het standaard aan; controleer het bij **Settings** → **Functions** → **Fluid Compute**.
- **Deployment Protection**: gasten mogen geen Vercel-login te zien krijgen. Ga naar **Settings** → **Deployment Protection**. De productie-URL mag niet beschermd zijn: kies niets strenger dan *Standard Protection* (die beschermt alleen previews en de lange deploy-adressen). Test: open je productie-URL in een privévenster op je telefoon. Zie je een Vercel-inlogscherm, dan staat de bescherming te streng.

### 4.5 Eerste test online

Doorloop op je telefoon de hele flow: aanmelden → een paar foto's nemen → in de admin kijken of ze er zijn → bij **Instellingen** op **Nu onthullen** → galerij bekijken → bij **Downloads** een zip ophalen. Verwijder daarna je testgasten (zie de checklist).

---

## 5. De admin gebruiken

Ga naar `https://jouw-adres/admin` (je wordt naar `/admin/login` gestuurd) en log in met `ADMIN_PASSWORD`. Je blijft 30 dagen ingelogd op dat toestel.

| Onderdeel | Wat kun je er doen? |
| --- | --- |
| **Overzicht** | Gasten met hun aantal foto's, gasten hernoemen, stand van de Reveal. |
| **Foto's** | Alle foto's bekijken, **verbergen** (niet in de galerij) of **verwijderen** (ook uit de opslag). |
| **Instellingen** | Feestnaam, welkomsttekst, accentkleur, foto's per gast; fotograferen open/dicht (**Fotograferen sluiten**); het Reveal-moment en de knoppen **Automatisch** / **Nu onthullen** / **Verborgen houden**. |
| **Watermark** | Tekst en/of logo, positie, grootte, doorzichtigheid, met voorbeeld. Daarna **Galerij voorbereiden** zodat alle watermark-versies vooraf klaarstaan. |
| **Downloads** | Alle foto's als zip (originelen of met watermark), bij veel foto's in **delen**, of per gast. |
| **QR-code** | De QR-code als PNG of SVG, en een pagina met **kaartjes** om te printen (`/admin/kaartjes`). |

Voor gasten: `/` is aanmelden, `/camera` de camera en `/galerij` de galerij (vóór de Reveal toont die een aftelling).

---

## 6. Opslag en kosten

Een ruwe schatting voor **50 gasten × 50 foto's = 2.500 foto's**:

| Wat | Per foto | Totaal |
| --- | --- | --- |
| Originelen (max. 2560 px, JPEG) | ~1–1,5 MB | ~2,5–3,75 GB |
| Kleine versie + galerijversie | ~0,3–0,4 MB | ~0,8–1 GB |
| Extra set na watermark wijzigen + "Galerij voorbereiden" | ~0,3–0,4 MB | ~0,8–1 GB per keer |

**Reken op ongeveer 4–5 GB.**

De **gratis Supabase-tier** heeft (op het moment van schrijven) **1 GB opslag** en een beperkt dataverkeer (egress) per maand. Elke keer dat iemand de galerij bekijkt of een zip downloadt, telt mee voor het dataverkeer: alleen al alle originelen één keer downloaden is enkele GB. Daarnaast worden gratis projecten na ongeveer een week zonder activiteit **gepauzeerd**. Prijzen en limieten veranderen: kijk de actuele cijfers na op [supabase.com/pricing](https://supabase.com/pricing).

Opties:

1. **Aanrader**: neem het **Pro-plan** voor de maand van het feest (ruim voldoende opslag en verkeer, en geen pauze). Upgraden doe je bij **Organization settings** → **Billing**. Wil je na het feest terug naar het gratis plan? Download dan eerst alle foto's en bewaar ze op twee plaatsen. Verwijder daarna de foto's (of het hele Supabase-project) en zet pas dan het plan terug: met 4–5 GB zit je ver boven de 1 GB van de gratis tier, en dan kan Supabase je project beperken.
2. Zet **Foto's per gast** lager (bij **Instellingen**). Let op: om onder 1 GB te blijven, moet je naar ongeveer 600 foto's in totaal, dus ~12 per gast bij 50 gasten. Voor een echt feest is dat weinig.
3. Een lagere resolutie of kwaliteit vraagt een kleine codewijziging (`MAX_SHOT_LONG_SIDE` en `JPEG_QUALITY` in `src/party-camera/image.ts`). Laat dat door iemand met wat programmeerervaring doen.

Wat is er als de opslag vol zit? Dan mislukken uploads. Beslis dit dus **vóór** het feest.

Vercel: het gratis Hobby-plan is bedoeld voor persoonlijk, niet-commercieel gebruik. Een privéfeest past daarin. Ook hier geldt een limiet op dataverkeer; kijk die na op [vercel.com/pricing](https://vercel.com/pricing).

---

## 7. Checklist vóór het feest

**Beveiliging**

- [ ] `ADMIN_PASSWORD` is sterk (lang, niet je gewone wachtwoord). Maak er een met `openssl rand -base64 18`.
- [ ] `SESSION_SECRET` is lang en willekeurig: `openssl rand -base64 32`.
- [ ] Beide staan in Vercel (Production) en je hebt daarna geredeployed.

**Adres en QR-codes**

- [ ] `PUBLIC_BASE_URL` is je productie-adres met `https://` (zie 4.3), en `/admin/qr` toont geen rode waarschuwing.
- [ ] De productie-URL opent in een privévenster zonder Vercel-login (Deployment Protection).
- [ ] Een kaartje **geprint** en met een telefoon gescand: je komt op de aanmeldpagina van de online versie (niet localhost).
- [ ] Een paar kaartjes extra geprint.

**Testen op echte telefoons** (minstens één **iPhone met Safari** en één **Android met Chrome**)

- [ ] Aanmelden met een naam.
- [ ] De camera vraagt toestemming, de zoeker verschijnt, wisselen voor/achter werkt, snel na elkaar afdrukken werkt.
- [ ] Na een foto daalt de teller, en de foto staat in de admin (en in Supabase **Storage** → `party-camera` → `originals`).
- [ ] **Vliegtuigmodus**: zet hem aan, neem een paar foto's, zet hem weer uit. De foto's worden alsnog opgeladen.
- [ ] **Op het beginscherm zetten**: iPhone via Delen → *Zet op beginscherm*, Android via de knop in de app of het Chrome-menu → *Toevoegen aan startscherm*. De app opent schermvullend met de juiste naam en icoon.
- [ ] Na het openen vanaf het beginscherm ben je nog aangemeld. Op sommige iPhones neemt de beginscherm-app de aanmelding uit Safari niet over: de gast moet zich dan in de app opnieuw aanmelden (de app legt dat zelf uit). Dat is normaal, maar test het zodat je het kunt uitleggen.
- [ ] Na de Reveal: een foto delen naar WhatsApp vanaf een telefoon, en een volledige zip openen op een computer.

**Instellingen**

- [ ] Feestnaam, welkomsttekst, kleur en **Foto's per gast** ingesteld.
- [ ] Het **Reveal-moment** ingesteld (bv. de ochtend na het feest) en **Automatisch** gekozen.
- [ ] **Fotograferen** staat open.
- [ ] Watermark ingesteld (of bewust uit), en daarna **Galerij voorbereiden** gedaan.
- [ ] Opslagplan beslist (zie hoofdstuk 6), en het Supabase-project is niet gepauzeerd.

**Op de locatie**

- [ ] Wifi en 4G/5G getest op de plek van het feest: foto's opladen lukt. Eventueel het wifi-wachtwoord op de kaartjes of op een bordje zetten.

**Testgasten opruimen** (vlak voor het feest)

Er is geen knop "gast verwijderen" in de admin. Doe het zo:

1. Verwijder eerst alle foto's van je testgasten in de admin bij **Foto's** (**Verwijderen**). Dan verdwijnen ook de bestanden uit de opslag.
2. Ga in Supabase naar **SQL Editor** → **New query**. Bekijk eerst wie er is:

   ```sql
   select id, name, shots_taken, created_at
   from public.guests
   order by created_at;
   ```

3. Verwijder de testgasten. Kopieer hun `id` uit het resultaat:

   ```sql
   delete from public.guests
   where id in (
     'plak-hier-het-id-van-testgast-1',
     'plak-hier-het-id-van-testgast-2'
   );
   ```

   Hun foto-rijen en hun `shot_reservations` gaan automatisch mee weg. Een telefoon van een verwijderde testgast komt gewoon terug op de aanmeldpagina.

Alles in één keer leegmaken (een volledig propere start, alleen vóór het feest):

1. In de **SQL Editor**: `delete from public.guests;` (verwijdert alle gasten, foto-rijen en reservaties; je instellingen blijven).
2. In **Storage** → bucket `party-camera`: verwijder de mappen `originals` en `derived`. Laat de map `watermark` staan, daar zit je logo in.

Verwijder bestanden altijd via de admin of via **Storage**, niet via SQL (Supabase laat dat niet toe in `storage.objects`).

---

## 8. Na het feest

1. **Instellingen** → **Fotograferen sluiten**.
2. Kijk bij **Foto's** of er iets verborgen of verwijderd moet worden.
3. **Watermark**: als je iets wijzigde, doe opnieuw **Galerij voorbereiden**.
4. **Reveal**: wacht op het ingestelde moment, of klik op **Nu onthullen**. Deel de link naar `/galerij` met je gasten.
5. **Downloads**: haal alle originelen binnen. Bij veel foto's in **delen**: download ze één voor één. Bewaar ze op twee plaatsen vóór je het Supabase-plan terugzet of iets verwijdert.

---

## 9. Problemen oplossen

**De camera start niet**

- Toestemming geweigerd: de app toont hoe je ze opnieuw geeft. iPhone: *Instellingen › Apps › Safari › Camera* → *Vraag* of *Sta toe*. Android: *Instellingen › Apps › Chrome › Machtigingen › Camera* → *Toestaan*.
- De link geopend in **WhatsApp, Instagram of een andere app**? Die ingebouwde browsers geven vaak geen camera. Open de link in Safari (iPhone) of Chrome (Android). De app zegt dit ook zelf.
- De camera werkt alleen via `https` (dus op de Vercel-versie, niet via een lokaal IP-adres).

**De QR-code gaat naar localhost of het verkeerde adres**

- `PUBLIC_BASE_URL` staat fout. Zet het juist in Vercel (zie 4.3), **redeploy**, en print de kaartjes opnieuw. `/admin/qr` waarschuwt als het adres niet klopt.

**Uploads mislukken**

- Opslag vol of limiet bereikt: kijk in Supabase bij **Organization** → **Usage** (of **Billing**). Upgrade naar Pro (zie hoofdstuk 6).
- Project gepauzeerd (gratis tier): in het Supabase-dashboard staat dan een knop om het te hervatten.
- **Fotograferen** staat dicht, of het rolletje van de gast is vol: de app toont dat aan de gast.
- Slecht netwerk: foto's worden bewaard en automatisch opnieuw geprobeerd. Laat de gast de app openhouden of later opnieuw openen.

**De galerij toont niets**

- De Reveal is nog niet gebeurd: kijk bij **Instellingen**. Staat het op **Verborgen houden**, dan blijft de galerij dicht, ook na het moment. Kies **Automatisch** (het moment telt) of **Nu onthullen**.
- Verborgen foto's verschijnen nooit in de galerij.

**Ik kan niet meer inloggen in de admin**

- Na 5 foute pogingen moet je even wachten (30 tot maximaal 60 seconden). Wacht een minuut en probeer opnieuw.
- Wachtwoord vergeten? Kijk in Vercel bij **Settings** → **Environment Variables** naar `ADMIN_PASSWORD`, of stel een nieuw in en **redeploy**.

**De build op Vercel mislukt met `getSettings failed`**

- `SUPABASE_URL` of `SUPABASE_SERVICE_ROLE_KEY` klopt niet, of de migratie is nog niet gedraaid. Controleer de waarden en draai `npm run db:migrate`.

**`npm run db:migrate` geeft een fout**

- `password authentication failed`: verkeerd wachtwoord, of speciale tekens niet ge-URL-encodeerd (zie 2.3).
- Geen verbinding: gebruik de **Session pooler**-URI (poort 5432), niet de directe verbinding.

---

## 10. Alle omgevingsvariabelen

Zie ook `.env.example`; daar staat bij elke variabele uitleg. Alle variabelen zijn alleen voor de server (nooit met `NEXT_PUBLIC_` ervoor).

| Variabele | Waarvoor | Geheim | Lokaal | Vercel |
| --- | --- | --- | --- | --- |
| `SUPABASE_URL` | adres van je Supabase-project | nee | ja | ja |
| `SUPABASE_SERVICE_ROLE_KEY` | volledige toegang tot database en opslag | **ja** | ja | ja |
| `ADMIN_PASSWORD` | inloggen op `/admin` | **ja** | ja | ja |
| `SESSION_SECRET` | ondertekent de cookies van gasten en admin (min. 32 tekens; wijzigen = iedereen uitgelogd) | **ja** | ja | ja |
| `PUBLIC_BASE_URL` | waar de QR-codes naartoe wijzen | nee | ja | ja |
| `SUPABASE_DB_URL` | alleen voor `npm run db:migrate` | **ja** | ja | nee |
| `SUPABASE_DB_PASSWORD` | optioneel geheugensteuntje, wordt door niets gelezen | **ja** | optioneel | nee |
