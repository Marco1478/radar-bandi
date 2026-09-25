# Radar Bandi

**I bandi e gli incentivi pubblici aperti in Italia, filtrati per la tua attività in cinque domande.**

Ogni giorno in Italia ci sono circa 800 bandi e incentivi aperti — contributi a fondo perduto, finanziamenti
agevolati, crediti d'imposta — per imprese, professionisti, startup e associazioni. Sono sparsi tra ministeri,
regioni e camere di commercio, e scritti in burocratese. Radar Bandi li raccoglie ogni mattina e ti mostra
solo quelli compatibili con te:

1. **Dove** ha sede l'attività
2. **Chi sei**: impresa, impresa da aprire, professionista, associazione, privato (+ femminile, under 35, startup innovativa)
3. **Quanto sei grande**
4. **Cosa vuoi finanziare**: macchinari, digitale, assunzioni, formazione, export, energia, immobili, ricerca, avvio, liquidità
5. **Che tipo di aiuto**: qualsiasi o solo fondo perduto

Poi puoi scaricare le scadenze nel calendario (con promemoria 7 giorni prima) o iscriverti al calendario della
tua regione, che si aggiorna da solo.

## Principi

- **Gratis e senza registrazione.** Nessun cookie, nessun tracciamento.
- **Privacy per costruzione.** Il filtro gira nel browser: le risposte non arrivano a nessun server.
- **Fonte ufficiale, sempre citata.** Ogni scheda rimanda al bando ufficiale e alla scheda su incentivi.gov.it.
- **Si aggiorna da solo.** Una GitHub Action scarica i dati ogni mattina e ripubblica il sito.

## Come funziona

```
incentivi.gov.it (open data MIMIT, IODL 2.0)
        │  scripts/fetch.mjs — una richiesta al giorno, tiene solo i bandi aperti/in arrivo
        ▼
data/bandi.json  (+ seen.json per i "nuovi", history.csv per lo storico)
        │  scripts/build.mjs
        ▼
dist/  index.html + app.js (matcher) · bando/<slug>/ (una pagina per bando)
       feeds/<regione>.ics (calendari) · sitemap.xml
```

Nessuna dipendenza: serve solo Node ≥ 20.

```bash
npm run update     # scarica + costruisce
npm run serve      # http://localhost:4321
```

Per pubblicare in una sottocartella (es. GitHub Pages) imposta `SITE_URL`, ad esempio
`SITE_URL=https://utente.github.io/radar-bandi npm run build`.

## Dati e licenza

I dati sugli incentivi provengono da [incentivi.gov.it](https://www.incentivi.gov.it/it/open-data), il portale del
Ministero delle Imprese e del Made in Italy, rilasciati con licenza
[Italian Open Data License v2.0](https://www.dati.gov.it/iodl/2.0/). Radar Bandi non è un sito della Pubblica
Amministrazione e non fornisce consulenza: verifica sempre requisiti e scadenze sul bando ufficiale.
