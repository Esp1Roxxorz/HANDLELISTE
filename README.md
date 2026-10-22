# Handleliste - publiseringspakke

Denne mappen er klar for gratis publisering som web-app/PWA.

## Filene som skal lastes opp

- index.html
- manifest.webmanifest
- service-worker.js
- icon-180.png
- icon-192.png
- icon-512.png

## Enkel publisering med GitHub Pages

1. Opprett en gratis GitHub-konto hvis du ikke har det.
2. Lag et nytt repository, for eksempel handleliste.
3. Last opp alle filene i denne mappen til roten av repositoryet.
4. Gå til Settings > Pages.
5. Velg Deploy from a branch.
6. Velg branch main og folder /root.
7. Trykk Save.
8. Vent litt, så får du en github.io-lenke du kan åpne på iPhone.

## Legg til på iPhone

1. Åpne github.io-lenken i Safari.
2. Trykk Del-knappen.
3. Velg Legg til på Hjem-skjerm.
4. Trykk Legg til.

## Personvern

Appen bruker ingen konto og sender ikke handlelisten til en server. Data lagres lokalt på brukerens egen enhet via nettleseren.

## Sikkerhetskopi på iPhone

Åpne **Sikkerhetskopi** øverst i appen.

### Lagre en kopi

1. Trykk **Lagre sikkerhetskopi**.
2. Hvis delingsvinduet åpnes, velg **Lagre i Filer**, velg mappe og lagre.
3. Hvis nettleseren ikke støtter deling av JSON-filer, lastes filen ned i stedet. Se i **Filer → Nedlastinger** (mappen kan avhenge av Safari-innstillingene). Lenken **Last ned JSON-fil** kan brukes hvis nedlastingen ikke startet.
4. Kontroller at filen finnes før du sletter nettleserdata eller bytter telefon. Velg for eksempel din egen iCloud Drive-mappe dersom kopien skal være tilgjengelig på en ny telefon.

Filen heter `handleliste-sikkerhetskopi-<dato og klokkeslett>.json`. Den inneholder **alle butikker**, også egendefinerte og butikker som ikke er valgt, med kategorier, varer, notater, nøyaktige priser, prisenheter, avkrysninger, rekkefølger, åpne/lukkede kategorier, «Skjul grønne», valgt butikk og globale enhetsvalg. Tomme kategorier og butikker bevares, og slettede standardvarer legges ikke tilbake.

**Del liste** fungerer som før: den deler bare tekst med gjenstående varer i valgt butikk og er ikke en sikkerhetskopi.

### Gjenopprett fra en kopi

1. Trykk **Gjenopprett fra fil**, og velg JSON-filen i Filer.
2. Appen kontrollerer hele filen før du får en bekreftelse med dato og antall butikker, kategorier og varer.
3. Bekreft for å **erstatte alt nåværende innhold på denne enheten**. Import slår ikke sammen lister. Ta en kopi av dagens innhold først hvis du vil kunne gå tilbake.

Avbryt eller en ugyldig fil endrer ingen data. Hvis lagringsplassen er full eller utilgjengelig, beholdes også dagens innhold. Etter vellykket gjenoppretting beholdes innhold og rekkefølge når appen lukkes og åpnes igjen.

Eksport og import skjer på enheten, uten noen opplasting fra appen. Du velger selv hvor filen lagres eller deles. JSON-filen er lesbar tekst og er ikke kryptert av appen. Sikkerhetskopier tas manuelt; det er ingen automatisk skysynkronisering.

## Format og kompatibilitet

Sikkerhetskopien er et versjonert JSON-objekt med `format: "handleliste-backup"`, `version: 1`, `exportedAt` (ISO-dato) og `state` (hele datamodellen). Maksimal filstørrelse er 10 MiB ved både eksport og import. Appen kontrollerer påkrevde felt, felttyper, priser, enheter, rekkefølger, unike ID-er og at valgt butikk finnes. Ukjente formatversjoner/felt og farlige objektnøkler/ID-er avvises fremfor å bli tolket eller delvis importert.

Lagringsnøkkelen er fortsatt `butikk-huskeliste-v4`. Komplette v4-data lastes direkte, uten å bygge listen opp igjen fra standardvarer. Migrering fra v2/v3 og eldre v4-strukturer beholdes. Service worker-cachen er oppdatert til v3; dette endrer ikke `localStorage`. Åpne appen med nett etter oppdatering, og lukk/åpne den igjen hvis gammel versjon fortsatt vises.

## Tester

Kjør med Node.js 22 eller nyere, uten ekstra pakker:

```sh
node --test tests/backup.test.cjs
```

Testene kjører appens faktiske JavaScript, innlasting, rendering og hendelseshåndtering med simulerte nettleser-API-er. De dekker full eksport → import → ny oppstart, egne butikker, slettede standardvarer, desimalpriser, globale enhetsvalg, norsk tekst, rekkefølge, gamle lagringsformater, ugyldige/farlige filer, avbrudd, lagringsfeil, fildeling og nedlasting. De sjekker også at vanlige handlelistefunksjoner virker etter import.

### Manuell kontroll på iPhone før publisering

Automatiske tester simulerer delingsvindu, filvelger og nedlasting. Følgende må også kontrolleres på en fysisk iPhone, både i Safari og fra Hjem-skjermen:

- Lagre en sikkerhetskopi i Filer og kontroller filnavn, `.json`-endelse og at filen inneholder data.
- Gjenopprett kopien i en separat testinstallasjon. Kontroller egne butikker, priser, enheter, avkrysninger, innstillinger og kategori-/varerekkefølge. Lukk og åpne appen, og kontroller på nytt.
- Avbryt filvalg/deling og avvis overskriving; dagens data skal være uendret.
- Prøv en ugyldig JSON-fil og deretter den samme gyldige filen igjen.
- Kontroller at knappene er lesbare og tilgjengelige i smal skjermbredde, og at **Del liste** fortsatt virker.
