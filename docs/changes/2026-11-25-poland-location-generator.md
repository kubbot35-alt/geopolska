# 2026-11-25 — Wbudowany Generator Lokalizacji Polska (Zakładka Generator PL)

## Cel zmiany
Dodanie dedykowanej zakładki **Generator PL** w oknie **Baza Lokacji Firebase Firestore**, umożliwiającej generowanie wyższej jakości katalogu lokalizacji dla wszystkich 16 województw Polski z Wikidaty, Wikimedia Commons i polskiej Wikipedii, w pełnej zgodności z regułami bezpieczeństwa `firestore.rules` i mechaniką rozgrywki GeoPolska.

## Kluczowe poprawki względem pierwotnego prototypu
1. **Zgodność z `firestore.rules`**:
   - Zamiast klienckiego `Timestamp.now()` zapis używa wyłącznie `serverTimestamp()` (`== request.time`) przy tworzeniu oraz `batch.update(...)` dla istniejących dokumentów (zachowanie niezmienności `createdAt`).
   - Automatyczne podbijanie wersji i licznika manifestu `/catalogMeta/poland` oraz natychmiastowa aktualizacja lokalnego cache IndexedDB.
   - Ścisła walidacja współrzędnych w granicach WGS84 Polski (`lat: 48.5–55.5`, `lng: 13.5–25.0`) i limitów długości pól.
2. **Ochrona 20 klasycznych lokacji offline**:
   - Metoda `replacePolandOnlineCatalog()` zachowuje wszystkie 20 lokalnych scen offline (`orderIndex: 0..19`, `isClassicOffline: true`), deduplikuje kandydatów o zbieżnych nazwach/ID i zastępuje wyłącznie pozostałe wpisy online (`orderIndex >= 20`, `isClassicOffline: false`).
3. **Szybki, zbiorczy pipeline po stronie serwera (`POST /api/location-generator/voivodeship`)**:
   - Używa 16 dokładnych, współczesnych identyfikatorów QID województw (`Q54150..Q54188`), unikając historycznych województw z etykiet tekstowych.
   - Filtruje po białej liście klas geograficznych (miasta, zamki, pałace, zabytki, szczyty, parki narodowe, jeziora, latarnie morskie, mola) i wyklucza jednostki administracyjne, cmentarze oraz niejednoznaczne długie rzeki.
   - Grupuje weryfikację zdjęć Wikimedia Commons (`imageinfo`, paczki po 45 plików, `image/jpeg`, `>= 800x450`, proporcje `0.75..2.5`, `thumburl` 1280px) oraz opisy Wikipedii (`extracts`, paczki po 20 artykułów).
4. **Czyste podpowiedzi bez spoilerów i podgląd przed zapisem**:
   - `buildSpoilerFreeHint()` usuwa nazwę miejsca (wraz z polskimi rdzeniami odmiany) i nie powtarza nazwy województwa (ujawnianego już na Poziomie 1 podpowiedzi).
   - Interaktywna tabela podglądu pozwala filtrować, odrzucać pojedyncze rekordy, pobierać/wczytywać JSON oraz wymaga jawnego potwierdzenia w pasku przed zastąpieniem bazy online.

## Zmodyfikowane i utworzone moduły
- `src/domain/polandGeneratorTypes.ts` — czyste kontrakty domenowe, tryby świeżości zdjęć (`only_2025_2026`, `prefer_2025_2026`, `any`), interfejs `IPolandGeneratorGateway`, konfiguracja 16 województw QID.
- `src/domain/polandGeneratorSanitizer.ts` — czyste funkcje walidacji, ekstrakcja rzeczywistego roku wykonania zdjęcia z EXIF (`DateTimeOriginal`), filtracja podejrzanych plików (herby, mapy, skany archiwalne, ujęcia satelitarne/ISS), klasyfikacja kategorii, usuwanie spoilerów i normalizacja JSON (Zod).
- `src/infrastructure/generator/wikimediaFreshPhotoFinder.ts` — geolokalizowane (`nearcoord` z całkowitym promieniem w km + twarda weryfikacja odległości z `prop=coordinates`) i kategorialne (`incategory`) wyszukiwanie unikalnych zdjęć JPEG z lat 2025–2026 na Wikimedia Commons z punktacją ujęć krajobrazowych i deduplikacją URL.
- `src/infrastructure/generator/wikimediaBatchVerifier.ts` — zbiorcza weryfikacja obrazów Wikimedia Commons (wraz z metadanymi EXIF) i ekstraktów pl.wikipedia.org.
- `src/infrastructure/generator/polandGeneratorBackend.ts` — logika SPARQL z fallbackiem, równoległym rozwiązywaniem świeżych zdjęć 2025–2026 i składaniem gotowych dokumentów `PolandLocation`.
- `src/infrastructure/generator/polandGeneratorGateway.ts` — klient HTTP realizujący `IPolandGeneratorGateway`.
- `server.ts` — nowy endpoint `POST /api/location-generator/voivodeship` z obsługą `photoFreshness`.
- `src/domain/types.ts` i `src/infrastructure/firebase/firestoreLocationRepository.ts` — kontrakt i implementacja `replacePolandOnlineCatalog()`.
- `src/components/modals/PolandGeneratorConfigBar.tsx`, `PolandGeneratorProgressGrid.tsx`, `PolandGeneratorPreviewTable.tsx`, `PolandGeneratorPanel.tsx`, `LocationDatabaseModal.tsx` — interfejs zakładki **Generator PL** z wyborem rocznika zdjęć (domyślnie **Tylko 2025–2026**) i podglądem roku zdjęcia w tabeli.
