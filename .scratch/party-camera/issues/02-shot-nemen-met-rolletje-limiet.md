# 02: Shot nemen met rolletje-limiet

**What to build:** Een aangemelde gast neemt op de camera-pagina een foto (in dit ticket via de systeemcamera-fallback, een file input met `capture`). De foto wordt geüpload en opgeslagen zonder dat de gast hem ooit te zien krijgt. Daarna ziet de gast alleen de teller ("37 / 50"). Na het laatste shot verschijnt "je rolletje is vol". De limiet wordt atomair op de server afgedwongen, en een mislukte opslag kost geen shot. Zie spec user stories 18–19, 24, 26–28, 30, 85 en de secties "De 50-limiet", "Opname aan de client-kant" (normalisatie) en "Opslag & schema".

**Blocked by:** 01 (Gast aanmelden)

**Status:** done

- [x] `takeShot(guestId, imageBytes)` normaliseert de afbeelding (EXIF-rotatie toepassen, metadata/GPS strippen, JPEG hercomprimeren), reserveert atomair een shot, slaat het origineel op en registreert de foto. Het resultaat is `{ shotsRemaining }`.
- [x] Getypeerde fouten: `RollFull`, `UnknownGuest`, `InvalidImage`
- [x] Tests: precies `shotsPerGuest` shots lukken en de volgende geeft `RollFull`. Gelijktijdige `takeShot`-calls overschrijden de limiet niet. Faalt de blob store, dan wordt de reservering teruggedraaid. Oriëntatie en strippen van metadata zijn getest.
- [x] De migratie bevat de Postgres-functies voor atomair reserveren en terugdraaien. De Supabase-adapter gebruikt die.
- [x] De upload-route leest het guestId uit de cookie (nooit uit de body) en blijft onder de request-limiet van Vercel. De client comprimeert vooraf (lange zijde ≤ ~2560px).
- [x] De camera-pagina toont nooit de foto: geen preview, geen object-URL in de DOM. Alleen bevestiging en teller.
- [x] Het scherm "rolletje vol" verschijnt na het laatste shot en bij het heropenen van een volle gast
- [x] Gast-API's geven nooit foto-URL's of -bytes terug
- [ ] Handmatig geverifieerd op een telefoon: foto nemen → teller daalt → bestand staat in de privé bucket
