# Dr.Puz Audio Lab

Polskojęzyczny odtwarzacz lokalnych plików audio i wideo dla Windows, zbudowany w Electron, React i TypeScript.

## Uruchomienie developerskie

```powershell
npm install
npm run dev
```

## Kontrola i wydania

```powershell
npm run typecheck
npm run build
npm run dist:win
```

Instalator NSIS trafia do katalogu `release/`. Aplikacja zapisuje bibliotekę, kolejkę, playlisty, ulubione i ustawienia equalizera w lokalnym katalogu danych użytkownika. Nie synchronizuje danych przez sieć.

## Funkcje

- Odtwarzanie lokalnych plików, biblioteka z obserwowanymi folderami oraz kolejka.
- Playlisty M3U, ulubione, wyszukiwanie i skróty klawiaturowe.
- 10-pasmowy equalizer z presetami gatunków i zapisanymi presetami użytkownika.
- Sześć scen Three.js reagujących na analizę audio.
- Napisy z plików SRT/VTT dla filmu oraz odczyt CPU, RAM i GPU, jeśli system udostępnia dane.

## Kodeki i formaty

Lista w aplikacji określa typy plików rozpoznawane przez bibliotekę. Dekodowanie zależy od kodeka, wersji Chromium/Electron oraz samego pliku. Odtwarzacz pokazuje komunikat, gdy dany plik nie może zostać zdekodowany. Weryfikację konkretnych kodeków należy wykonywać na instalatorze zbudowanym dla wydania.
