# 01: Gast aanmelden

**What to build:** Een gast opent de Party Camera, vult zijn naam in en is aangemeld. Bij het heropenen op hetzelfde toestel wordt hij automatisch herkend en gaat hij meteen naar de camera-pagina (voorlopig een placeholder met "Hallo <naam>"). Dit ticket legt ook het fundament waar alle volgende tickets op bouwen: de PartyCamera-domeinmodule met de repository-, blob store- en clock-adapters (in-memory voor tests, Supabase voor productie), de Vitest-setup, de SQL-migratie (gasten, foto's, event-instellingen, privé bucket) en een voorbeeld-env-bestand. Zie de spec `.scratch/party-camera/spec.md` (user stories 1–8, secties "Architectuur", "Identiteit & sessies", "Opslag & schema").

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Vitest is geïnstalleerd, `npm test` draait de suite
- [ ] PartyCamera bestaat als één module die zijn adapters geïnjecteerd krijgt. Er bestaan in-memory adapters en een vaste clock voor tests, plus Supabase-adapters voor productie.
- [ ] `joinGuest(name)` maakt een Gast aan. De naam is verplicht en wordt getrimd, dubbele namen zijn toegestaan. Er zijn tests op de PartyCamera-interface.
- [ ] `getGuest(guestId)` geeft de gast terug met zijn resterende shots, of faalt met `UnknownGuest`. Dit is getest.
- [ ] De SQL-migratie staat in de repo: tabellen `guests`, `photos`, `event_settings` (één rij met defaults, incl. `shots_per_guest` = 50), RLS aan zonder publieke policies, en een privé storage bucket
- [ ] Aanmelden zet een httpOnly, ondertekende (jose) gast-cookie die 90 dagen geldig is. De server leest het guestId alleen uit die cookie.
- [ ] Aanmeldpagina met uitleg ("50 foto's, je ziet ze pas later"), een naamveld en foutmelding bij lege naam. Een herkende gast wordt doorgestuurd naar de camera-pagina.
- [ ] Een voorbeeld-env-bestand met alle benodigde variabelen (Supabase-URL, service-role key, host-wachtwoord, cookie-secret, publieke basis-URL). De service-role key komt nooit in client-code.
- [ ] Handmatig geverifieerd: aanmelden → herladen → nog steeds herkend
