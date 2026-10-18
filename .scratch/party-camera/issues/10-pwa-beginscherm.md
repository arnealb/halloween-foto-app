# 10: Op het beginscherm zetten (PWA)

**What to build:** Gasten kunnen de Party Camera op hun beginscherm zetten (iOS en Android). De app opent dan schermvullend zonder adresbalk, met de feestnaam als label en een icoon in de accentkleur. In de camera staat een hint ("zet me op je beginscherm") met platform-specifieke uitleg, die verdwijnt als de app al standalone draait. Zie spec user stories 9–12 en de sectie "PWA".

**Blocked by:** 05 (Feestinstellingen & fotograferen open/dicht)

**Status:** ready-for-agent

- [ ] Een dynamisch web app manifest: de naam/short name komen uit de feestnaam, theme color uit de accentkleur, `display: standalone`, en de start-URL is de camera
- [ ] App-iconen (incl. maskable) en Apple-meta-tags (`apple-mobile-web-app-capable`, status bar, touch icon)
- [ ] Een beginscherm-hint met aparte uitleg voor iOS (Deel → Zet op beginscherm) en Android, verborgen in standalone-modus, en weg te klikken
- [ ] Geen service worker (buiten scope)
- [ ] Handmatig geverifieerd: toevoegen aan het beginscherm op iOS en Android → opent schermvullend met het juiste label en icoon, en de gast blijft aangemeld
