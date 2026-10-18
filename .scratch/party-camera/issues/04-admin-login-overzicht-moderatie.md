# 04: Admin: login, overzicht & moderatie

**What to build:** De host logt met een wachtwoord in op de admin en blijft ingelogd op zijn toestel. Hij ziet live statistieken (aantal gasten, totaal aantal foto's, foto's per gast) en alle foto's, ook vóór de Reveal, gegroepeerd per gast of chronologisch. Hij kan een foto groot openen, verbergen (omkeerbaar), definitief verwijderen (met bevestiging) en een gast hernoemen. Verbergen of verwijderen geeft geen shot terug. Zie spec user stories 52–62, 83 en de secties "Identiteit & sessies" (admin) en "Opslag & schema".

**Blocked by:** 02 (Shot nemen met rolletje-limiet)

**Status:** done

- [x] Admin-login met het host-wachtwoord uit een env-variabele, een ondertekende httpOnly admin-cookie, en uitloggen
- [x] Alle host-operaties checken de admin-cookie server-side. Zonder cookie worden ze geweigerd.
- [x] PartyCamera: `getStats`, `listAllPhotos({ groupBy: 'guest' | 'time' })`, `hidePhoto` / `unhidePhoto`, `deletePhoto` (verwijdert record + bytes) en `renameGuest`, allemaal met tests
- [x] `renderPhoto(photoId, 'original' | 'thumb', { asHost: true })` levert bytes aan de host. Thumbnails worden met sharp gemaakt en gecachet in de blob store. Er wordt geen publieke bucket-URL gebruikt.
- [x] Tests: verbergen/verwijderen verlaagt `shots_taken` niet. Een verwijderde foto is weg uit de lijsten en de blob store.
- [x] De admin-UI toont stats, een fotogrid per gast en op tijd, een lightbox, verberg- en verwijderknoppen (met een bevestiging in de pagina) en gast hernoemen
- [x] Handmatig geverifieerd: als gast foto's nemen → in de admin zien → verbergen/verwijderen
