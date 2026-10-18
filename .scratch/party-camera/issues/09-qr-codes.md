# 09: QR-codes

**What to build:** De host genereert in de admin de QR-code die gasten naar de aanmeldpagina brengt, gebaseerd op de geconfigureerde publieke basis-URL, zodat geprinte codes nooit naar localhost wijzen. Er is een printbare pagina met een raster van QR-kaartjes (feestnaam, "scan me & schiet 50 foto's", accentkleur), en de QR-code kan als PNG en SVG gedownload worden. De admin waarschuwt als de basis-URL ontbreekt of naar localhost wijst. Zie spec user stories 5, 79–82 en de sectie "QR-codes".

**Blocked by:** 05 (Feestinstellingen & fotograferen open/dicht)

**Status:** ready-for-agent

- [ ] De QR-code wordt server-side gegenereerd met `qrcode` op basis van de publieke basis-URL uit de env, en wijst naar de aanmeldpagina
- [ ] Een QR-sectie in de admin met preview, downloads als PNG en SVG, en een waarschuwing bij een ontbrekende of localhost basis-URL
- [ ] Een printbare kaartjespagina (print-CSS, meerdere kaartjes per A4) met feestnaam, instructie en het aantal shots uit de instellingen
- [ ] Handmatig geverifieerd: een kaartje printen of op het scherm tonen → met een telefoon scannen → komt op de aanmeldpagina van de juiste omgeving
