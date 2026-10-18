# 07: Watermark

**What to build:** De host geeft de foto's een persoonlijke touch met een klein watermark. Dat kan tekst zijn (bv. "Arne 25 · 18.10.26") en/of een geüpload logo (PNG met transparantie), met instelbare hoek, grootte en transparantie, en aan of uit te zetten. Een live voorbeeld op een echte feestfoto (of een voorbeeldfoto) toont het resultaat voor het opslaan. Het watermark staat automatisch op alle galerijfoto's, en een wijziging geldt meteen overal. Originelen worden nooit aangepast. Zie spec user stories 48, 66–72 en de sectie "Watermark".

**Blocked by:** 06 (Reveal & galerij)

**Status:** done

- [x] Watermark-instellingen in `updateSettings`: enabled, text, logo (opgeslagen in de blob store), position (4 hoeken), scale en opacity
- [x] Het watermark wordt met sharp (SVG-tekst + logo-compositing) toegepast op `thumb` en `display` voor gasten. Het origineel blijft byte-identiek.
- [x] `previewWatermark(draft, sampleBytes?)` gebruikt exact dezelfde renderfunctie
- [x] Tests: met het watermark aan verschilt de afgeleide van een render zonder watermark. Het origineel is onveranderd. Een settings-wijziging levert een nieuwe afgeleide op (cache-invalidatie via de settings-versie). Met het watermark uit is er geen overlay.
- [x] Admin-UI: tekstveld, logo-upload/verwijderen, hoekkiezer, schuifjes voor grootte en transparantie, de toggle en een live voorbeeld
- [x] Handmatig geverifieerd: het watermark instellen → zichtbaar in de galerij. Wijzigen → de galerij toont de nieuwe versie.
