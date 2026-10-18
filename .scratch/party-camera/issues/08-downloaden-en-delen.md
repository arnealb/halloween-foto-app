# 08: Downloaden & delen

**What to build:** De host downloadt alle foto's in één zip: originelen (archief, ook met de verborgen foto's) of deelbare versies met watermark (zonder de verborgen foto's). Dat kan voor iedereen of per gast, met een map per gast en bestandsnamen met tijdstip. Na de Reveal kunnen gasten een losse foto downloaden of delen via het deelmenu van hun telefoon, en al hun eigen foto's als zip downloaden. De host kan ook vanuit de admin een losse foto downloaden of delen. Zie spec user stories 45–47, 73–78 en de sectie "Galerij & delen".

**Blocked by:** 07 (Watermark)

**Status:** ready-for-agent

- [ ] PartyCamera: `exportZip({ variant: 'original' | 'shareable', guestId? })` geeft een stream terug (archiver), met een map per gast en bestandsnaam `<gast>_<tijdstip>_<n>.jpg`
- [ ] Tests: `original` bevat ook verborgen foto's, `shareable` niet en heeft het watermark. Een export per gast bevat alleen de eigen foto's. Een gast-export vóór de Reveal faalt met `NotRevealed`.
- [ ] Admin-route voor de zip (alles / per gast, keuze van variant), alleen met de admin-cookie
- [ ] Gast-route voor "mijn foto's als zip". Het guestId komt uit de cookie, alleen na de Reveal en alleen `shareable`.
- [ ] Een downloadknop per foto in de galerij en de admin. Delen via de Web Share API met het bestand (watermark-versie), met download als fallback.
- [ ] Handmatig geverifieerd: een volledige zip openen op desktop. Een foto delen naar WhatsApp vanaf een telefoon.
