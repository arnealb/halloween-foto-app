# 03: Live zoeker & upload-wachtrij

**What to build:** De camera-pagina voelt aan als een echte wegwerpcamera. De gast ziet een live zoeker (standaard de achtercamera), kan wisselen naar de voorcamera en drukt af met een grote knop. Hij krijgt flits- en trilfeedback, maar ziet de foto niet. Snel na elkaar afdrukken werkt. Uploads gaan via een wachtrij die bij netwerkfouten opnieuw probeert, en de UI toont "nog X aan het uploaden". Als camera-toegang geweigerd wordt of de browser het niet ondersteunt, legt de app uit wat er moet gebeuren en valt hij terug op de systeemcamera uit ticket 02. Zie spec user stories 13–17, 20–23, 25 en de sectie "Opname aan de client-kant".

**Blocked by:** 02 (Shot nemen met rolletje-limiet)

**Status:** done

- [x] Live zoeker via `getUserMedia`, standaard de achtercamera, met een knop om te wisselen tussen voor en achter
- [x] Afdrukken pakt een frame en encodeert het als JPEG (lange zijde ≤ ~2560px, kwaliteit ~0,85). De foto wordt nergens getoond.
- [x] Flits-animatie en (waar ondersteund) trilling bij afdrukken
- [x] Een in-memory upload-wachtrij met retries en exponentiële backoff, plus de indicator "nog X aan het uploaden" en een waarschuwing bij het sluiten van de pagina tijdens het uploaden
- [x] De teller is gebaseerd op het antwoord van de server. Een geweigerd shot (`RollFull`) toont "rolletje vol".
- [x] Bij geweigerde camera-toegang verschijnt uitleg per platform (iOS/Android) en een knop voor de systeemcamera-fallback
- [ ] Handmatig geverifieerd op iOS Safari en Android Chrome: zoeker, wisselen, snel afdrukken, en uploads tijdens tijdelijke vliegtuigmodus
