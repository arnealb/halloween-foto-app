Status: ready-for-agent

# Spec: Party Camera — wegwerpcamera-webapp voor het verjaardagsfeest

## Problem Statement

Ik geef een verjaardagsfeest en wil dat er veel spontane, échte foto's genomen worden zonder een fotograaf te moeten huren. Als gasten met hun eigen camera-app fotograferen, verdwijnen die foto's in hun eigen filmrol: ik krijg ze nooit allemaal te zien, ze worden eindeloos herkozen en bijgewerkt, en mensen staan naar hun scherm te kijken in plaats van te feesten. Ik wil het gevoel van een wegwerpcamera: je hebt een beperkt rolletje, je drukt af, je ziet het resultaat pas later, en alle foto's komen bij mij samen zodat ik ze achteraf kan vrijgeven, delen, posten en downloaden.

## Solution

Een webapp, de **Party Camera**, die gasten openen door een QR-code te scannen die op het feest ligt. Er is geen app-installatie nodig, maar gasten kunnen de app wel op hun beginscherm zetten. Een **Gast** meldt zich één keer aan met zijn naam en krijgt een **Rolletje** van 50 **Shots**. In de camera ziet de gast een live zoeker en een ontspanknop. Elke foto wordt meteen opgeslagen, maar de gast kan hem niet terugzien: hij ziet alleen hoeveel shots er nog over zijn.

Alle foto's komen bij mij, de **Host**, terecht. Op een vooraf ingesteld moment (de **Reveal**) worden de foto's automatisch zichtbaar in een gedeelde **Galerij**. Ik kan dat moment ook handmatig vervroegen of tegenhouden. In de **Admin** zie ik alle foto's per gast, kan ik foto's verbergen of verwijderen, en stel ik een persoonlijk **Watermark** in (tekst en/of logo). Daar download ik ook alles als zip en genereer ik de printbare QR-codes. Gasten kunnen na de Reveal foto's bekijken, downloaden en delen via het deelmenu van hun telefoon.

## User Stories

### Aankomst & aanmelden
1. Als gast wil ik een QR-code op het feest kunnen scannen met mijn standaard camera-app, zodat ik zonder iets te installeren in de Party Camera terechtkom.
2. Als gast wil ik bij het openen een korte uitleg zien ("je hebt 50 foto's, je ziet ze pas later"), zodat ik snap hoe het werkt.
3. Als gast wil ik me aanmelden door alleen mijn naam in te vullen, zodat ik snel kan beginnen zonder account, e-mail of wachtwoord.
4. Als gast wil ik bij een volgende scan of bij het heropenen op hetzelfde toestel automatisch herkend worden, zodat ik mijn resterende shots behoud en niet opnieuw moet aanmelden.
5. Als gast wil ik dat elke QR-code op het feest naar dezelfde plek leidt, zodat het niet uitmaakt welke code ik scan.
6. Als gast wil ik dat mijn naam getoond wordt in de camera, zodat ik weet dat ik correct aangemeld ben.
7. Als gast wil ik dat twee gasten dezelfde naam kunnen hebben, zodat ik niet geblokkeerd word omdat er nog een "Tom" is.
8. Als gast wil ik een duidelijke foutmelding als ik geen naam invul, zodat ik weet wat er mist.

### Op het beginscherm zetten
9. Als gast wil ik de Party Camera op mijn beginscherm kunnen zetten (iOS en Android), zodat ik hem tijdens het feest als een app kan openen.
10. Als gast wil ik dat de app vanaf het beginscherm schermvullend opent, zonder adresbalk, zodat het als een echte camera-app aanvoelt.
11. Als gast wil ik een korte hint zien hoe ik de app aan mijn beginscherm toevoeg, zodat ik dat ook kan als mijn browser het niet zelf voorstelt.
12. Als host wil ik dat het app-icoon en de naam op het beginscherm persoonlijk zijn (feestnaam), zodat het bij mijn feest past.

### Foto's nemen
13. Als gast wil ik een live zoeker van mijn achtercamera zien, zodat ik mijn foto kan kaderen.
14. Als gast wil ik kunnen wisselen tussen voor- en achtercamera, zodat ik ook selfies kan nemen.
15. Als gast wil ik met één grote ontspanknop een foto nemen, zodat het snel en eenvoudig is.
16. Als gast wil ik een korte "klik"-feedback krijgen (flits-animatie/trilling), zodat ik weet dat de foto genomen is, zonder de foto zelf te zien.
17. Als gast wil ik na elke foto zien hoeveel shots ik nog over heb (bv. "37 / 50"), zodat ik mijn rolletje kan verdelen over de avond.
18. Als gast wil ik dat ik de genomen foto nergens kan terugzien (geen preview, geen galerij, geen thumbnail), zodat het wegwerpcamera-gevoel klopt.
19. Als gast wil ik dat de foto niet in de filmrol van mijn telefoon terechtkomt, zodat ik hem niet stiekem toch kan bekijken.
20. Als gast wil ik dat de app werkt als ik camera-toegang weiger of mijn browser geen live camera ondersteunt, met een fallback via de systeemcamera, zodat ik toch foto's kan nemen.
21. Als gast wil ik een duidelijke uitleg als camera-toegang geweigerd is, met hoe ik dat herstel, zodat ik niet vastzit.
22. Als gast wil ik dat een foto opnieuw geüpload wordt als mijn verbinding even wegvalt, zodat er geen shots verloren gaan.
23. Als gast wil ik zien als er nog een foto aan het uploaden is, zodat ik de app niet te vroeg sluit.
24. Als gast wil ik dat een mislukte upload geen shot kost, zodat ik niet gestraft word voor slechte wifi.
25. Als gast wil ik dat snel na elkaar afdrukken werkt, zodat ik een moment niet mis.
26. Als gast wil ik dat de foto's in goede kwaliteit maar redelijk compact worden opgeslagen, zodat het uploaden snel gaat op mobiel internet.
27. Als gast wil ik dat de foto juist georiënteerd wordt opgeslagen (staand/liggend), zodat ze er later goed uitzien.

### Het rolletje is vol
28. Als gast wil ik na mijn 50ste foto een melding "je rolletje is vol" krijgen, zodat ik weet dat ik klaar ben.
29. Als gast wil ik op het "rolletje vol"-scherm zien wanneer de foto's onthuld worden, zodat ik weet wanneer ik moet terugkomen.
30. Als host wil ik dat de 50-limiet op de server afgedwongen wordt, zodat niemand via trucjes (bv. snel tikken of meerdere tabbladen) meer dan 50 foto's kan nemen.
31. Als host wil ik het aantal shots per gast kunnen aanpassen in de admin, zodat ik bv. naar 30 of 100 kan gaan.

### Fotograferen afsluiten
32. Als host wil ik het fotograferen kunnen sluiten (bv. na het feest), zodat er daarna geen nieuwe foto's meer binnenkomen.
33. Als gast wil ik een duidelijke melding zien als het fotograferen gesloten is, zodat ik weet waarom ik geen foto meer kan nemen.

### Reveal
34. Als host wil ik een Reveal-moment (datum + tijd) instellen, zodat de foto's automatisch zichtbaar worden zonder dat ik iets moet doen.
35. Als host wil ik de Reveal handmatig kunnen forceren ("nu onthullen"), zodat ik de foto's eerder kan vrijgeven.
36. Als host wil ik de Reveal handmatig kunnen tegenhouden ("verborgen houden"), zodat ik eerst kan opruimen ook als het automatische moment al voorbij is.
37. Als host wil ik terug kunnen naar "automatisch", zodat de ingestelde tijd weer telt.
38. Als host wil ik in de admin altijd duidelijk zien of de galerij nu onthuld is en waarom (automatisch/handmatig), zodat ik geen verrassingen heb.
39. Als gast wil ik vóór de Reveal een aftelling of de reveal-datum zien, zodat er spanning opbouwt.
40. Als gast wil ik dat vóór de Reveal geen enkele foto bereikbaar is, ook niet via een directe link, zodat de verrassing echt verrassend blijft.

### Galerij (na de Reveal)
41. Als gast wil ik na de Reveal alle foto's van het feest in een galerij zien, zodat ik het feest kan herbeleven.
42. Als gast wil ik kunnen filteren op "mijn foto's", zodat ik eindelijk zie wat ik zelf gefotografeerd heb.
43. Als gast wil ik per foto zien wie hem nam, zodat ik weet van wie welke foto is.
44. Als gast wil ik een foto groot kunnen bekijken en door de foto's kunnen swipen, zodat het prettig bladert op mijn telefoon.
45. Als gast wil ik een foto kunnen downloaden, zodat ik hem kan bewaren.
46. Als gast wil ik een foto kunnen delen via het deelmenu van mijn telefoon (WhatsApp, Instagram, ...), zodat ik hem makkelijk kan posten.
47. Als gast wil ik al mijn eigen foto's in één keer kunnen downloaden als zip, zodat ik ze niet één voor één moet opslaan.
48. Als gast wil ik dat de foto's in de galerij het watermark van het feest dragen, zodat gedeelde foto's herkenbaar van het feest zijn.
49. Als gast wil ik dat de galerij snel laadt met kleine thumbnails, zodat ik niet op honderden volle foto's moet wachten.
50. Als host wil ik de galerij-link kunnen delen met mensen die er niet bij waren, zodat ook zij de foto's kunnen zien.
51. Als host wil ik dat verborgen of verwijderde foto's nooit in de galerij verschijnen, zodat ongepaste of mislukte foto's niet gedeeld worden.

### Admin: toegang
52. Als host wil ik dat de admin beveiligd is met een wachtwoord, zodat gasten niet in de admin kunnen.
53. Als host wil ik ingelogd blijven op mijn toestel, zodat ik niet steeds opnieuw moet inloggen tijdens het feest.
54. Als host wil ik kunnen uitloggen, zodat ik de admin veilig kan afsluiten op een gedeeld toestel.

### Admin: overzicht & moderatie
55. Als host wil ik live statistieken zien (aantal gasten, totaal aantal foto's, foto's per gast), zodat ik weet hoe het feest loopt.
56. Als host wil ik alle foto's per gast gegroepeerd zien, ook vóór de Reveal, zodat ik kan meekijken en opruimen.
57. Als host wil ik ook alle foto's chronologisch kunnen bekijken, zodat ik het verloop van de avond zie.
58. Als host wil ik een foto groot kunnen openen, zodat ik hem goed kan beoordelen.
59. Als host wil ik een foto kunnen verbergen voor de galerij (omkeerbaar), zodat ik mislukte of gênante foto's kan weghouden zonder ze definitief kwijt te zijn.
60. Als host wil ik een foto definitief kunnen verwijderen, met een bevestiging, zodat echt ongepaste foto's weg zijn.
61. Als host wil ik dat het verwijderen of verbergen van een foto geen shot teruggeeft aan de gast, zodat de 50-limiet eerlijk blijft.
62. Als host wil ik een gast kunnen hernoemen, zodat typfouten of bijnamen correct in de galerij staan.

### Admin: instellingen & persoonlijke touch
63. Als host wil ik de feestnaam instellen (bv. "Arne wordt 25"), zodat die terugkomt op het aanmeldscherm, de galerij, de QR-kaartjes en het app-icoon-label.
64. Als host wil ik een korte welkomsttekst kunnen instellen, zodat ik gasten persoonlijk kan begroeten.
65. Als host wil ik een accentkleur kunnen kiezen, zodat de app in de stijl van mijn feest is.
66. Als host wil ik een tekst-watermark instellen (bv. "Arne 25 · 18.10.26"), zodat elke gedeelde foto een persoonlijke touch heeft.
67. Als host wil ik een logo/afbeelding (PNG met transparantie) als watermark kunnen uploaden, zodat ik een eigen ontwerp kan gebruiken.
68. Als host wil ik de positie (hoek), grootte en transparantie van het watermark instellen, zodat het klein en subtiel blijft.
69. Als host wil ik het watermark aan of uit kunnen zetten, zodat ik zelf kies of het gebruikt wordt.
70. Als host wil ik een live voorbeeld van het watermark op een echte feestfoto (of een voorbeeldfoto) zien voor ik opsla, zodat ik weet hoe het eruitziet.
71. Als host wil ik dat de originele foto's nooit aangepast worden door het watermark, zodat ik altijd de schone versie houd en het watermark later nog kan wijzigen.
72. Als host wil ik dat een gewijzigd watermark meteen geldt voor alle foto's in de galerij, zodat alles consistent is.

### Admin: downloaden & delen
73. Als host wil ik alle foto's in één keer als zip downloaden, zodat ik een volledige back-up heb.
74. Als host wil ik bij het downloaden kiezen tussen originelen en versies met watermark, zodat ik zowel een archief als deelbare versies kan krijgen.
75. Als host wil ik dat de zip georganiseerd is per gast (map per gast, bestandsnamen met tijdstip), zodat ik de foto's makkelijk terugvind.
76. Als host wil ik de foto's van één gast als zip kunnen downloaden, zodat ik ze naar die persoon kan sturen.
77. Als host wil ik een losse foto kunnen downloaden of delen vanuit de admin, zodat ik snel iets kan posten.
78. Als host wil ik dat verborgen foto's wel in de "originelen"-download zitten maar niet in de "deelbare" download, zodat mijn archief compleet blijft.

### Admin: QR-codes
79. Als host wil ik een QR-code genereren die naar de aanmeldpagina van de Party Camera leidt, zodat gasten makkelijk binnenkomen.
80. Als host wil ik een printbare pagina met meerdere QR-kaartjes (met feestnaam en korte instructie), zodat ik ze kan afdrukken en op tafels kan leggen.
81. Als host wil ik de QR-code als losse afbeelding (PNG/SVG) kunnen downloaden, zodat ik hem in een eigen ontwerp kan gebruiken.
82. Als host wil ik dat de QR-code naar de productie-URL wijst (niet naar localhost), zodat de geprinte codes op het feest werken.

### Betrouwbaarheid & privacy
83. Als host wil ik dat foto's privé opgeslagen worden en alleen via de app opgevraagd kunnen worden, zodat niemand rechtstreeks in de opslag kan rondneuzen.
84. Als host wil ik dat de app vlot blijft als 50+ gasten tegelijk foto's uploaden, zodat het op het hoogtepunt van het feest niet hapert.
85. Als host wil ik dat een gast alleen namens zichzelf foto's kan uploaden, zodat niemand andermans rolletje kan opmaken.
86. Als gast wil ik dat mijn foto's alleen getoond worden in de galerij van dit feest, zodat ik weet waar ze terechtkomen.

## Implementation Decisions

### Domeintaal
- **Party Camera**: de app als geheel. **Event**: het ene feest (er is altijd precies één Event; geen multi-event). **Gast**: iemand die zich met een naam aanmeldt. **Host**: de eigenaar met admin-toegang. **Rolletje**: het aantal toegestane shots per gast (standaard 50). **Shot**: één genomen foto. **Reveal**: het moment waarop foto's zichtbaar worden. **Galerij**: de publieke weergave na de Reveal. **Watermark**: de persoonlijke overlay op afgeleide afbeeldingen.

### Architectuur: één diepe domeinmodule
- Alle businessregels leven in één domeinmodule, **PartyCamera**. Next.js route handlers, server actions en pagina's zijn dunne lagen die alleen request/cookie-handling doen en PartyCamera aanroepen.
- PartyCamera krijgt zijn afhankelijkheden via adapters: een **repository** (gasten, foto's, instellingen), een **blob store** (opslag van bytes) en een **clock** (huidige tijd). Productie-adapters gebruiken Supabase Postgres en Supabase Storage. Tests gebruiken in-memory adapters en een vaste clock.
- Beeldbewerking (watermark, thumbnails, oriëntatie) gebeurt binnen PartyCamera met sharp. Dat is geen adapter: sharp is snel en deterministisch genoeg om echt mee te testen.
- Interface van PartyCamera (indicatief, vorm kan tijdens implementatie scherper worden):
  - `joinGuest(name) → Guest`
  - `getGuest(guestId) → Guest + resterende shots`
  - `takeShot(guestId, imageBytes) → { shotsRemaining }` of een getypeerde fout (`RollFull`, `CaptureClosed`, `UnknownGuest`, `InvalidImage`)
  - `getRevealState() → { revealed, reason: 'auto' | 'forced-open' | 'forced-closed' | 'pending', revealAt }`
  - `listGallery({ guestId? }) → zichtbare foto's` (faalt met `NotRevealed` vóór de Reveal)
  - `renderPhoto(photoId, variant: 'thumb' | 'display' | 'original', { asHost }) → bytes` (gasten krijgen nooit `original` en nooit iets vóór de Reveal; watermark op `thumb`/`display` als het aan staat)
  - `previewWatermark(settingsDraft, sampleBytes?) → bytes`
  - Host-operaties: `getStats()`, `listAllPhotos({ groupBy })`, `hidePhoto` / `unhidePhoto`, `deletePhoto`, `renameGuest`, `getSettings`, `updateSettings`, `setRevealOverride('auto' | 'open' | 'closed')`, `exportZip({ variant: 'original' | 'shareable', guestId? }) → stream`

### Identiteit & sessies
- Gast-aanmelding maakt een Gast-record aan en zet een **httpOnly, ondertekende cookie** (JWT via jose) met het guestId, 90 dagen geldig. Herkenning gebeurt alleen via die cookie: wie de cookie wist of van toestel wisselt, wordt een nieuwe gast. Dat risico accepteren we voor een privéfeest.
- De server leest het guestId altijd uit de ondertekende cookie, nooit uit de request body.
- Admin-login: één host-wachtwoord uit een environment variable. Bij een correct wachtwoord volgt een aparte ondertekende admin-cookie (httpOnly). Alle host-operaties checken die cookie server-side. Het signing secret komt ook uit een environment variable.

### De 50-limiet (atomair)
- De limiet wordt in de database afgedwongen met een atomaire, conditionele verhoging van de shot-teller van de gast (verhoog alleen als teller < limiet). Dat gebeurt via een Postgres-functie (RPC), zodat gelijktijdige uploads vanuit meerdere tabbladen de limiet niet kunnen overschrijden.
- Volgorde in `takeShot`: valideer en normaliseer de afbeelding → reserveer een shot atomair → sla de bytes op → registreer de foto. Faalt het opslaan na de reservering, dan wordt de reservering teruggedraaid, zodat een mislukte upload geen shot kost.
- Verbergen of verwijderen van foto's verlaagt de teller niet.
- De limiet is een instelling van het Event (`shotsPerGuest`, standaard 50).

### Opname aan de client-kant
- Live zoeker via `getUserMedia` met de achtercamera als standaard, plus een wisselknop. Afdrukken pakt een frame uit de videostream en encodeert het in de browser als JPEG: lange zijde max ~2560px, kwaliteit ~0,85, zodat een upload ruim onder de request-limiet van Vercel (~4,5 MB) blijft.
- Fallback: een file input met `capture="environment"` als `getUserMedia` niet beschikbaar is of geweigerd wordt.
- De client toont de foto nooit: geen preview-element, geen object-URL in de DOM, niets in de filmrol. Na het afdrukken is er alleen flits-feedback plus de teller.
- Uploads gaan via een kleine in-memory wachtrij met retries (exponentiële backoff) zolang de pagina open is. De UI toont "nog X aan het uploaden". Een persistente offline-wachtrij valt buiten scope.
- De server normaliseert elke upload: EXIF-rotatie toepassen, metadata (incl. GPS) strippen, JPEG hercomprimeren.

### Reveal-logica
- Instellingen: `revealAt` (tijdstip) en `revealOverride` (`auto` | `open` | `closed`).
- `revealed = override === 'open' || (override === 'auto' && now >= revealAt)`. Bij `closed` blijft alles verborgen, ongeacht de tijd.
- Elke gast-gerichte foto-opvraging (lijst en bytes) checkt de reveal-state server-side. Vóór de Reveal komt er geen enkele foto-URL of byte naar gasten.

### Fotograferen open/dicht
- Instelling `captureOpen` (boolean). Als die op false staat, faalt `takeShot` met `CaptureClosed`. Dit staat los van de Reveal.

### Watermark
- Instellingen: `watermarkEnabled`, `watermarkText`, optioneel `watermarkLogo` (PNG, in de blob store), `watermarkPosition` (een van de vier hoeken), `watermarkScale` (relatief t.o.v. de fotobreedte) en `watermarkOpacity`.
- Het watermark wordt bij het renderen toegepast op de afgeleide varianten (`thumb`, `display`, `shareable` export) en nooit op het origineel.
- Afgeleide afbeeldingen worden gecachet in de blob store, met een sleutel op foto-id + variant + **settings-versie**. Elke `updateSettings` die het watermark raakt, verhoogt de versie, zodat oude caches vanzelf ongeldig worden.
- Tekst wordt via SVG-compositing in sharp gerenderd. De admin-preview gebruikt exact dezelfde renderfunctie.

### Opslag & schema
- Supabase Storage: één **privé** bucket. Originelen staan per gast (`originals/<guestId>/<photoId>.jpg`), afgeleiden onder een aparte prefix, logo's onder een eigen prefix. Er worden geen publieke bucket-URL's gebruikt; alle bytes gaan via de app (route die `renderPhoto` aanroept), met passende cache-headers.
- Postgres-tabellen:
  - `guests`: id, name, shots_taken, created_at
  - `photos`: id, guest_id, storage_key, width, height, taken_at, hidden
  - `event_settings`: één rij met o.a. title, welcome_text, accent_color, shots_per_guest, capture_open, reveal_at, reveal_override, watermark-velden, settings_version
- Plus een Postgres-functie voor de atomaire shot-reservering (en een tegenhanger om terug te draaien).
- Row Level Security staat aan zonder publieke policies. De app praat server-side met de service-role key, die nooit naar de client gaat.
- Het schema wordt als SQL-migratie in de repo bewaard, zodat het in het Supabase-dashboard of via de CLI uitgevoerd kan worden.

### Galerij & delen
- De galerij staat op een vaste, "unlisted" URL. Na de Reveal is die toegankelijk voor iedereen met de link, ook zonder aanmelding. Het filter "mijn foto's" werkt alleen met een gast-cookie.
- Delen via de Web Share API met het bestand (watermark-versie). Valt de browser terug, dan wordt het downloaden.
- Gasten kunnen een zip downloaden van hun eigen foto's (shareable variant) via dezelfde export-functie, beperkt tot hun eigen guestId en alleen na de Reveal.
- De zip wordt gestreamd met archiver (map per gast, bestandsnaam `<gast>_<tijdstip>_<n>.jpg`), zodat grote exports niet volledig in het geheugen hoeven.

### QR-codes
- De QR-code wordt server-side gegenereerd met `qrcode` op basis van een geconfigureerde publieke basis-URL (environment variable), zodat geprinte codes nooit naar localhost wijzen. De admin toont een waarschuwing als de basis-URL ontbreekt of naar localhost wijst.
- Er is een printbare pagina met een raster van QR-kaartjes (feestnaam, "scan me & schiet 50 foto's", accentkleur), plus download als PNG en SVG.

### PWA
- Een dynamisch web app manifest (feestnaam, accentkleur als theme color, `display: standalone`, start-URL = de camera), app-iconen en Apple-meta-tags (`apple-mobile-web-app-capable`, touch icon). Een service worker is niet nodig om op het beginscherm te zetten en valt buiten scope.
- In de camera komt een "zet me op je beginscherm"-hint (apart voor iOS en Android), die zich verbergt als de app al standalone draait.

### Hosting
- Deploy op Vercel, met Supabase als managed Postgres + Storage. Benodigde environment variables: Supabase-URL, service-role key, host-wachtwoord, cookie signing secret en de publieke basis-URL. Er komt een voorbeeld-env-bestand in de repo.

## Testing Decisions

- **Eén test-seam: de PartyCamera-module.** Tests praten alleen met de publieke interface van PartyCamera, met in-memory adapters (repository + blob store) en een vaste clock. Er worden geen interne functies getest en er wordt niet tegen Supabase, Next.js routes of de UI getest.
- Een goede test beschrijft extern gedrag in domeintaal, bijvoorbeeld "een gast met een vol rolletje krijgt `RollFull`" of "vóór de Reveal faalt `listGallery` met `NotRevealed`", en blijft groen bij een refactor van de interne opbouw.
- Testrunner: Vitest. Die moet nog toegevoegd worden, want het project heeft nog geen tests en dus geen prior art. Deze suite wordt de prior art.
- Wat gedekt wordt:
  - Aanmelden: naam verplicht, getrimd, dubbele namen toegestaan.
  - Rolletje: precies `shotsPerGuest` shots toegestaan, de volgende faalt. Gelijktijdige `takeShot`-calls overschrijden de limiet niet (de in-memory repository volgt dezelfde atomaire semantiek). Een mislukte blob-opslag kost geen shot. Verbergen/verwijderen geeft geen shot terug.
  - `CaptureClosed` wanneer fotograferen gesloten is.
  - Reveal: de waarheidstabel voor `auto`/`open`/`closed` × voor/na `revealAt`, inclusief de `reason`.
  - Galerij: verborgen en verwijderde foto's verschijnen niet. Het filter "mijn foto's" klopt. Vóór de Reveal komen er geen bytes voor gasten. Gasten krijgen nooit de `original`-variant.
  - Watermark: met het watermark aan verschilt de afgeleide van het origineel en blijft het origineel byte-identiek. Een settings-wijziging levert een nieuwe afgeleide op (cache-invalidatie). Met het watermark uit is er geen overlay.
  - Normalisatie: EXIF-oriëntatie wordt toegepast en metadata (GPS) is verwijderd.
  - Export: de zip bevat een map per gast. `original` bevat ook verborgen foto's, `shareable` niet. Een gast-export bevat alleen de eigen foto's.
- Handmatig getest (browser, echte telefoons iOS Safari + Android Chrome): zoeker/wisselen/afdrukken, fallback, toevoegen aan beginscherm, uploads bij slechte verbinding, admin-flows, QR scannen vanaf een print.

## Out of Scope

- Native iOS/Android-apps of app-store-distributie.
- Video, live photos, filters, effecten of bewerken door gasten.
- Meerdere events / multi-tenant.
- Echte accounts (e-mail, wachtwoord, social login) voor gasten, en een gast herstellen op een ander toestel.
- Automatisch posten naar sociale media via hun API's. "Posten" gebeurt via downloaden en het deelmenu.
- Een persistente offline-uploadwachtrij / service worker.
- Gezichtsherkenning, AI-tagging of automatische moderatie.
- Een fotoafdrukservice of fotoboekgeneratie.
- Push-notificaties bij de Reveal.

## Further Notes

- Het projectnaam-veld in `package.json` staat nog op de scaffold-naam en mag hernoemd worden.
- De Next.js-versie in deze repo (16.x) wijkt af van wat agents gewoon zijn: lees de meegeleverde Next-docs (zie `AGENTS.md`) vóór het schrijven van routes, server actions of metadata/manifest-code.
- Ongeveer 50 gasten × 50 foto's × ~1,5 MB ≈ 3,75 GB aan originelen. Dat past niet in de gratis Supabase Storage-tier (1 GB). Reken op het Pro-plan voor de feestmaand, of verlaag de resolutie/kwaliteit. De host moet dit vóór het feest beslissen.
- Test vóór het feest met een paar echte telefoons op de locatie (wifi/4G), en print een paar QR-kaartjes extra.
