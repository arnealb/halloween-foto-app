# 05: Feestinstellingen & fotograferen open/dicht

**What to build:** In de admin stelt de host de persoonlijke basis van het feest in: feestnaam, welkomsttekst, accentkleur en het aantal shots per gast. Die verschijnen meteen bij de gasten (aanmeldpagina, camera, rolletje-teller). De host kan het fotograferen sluiten. Daarna krijgen gasten een duidelijke melding en weigert de server nieuwe shots. Zie spec user stories 31–33, 63–65 en de secties "Fotograferen open/dicht" en "Opslag & schema" (event_settings).

**Blocked by:** 04 (Admin: login, overzicht & moderatie)

**Status:** ready-for-agent

- [ ] PartyCamera: `getSettings` en `updateSettings` (met validatie: shots per gast ≥ 1, geldige kleur, niet-lege titel). Elke wijziging verhoogt de settings-versie.
- [ ] `takeShot` faalt met `CaptureClosed` als fotograferen gesloten is. Dit is getest.
- [ ] Een gewijzigd `shotsPerGuest` geldt meteen voor de limiet en de teller. Tests dekken verhogen en verlagen (een gast boven de nieuwe limiet heeft een vol rolletje).
- [ ] Een instellingenformulier in de admin, en een toggle voor fotograferen open/dicht met zichtbare status
- [ ] De aanmeldpagina en camera tonen feestnaam, welkomsttekst en accentkleur
- [ ] De camera toont "fotograferen is gesloten" als dat zo is
- [ ] Handmatig geverifieerd: titel/kleur wijzigen → zichtbaar bij de gast. Fotograferen sluiten → gast kan niet meer afdrukken.
