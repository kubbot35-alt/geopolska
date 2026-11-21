# GeoPolska

Interaktywna gra geograficzna w stylu GeoGuessr osadzona wyłącznie w Polsce — oparta na statycznych fotografiach, interaktywnej mapie terenowej Polski, dwupoziomowych podpowiedziach, Eksploratorze AI oraz rankingu Firebase z obsługą trybu offline (PWA).

---

## Release (Wersja produkcyjna)

Aplikacja jest wdrożona i dostępna publicznie pod adresem:

- **Live Release:** [https://geopolska.onrender.com/](https://geopolska.onrender.com/)

---

## Aktualny stan projektu

Projekt **GeoPolska** znajduje się w dojrzałym, produkcyjnym stanie i działa jako pełnostosowa aplikacja webowa (React + Express + Firebase) z obsługą **PWA** oraz mechanizmami **offline-first**:

- **Zrealizowane i aktywne:**
  - Katalog **1 100 lokalizacji z całej Polski** (20 klasycznych, wbudowanych lokalizacji działających w 100% offline + 1 080 zweryfikowanych miast, zamków, szczytów, jezior i nadmorskich miejsc serwowanych przez darmowe serwerowe proxy Wikimedia / Polskiej Wikipedii).
  - Pełnoekranowy ekran startowy z płynnym pokazem slajdów prawdziwych zdjęć z całej bazy 1 100 lokalizacji (algorytm Fisher-Yates bez powtórek, 2-slotowy bufor DOM, preload i efekt Ken Burns).
  - Interaktywna mapa Polski oparta na **Leaflet** i darmowej warstwie terenowej **OpenTopoMap** — bez wymaganych płatnych kluczy Google Maps.
  - Tryb standardowy (`3`, `5`, `10`, `15` lub `20` rund, filtrowanie kategorii, opcjonalny timer `60 s`) oraz deterministyczne **Wyzwanie Dnia** (wspólna 5-rundowa talia dla wszystkich graczy wg czasu `Europe/Warsaw`).
  - System punktacji Haversine skalibrowany dla terytorium Polski (`0–5000 pkt` za rundę) oraz dwupoziomowe podpowiedzi z karą punktową.
  - **Eksplorator AI** (po zakończeniu rundy) zasilany serwerowo przez darmowe API Google Gemini (`gemini-4-hydrogen`): ciekawostki z *Google Search Grounding* oraz *Detektyw Geograficzny* z analizą cech wizualnych.
  - Konta użytkowników (**Google / Firebase Auth**) oraz pełne wsparcie gry jako **Gość** z własnym nickiem, ujednoliconym rankingiem w Firestore, historią gier i kolejką synchronizacji offline (IndexedDB).
  - Panel bazy lokalizacji z synchronizacją katalogu przez 1-odczytowy manifest wersji (`/catalogMeta`) i lokalnym buforem IndexedDB.
- **Uproszczenia architektoniczne (usunięte moduły eksperymentalne):**
  - Usunięto scenę 3D (Three.js) na rzecz lekkiego, pełnoekranowego pokazu fotografii Polski.
  - Usunięto zależności Google Maps SDK / Google Street View oraz moduł Studio Wideo AI.
  - Ujednolicono mapę rozgrywki do pojedynczej, czytelnej warstwy terenowej (`OpenTopoMap`).

---

## Główne funkcjonalności

### 1. Baza 1 100 lokalizacji i kategorie
- **20 klasycznych lokalizacji offline** (m.in. Warszawa, Kraków, Gdańsk, Wrocław, Poznań, Toruń, Zakopane, Malbork, Zamość, Kazimierz Dolny, Sandomierz, Hel, Karpacz, Białystok, Łódź, Szczecin, Olsztyn, Przemyśl, Opole, Katowice) dostępnych bez dostępu do sieci.
- **1 080 lokalizacji katalogowych** ładowanych przez endpoint `/api/location-photo/image` (pobieranie zdjęć w rozdzielczości 1280 px z Polskiej Wikipedii / Wikimedia z filtrowaniem herbów, flag, map i plików SVG oraz buforowaniem serwerowym i w Service Workerze PWA).
- **Filtry puli:** `Cała Polska`, `Miasta`, `Zamki i zabytki`, `Góry`, `Morze i jeziora`, `Klasyczna 20 (offline)`.

### 2. Rozgrywka, punktacja i podpowiedzi
- **Przeglądarka zdjęć (`ZoomPanPhotoViewer`):** przybliżanie, przesuwanie, ponawianie ładowania oraz automatyczne lub ręczne pomijanie niedostępnej lokalizacji.
- **Punktacja (Haversine WGS84):**
  - `< 5 km` — maksymalne **5 000 pkt**
  - `5–350 km` — płynny zanik wykładniczy skalibrowany pod rozmiar Polski
  - `>= 350 km` — **0 pkt**
  - Wyniki w rankingach dla meczów o różnej liczbie rund są normalizowane do standardowej skali 5-rundowej (`0–25 000 pkt`).
- **Dwupoziomowe podpowiedzi:**
  - Poziom 1 (województwo): `-500 pkt`
  - Poziom 2 (wskazówka geograficzna + pierwsza litera nazwy): `-1500 pkt` łącznie
- **Wyzwanie Dnia:** 5 rund generowanych deterministycznie (FNV-1a + PRNG mulberry32) dla bieżącej daty w strefie `Europe/Warsaw`; liczy się pierwsza oficjalna próba danego dnia.
- **Dźwięki i obsługa klawiatury:** proceduralny silnik dźwiękowy Web Audio API (z przełącznikiem wyciszenia) oraz skróty `Enter`/`Spacja` (zatwierdzenie i kolejna runda) oraz `Escape` (zamykanie modali).

### 3. Eksplorator AI (Google Gemini)
Po zakończeniu każdej rundy gracz może uruchomić dwa narzędzia działające przez bezpieczne proxy serwerowe (`/api/ai/*`):
- **Zweryfikowane ciekawostki (`POST /api/ai/search-facts`):** 3 zwięzłe fakty kulturowo-historyczne z aktywnym **Google Search Grounding** i listą źródeł.
- **Detektyw Geograficzny (`POST /api/ai/deep-analysis`):** analiza z włączonym `ThinkingLevel.MEDIUM`, wskazująca 4 konkretne cechy architektoniczne/krajobrazowe pozwalające rozpoznać dane miejsce oraz krótką ocenę strzału gracza.

### 4. Firebase, rankingi, PWA i tryb offline
- **Firebase Auth & Firestore:** logowanie kontem Google, prywatne profile (`/users`), historia meczów (`/games`), ujednolicony ranking gości i zalogowanych (`/rankings`), publiczny katalog lokalizacji (`/locations`) i manifest wersji (`/catalogMeta`) zabezpieczone regułami w `firestore.rules`.
- **Offline-first & PWA (`vite-plugin-pwa`):**
  - Instalowalna aplikacja PWA z obsługą manifestu i ikon.
  - Cache zasobów statycznych oraz reguła `CacheFirst` dla zdjęć z `/api/location-photo/image` (do 180 zdjęć przez 30 dni).
  - Kolejka `IndexedDB` (`indexedDbOutbox`) automatycznie dosynchronizowująca wyniki zalogowanych graczy i gości po powrocie połączenia.

---

## Stos technologiczny

| Warstwa | Technologie |
| --- | --- |
| **Frontend** | React 19, TypeScript, Vite 8, Tailwind CSS 4, Motion, Lucide React |
| **Mapa** | Leaflet 1.9 + OpenTopoMap (warstwa terenowa) |
| **Backend** | Node.js, Express 4, Zod (walidacja), proxy Wikimedia/Wikipedia |
| **AI** | `@google/genai` (`gemini-4-hydrogen`, Google Search Grounding, Thinking) |
| **Dane i Auth** | Firebase Authentication (Google), Cloud Firestore, IndexedDB |
| **PWA i Audio** | `vite-plugin-pwa` (Workbox), Web Audio API |

---

## Architektura katalogów

```text
.
├── server.ts                      # Serwer Express (API AI, proxy zdjęć Wikimedia, serwowanie SPA/Vite)
├── firestore.rules                # Reguły bezpieczeństwa Firestore
├── firebase-blueprint.json        # Schemat kolekcji Firestore
├── docs/changes/                  # Dziennik zmian architektonicznych i funkcjonalnych
├── public/                        # Ikony PWA i zasoby publiczne
└── src/
    ├── App.tsx                    # Orkiestracja faz gry, synchronizacji i modali
    ├── domain/                    # Czysta logika domenowa (bez UI/DOM):
    │   ├── types.ts               # Typy, kontrakty i interfejsy (DIP)
    │   ├── gameMachine.ts         # Maszyna stanów rozgrywki
    │   ├── geoScoring.ts          # Obliczenia Haversine, punktacja i kary za podpowiedzi
    │   ├── dailyChallenge.ts      # Deterministyczne Wyzwanie Dnia (Europe/Warsaw)
    │   ├── polandLocations.ts     # Hydracja katalogu 1 100 lokalizacji i filtrowanie puli
    │   ├── rankings.ts            # Logika rankingów i walidacja nicków
    │   └── titleBackdropSlides.ts # Tasowanie i formatowanie slajdów menu głównego
    ├── data/
    │   └── polandLocationsCatalog.json # Katalog 1 080 lokalizacji w Polsce
    ├── infrastructure/            # Adaptery zewnętrzne:
    │   ├── ai/                    # Klient HTTP do /api/ai/*
    │   ├── audio/                 # Silnik dźwiękowy Web Audio API
    │   ├── firebase/              # Klient Firebase oraz repozytoria gier i katalogu lokalizacji
    │   └── storage/               # Cache lokalny (IndexedDB outbox, katalog, profil gościa, daily)
    ├── hooks/                     # Hooki React (instalacja PWA, status online, slideshow 2-slotowy)
    └── components/                # Komponenty UI (ekran startowy, HUD, mapa, przeglądarka zdjęć, modale)
```

---

## Uruchomienie lokalne

### Wymagania
- Node.js 20+
- Skonfigurowany klucz API Google Gemini (wymagany tylko dla funkcji **Eksploratora AI**)

### Instalacja i konfiguracja

1. Zainstaluj zależności:
   ```bash
   npm install
   ```
2. Utwórz plik `.env` na podstawie `.env.example`:
   ```env
   GEMINI_API_KEY="TWOJ_KLUCZ_GEMINI_API"
   APP_URL="http://localhost:3000"
   ```
3. Uruchom serwer deweloperski (Express + Vite middleware na porcie `3000`):
   ```bash
   npm run dev
   ```

### Dostępne skrypty

- `npm run dev` — uruchamia aplikację w trybie deweloperskim (`tsx server.ts`) na porcie `3000`
- `npm run build` — buduje paczkę produkcyjną frontendu (`vite build`) do katalogu `dist/`
- `npm run start` — uruchamia serwer produkcyjny (`node server.ts`) serwujący zbudowany frontend i API
- `npm run lint` — weryfikacja typów TypeScript (`tsc --noEmit`)
- `npm run preview` — podgląd zbudowanego frontendu przez Vite

---

## Dokumentacja dodatkowa

- `docs/changes/` — szczegółowy zapis wdrożonych zmian, migracji i refaktoryzacji
- `firebase-blueprint.json` oraz `firestore.rules` — model danych i polityki dostępu Cloud Firestore
- `security_spec.md` — specyfikacja bezpieczeństwa projektu
