# Firebase einrichten — einmalig, ca. 20 Minuten

Alles passiert in der Browser-Konsole: <https://console.firebase.google.com>.
Keine CLI nötig. Bitte ein **eigenes Projekt** anlegen, getrennt von PeatProbe,
damit Daten, Regeln und Abrechnung der beiden Apps nicht vermischt werden.

Die Konsole übersetzt nicht alle Begriffe — manches bleibt auch auf Deutsch
englisch (z. B. „Firestore Database", „App Check"). Wo das deutsche Label
abweichen könnte, steht das englische Original in Klammern.

## 1. Projekt anlegen

- **„Projekt hinzufügen"** (Add project) → Name `seequoia` → Google Analytics
  **AUS** (wird nicht gebraucht) → „Projekt erstellen"

## 2. Authentication (Anmeldung)

- Menü „Erstellen" (Build) → **Authentication** → „Jetzt starten"
- Tab **Anmeldemethode** (Sign-in method) → **Google** → Aktivieren →
  Support-E-Mail wählen → Speichern
- **Einstellungen → Autorisierte Domains → Domain hinzufügen:**
  - `johannaschoenecker.github.io`  ← ohne diesen Eintrag schlägt die
    Anmeldung in der veröffentlichten App **stumm** fehl (kein Fehler, beim
    Tippen auf „Sign in" passiert einfach nichts)
  - `localhost` steht schon drin

## 3. Firestore (Datenbank)

- „Erstellen" → **Firestore Database** → „Datenbank erstellen"
- Standort: **europe-west2 (London)** — lässt sich später **nicht** mehr ändern
- Im **Produktionsmodus** starten (production mode)
- Tab **Regeln** (Rules) → alles löschen → kompletten Inhalt von
  `firestore.rules` aus diesem Repo einfügen → **Veröffentlichen** (Publish)

## 4. Storage (Fotos)

- „Erstellen" → **Storage** → „Jetzt starten" → gleicher Standort
- Dabei fordert Firebase ein Upgrade auf den **Blaze-Tarif** (nutzungsbasiert;
  die Freikontingente reichen für diese App sehr wahrscheinlich aus, aber eine
  Kreditkarte muss hinterlegt werden)
- Tab **Regeln** → kompletten Inhalt von `storage.rules` einfügen →
  **Veröffentlichen**

## 5. Budgetwarnung — nicht überspringen!

- ⚙ → **Nutzung und Abrechnung** (Usage and billing) → Details & Einstellungen
  → **Budgetwarnung bei ca. 5 € einrichten**

## 6. Web-Konfiguration holen

- ⚙ → **Projekteinstellungen** (Project settings) → „Meine Apps" (Your apps)
  → **</>**-Symbol (Web) → Spitzname `seequoia` → Firebase Hosting **nicht**
  ankreuzen → „App registrieren"
- Das angezeigte `firebaseConfig`-Objekt kopieren

## 7. In die App eintragen

In `js/config.js`: `enabled: true` setzen und die Werte einfügen:

```js
export const FIREBASE = {
  enabled: true,
  config: {
    apiKey: '...',            // darf öffentlich sein - das ist eine Kennung,
    authDomain: '...',        // kein Geheimnis; die Sicherheit steckt in den
    projectId: '...',         // Regeln, nicht im Schlüssel
    storageBucket: '...',
    messagingSenderId: '...',
    appId: '...',
  },
};
```

Dann committen und pushen — ab jetzt zeigt die App oben rechts „Sign in".

## 8. Dich selbst zur Administratorin machen

1. Die App öffnen (localhost oder die veröffentlichte) → oben rechts
   **Sign in** → mit deinem Google-Konto anmelden.
2. Firebase-Konsole → Authentication → Tab **Nutzer** (Users) → deine
   **Nutzer-UID** (User UID) kopieren
3. Firestore → **„Sammlung starten"** (Start collection) → Sammlungs-ID
   `admins` → Dokument-ID = *deine UID einfügen* → irgendein Feld anlegen
   (z. B. `note` = `ich`) → Speichern
4. App neu laden → der Tab **Review** erscheint.

Niemand sonst kann sich selbst eintragen: Die Regeln erlauben keinerlei
Schreibzugriff von Clients auf `admins`.

## 9. Bestehende Bäume importieren

Tab **Review** → **Import from Google Sheet**. Liest das veröffentlichte CSV,
zeigt an, wie viele Zeilen gefunden wurden, und schreibt sie mit ihrem
bisherigen Status (approved / rejected) nach Firestore. Bereits importierte
Zeilen werden übersprungen — der Knopf ist also gefahrlos mehrfach nutzbar,
falls das Sheet vor dem Schließen des Formulars noch Zeilen bekommt.

Wenn das alte Google-Formular geschlossen ist: in `js/config.js`
`LEGACY.sheetCsvUrl` auf `''` setzen.

## Was du damit bekommst

- Besucher sehen verifizierte Bäume **ohne Anmeldung**.
- Wer beitragen will, meldet sich mit Google an; Einreichungen landen in der
  Sammlung `trees` mit `status: pending_review`, Fotos in Storage unter
  `photos/<uuid>-<n>.jpg`.
- Review-Tab: genehmigen, ablehnen (mit privater Notiz), Label / Zugang /
  Notizen bearbeiten, abgelehnte Bäume zurückholen oder löschen, alles als CSV
  exportieren.
- E-Mail-Adressen werden nie an Baum-Dokumenten gespeichert. Um jemanden zu
  kontaktieren: `userId` des Dokuments unter Authentication → Nutzer
  nachschlagen.

## Vor dem Freiwilligen-Start — noch offen

- **App Check** („Erstellen" → App Check, reCAPTCHA v3) — blockiert
  automatisierten Missbrauch des offenen Endpunkts. Danach die
  **Erzwingung** (enforcement) für Firestore + Storage aktivieren.
- Datenschutzhinweis bzw. Gespräch mit dem Datenschutzbüro, falls das
  Projekt unter dem Namen der Universität läuft.
