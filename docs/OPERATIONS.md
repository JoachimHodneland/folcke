# Folcke Screener – Driftsmanual

**Dashboard:** https://folcke.vercel.app  
**Crons:** ingest 20:30 UTC / screen 21:00 UTC (man–fre)  
**Siste sjekk:** etter 23:00 norsk tid (crons ferdig)

---

## 1. Daglig rutine (5 min)

1. Åpne `/` (Today)
2. Er det nye kandidater siden i går? → gå til **seksjon 2**
3. Er noen aksjer du har ordre i borte fra listen? → gå til **seksjon 5**
4. Ingen nye / ingen forsvunnet → ferdig

**Se etter:**
- Score 50+ og grønn rad = høy konfidens
- Position in range < 0.30 (mørkegrønn) = nær støtte = ideelt entry
- Spread > 8% (gul) = legg til ekstra margin på kjøpspris

---

## 2. Ny kandidat dukker opp

1. Klikk ticker → `/stocks/[ticker]`
2. Verifiser chartet visuelt: støtte- og motstandslinjer treffer faktiske stussepunkter?
3. Sjekk siste 5 dagers OHLCV: `low` har ikke brutt under `support_level`?
4. Sjekk nyheter siste 14 dager: avanza.se eller borsdata.se (emisjon? profit warning?)
5. Alt OK → legg limit kjøpsordre i Nordnet
   - Pris: `suggested_buy_price`
   - Antall: `suggested_qty`
   - Gyldighet: 60 dager
   - Maks 30 000 SEK første posisjon
6. Registrer i `/orders` → status **PLACED**

---

## 3. Kjøpsordre matcher i Nordnet

1. Marker ordren som **MATCHED** i `/orders`
2. **Umiddelbart:** åpne Nordnet og legg limit salgsordre
   - Pris: `suggested_sell_price`
   - Antall: samme qty
   - Gyldighet: 60 dager
3. Registrer salgsordren i `/orders` → status **PLACED**

> Ikke vent. Salgsordren skal ligge før kursen drar opp.

---

## 4. Salgsordre matcher i Nordnet

1. Marker som **SOLD** i `/orders`
2. Sjekk om aksjen fortsatt er på `/` (Today)
   - **Ja** → legg ny limit kjøp på dagens `suggested_buy_price`, registrer PLACED
   - **Nei** → kapital frigjort, venter på neste kandidat

---

## 5. Aksje forsvinner fra Today (beslutningstre)

Sjekk alltid `/stocks/[ticker]` før du handler.

| Årsak | Handling |
|---|---|
| `1m%` gått over +15% (trend opp) | La ligge – venter på dipp |
| `1m%` gått under -12% (trend ned) | **KANSELLER** umiddelbart |
| `close` brutt under `support_level` med 3%+ | **KANSELLER** umiddelbart |
| Spread krympet under 2% | La ligge – fortsatt gyldig trade |
| Combined touches falt under 10 | La ligge hvis chart ser OK ut |
| `position_in_range` gått over 0.70 | La ligge – venter på dipp |
| Selskapsnyhet (emisjon, profit warning) | **KANSELLER** umiddelbart |

---

## 6. Ukentlig sjekk (10 min, fredag kveld)

1. Åpne `/orders`
2. For hver aktiv ordre:
   - **Distance > +20%** (kurs langt over din limit): vurder å heve kjøpsprisen 1–2%
   - **Distance < -3%** (kurs dippet under limit uten matching): undersøk – lav likviditet?
3. Ordre **eldre enn 14 dager**: hev kjøpspris ~1% hvis aksjen fortsatt ser sterk ut
4. Ordre **eldre enn 30 dager**: vurder å kansellere og flytte kapital til ny kandidat
5. Sjekk nyheter for alle posisjoner du sitter med (borsdata.se Holdings-tab for insider)

---

## 7. Røde flagg – kanseller umiddelbart

- `close` brutt under `support_level` med 3%+ i 2 dager
- Selskapet annonserer ny aksjeemisjon
- Profit warning eller resultatvarsel
- Insider-salg i stor skala (borsdata.se → Holdings)
- Selskapet flyttes fra First North til OTC-marked
- Trading suspendert
- Konkursforhandling startet

---

## 8. Månedlig performance-review (30 min)

Åpne `/history` og gå gjennom:

| Metrikk | Mål |
|---|---|
| Win rate | 85%+ |
| Snitt holdetid | 1–6 uker |
| Snitt netto avkastning per trade | 5–10% |
| Antall venter (PLACED) vs matchet | < 50% bør vente > 30 dager |

**Spørsmål å stille:**
- Hvilke aksjer matchet raskt? Hvilke ble sittende?
- Noen markedsplasser (Spotlight / First North / NGM) som funker bedre?
- Noen kandidater som dukket opp gjentatte ganger og aldri matchet? Øk terskel eller ignorer.
- Hvis win rate < 85%: skjerpet støtte/motstandskriterier? (øk combined touches)
- Hvis snitt holdetid > 6 uker: er range-bredden bred nok? (øk `range_width_pct`-krav?)

---

## 9. Kostnader

| Post | Detalj |
|---|---|
| Nordnet kurtasje | 39 NOK minimum (Gold) – verifisert mot 78 NOK observert |
| NOK→SEK veksling | 0,25% per veksling – vurder fast SEK-konto |
| AF-konto skatt | 37,84% av realisert gevinst, skjermingsfradrag ~3,6% |
| IKZ-konto skatt | Utsatt til uttak |

---

## 10. Hurtigreferanse

| Situasjon | Action |
|---|---|
| Ny kandidat | Verifiser chart → legg ordre → registrer PLACED |
| Kjøp matchet | Legg salgsordre umiddelbart i Nordnet |
| Salg matchet | Registrer SOLD → vurder reentry |
| Ordre forsvinner fra Today | Sjekk beslutningstre (seksjon 5) |
| Trade > -10% urealisert | Vurder å selge på neste motstand heller |
| Cron feilet | Trykk "Run screening now" på dashboardet |
| Vercel nede | Kjør lokalt: `curl -X POST http://localhost:3000/api/cron/screen -H "Authorization: Bearer $CRON_SECRET"` |
| Ny backfill nødvendig | `npx tsx scripts/backfill.ts` |
