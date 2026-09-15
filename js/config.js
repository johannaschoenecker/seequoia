// Se(e)quoia configuration.
// Everything you are likely to change lives in this file.

export const APP = {
  name: 'Se(e)quoia',
  tagline: 'A citizen-science map of giant sequoias in the UK',
};

// ---------------------------------------------------------------------------
// MAP
// ---------------------------------------------------------------------------
export const MAP = {
  center: [52.2053, 0.1218],   // Cambridge
  zoom: 13,
  // Submissions outside this box are refused (also enforced in firestore.rules).
  uk: { latMin: 49.0, latMax: 61.0, lonMin: -9.0, lonMax: 2.5 },
};

// Tile providers. These are all free public services with fair-use policies;
// fine for an interactive map, not for bulk downloading.
// The first entry is the default. (CARTO's free "light" tiles, which the
// first version used, now demand an API key and render a watermark.)
export const BASEMAPS = {
  osm: {
    label: 'Streets',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  topo: {
    label: 'Topographic',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
    maxZoom: 17,
  },
  satellite: {
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagery &copy; Esri',
    maxZoom: 19,
  },
};

// ---------------------------------------------------------------------------
// CONTROLLED VOCABULARIES
// ---------------------------------------------------------------------------
// Keys are what gets stored; labels are what people see. The keys are also
// enforced in firestore.rules, so add here AND there.
export const ACCESS = {
  public:  'Public (open access)',
  path:    'Visible from a public path or road',
  paid:    'Paid entry (garden, estate, National Trust…)',
  private: 'Private land (not visible from public space)',
  unknown: 'Not sure',
};

export const CONDITION = {
  healthy: 'Healthy',
  damaged: 'Damaged (storm, lightning, dieback…)',
  dead:    'Dead / standing snag',
  felled:  'Felled / stump only',
  unknown: 'Not sure',
};

export const STATUS = {
  pending_review: 'Pending review',
  verified: 'Verified',
  rejected: 'Rejected',
};

// ---------------------------------------------------------------------------
// DATA QUALITY
// ---------------------------------------------------------------------------
export const QUALITY = {
  photoMaxEdgePx: 1400,
  photoQuality: 0.8,
  photoMaxBytes: 2_000_000,   // after resizing; storage.rules caps at 3 MB
  maxPhotos: 3,
  maxGirthCm: 3000,           // General Sherman is ~3,100 cm; UK trees are far smaller
  maxHeightM: 100,
  maxTreeCount: 500,
};

// ---------------------------------------------------------------------------
// LEGACY GOOGLE SHEET
// ---------------------------------------------------------------------------
// The first version of this app collected submissions through a Google Form.
// The published CSV is still read (a) as the data source while Firebase is
// switched off, and (b) by the admin "Import from Google Sheet" button, which
// copies every row into Firestore once. Set to '' once the import is done and
// you have stopped the form.
export const LEGACY = {
  sheetCsvUrl: '',   // import done 2026-09-15; the sheet is no longer read
};

// ---------------------------------------------------------------------------
// FIREBASE
// ---------------------------------------------------------------------------
// With `enabled: false` the map shows the Google Sheet and the "Add a tree"
// form is disabled. Follow FIREBASE-SETUP.md, then paste the config from
// Firebase console > Project settings > Your apps > Web app.
// These values are identifiers, not secrets - they are safe in a public repo.
// All access control lives in firestore.rules / storage.rules.
export const FIREBASE = {
  enabled: true,
  config: {
    apiKey: 'AIzaSyCjGaCMhM0llj-35LxTEJ1B-ThqJabkDeg',
    authDomain: 'seequoia-5daea.firebaseapp.com',
    projectId: 'seequoia-5daea',
    storageBucket: 'seequoia-5daea.firebasestorage.app',
    messagingSenderId: '222978844905',
    appId: '1:222978844905:web:688e253328d91dfc14a878',
  },
};
