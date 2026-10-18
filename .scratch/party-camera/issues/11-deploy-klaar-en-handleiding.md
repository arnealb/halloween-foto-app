# 11: Deploy-klaar & handleiding

**What to build:** De host kan de Party Camera zonder hulp live zetten en vóór het feest testen. De README legt stap voor stap uit hoe je een Supabase-project aanmaakt, de migratie draait, de env-variabelen invult, lokaal start en naar Vercel deployt. Ook staan erin: een inschatting van de opslagkosten (en wanneer het Pro-plan nodig is), en een checklist om vóór het feest te testen (echte telefoons, wifi/4G op de locatie, QR-kaartjes printen, reveal-tijd instellen, admin-wachtwoord sterk maken). Zie spec "Hosting" en "Further Notes".

**Blocked by:** 01–10 (alle voorgaande tickets)

**Status:** done

- [x] De README vervangt de scaffold-tekst: wat de app doet, setup van Supabase (project, migratie, bucket), env-variabelen, lokaal draaien, tests draaien en deploy op Vercel
- [x] De projectnaam in `package.json` is hernoemd van de scaffold-naam
- [x] Een sectie over opslag en kosten: ongeveer 50 gasten × 50 foto's ≈ 3,75 GB, de limiet van de gratis tier, en opties (Pro-plan of lagere resolutie)
- [x] Een checklist om vóór het feest te testen
- [x] `npm run build`, `npm run lint` en `npm test` slagen
- [ ] Handmatig geverifieerd: een verse deploy op Vercel volgens de README → volledige flow (aanmelden → shots → admin → reveal → galerij → zip)
