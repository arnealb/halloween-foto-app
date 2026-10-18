# 06: Reveal & galerij

**What to build:** De host stelt een Reveal-moment in en kan het handmatig overrulen ("nu onthullen", "verborgen houden", "automatisch"). De admin toont altijd of de galerij onthuld is en waarom. Vóór de Reveal zien gasten een aftelling en is er geen enkele foto bereikbaar, ook niet via een directe link. Na de Reveal opent de galerij op een vaste, unlisted URL: thumbnails, een grote weergave waarin je kan swipen, de naam van de fotograaf bij elke foto, en een filter "mijn foto's" voor aangemelde gasten. Verborgen of verwijderde foto's verschijnen nooit. Zie spec user stories 29, 34–44, 49–51, 86 en de secties "Reveal-logica" en "Galerij & delen".

**Blocked by:** 05 (Feestinstellingen & fotograferen open/dicht)

**Status:** done

- [x] PartyCamera: `getRevealState()` geeft `{ revealed, reason, revealAt }` en `setRevealOverride('auto' | 'open' | 'closed')`. Tests dekken de volledige waarheidstabel (override × voor/na `revealAt`) met een vaste clock.
- [x] `listGallery({ guestId? })` faalt vóór de Reveal met `NotRevealed` en geeft daarna alleen niet-verborgen foto's terug, met de naam van de fotograaf. Het filter op guestId is getest.
- [x] `renderPhoto(photoId, 'thumb' | 'display', { asHost: false })` faalt vóór de Reveal, faalt voor verborgen foto's en levert nooit `original` aan gasten. Dit is getest.
- [x] Afgeleide varianten worden gecachet in de blob store, met een sleutel op foto + variant + settings-versie
- [x] In de admin: een reveal-tijd instellen, drie override-knoppen en een statusweergave ("onthuld: handmatig", "verborgen tot <datum>", ...)
- [x] Galerijpagina: aftelling vóór de Reveal. Erna een thumbnail-grid, een lightbox met swipen en de fotograafnaam, en het filter "mijn foto's".
- [x] Het scherm "rolletje vol" en de camera tonen de reveal-datum
- [x] Handmatig geverifieerd: een directe foto-URL vóór de Reveal geeft een fout. Na "nu onthullen" verschijnt de galerij.
