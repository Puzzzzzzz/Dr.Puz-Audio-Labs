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

## Odtwarzanie jako set

- Na karcie playlisty wybierz przycisk BPM, aby lokalnie oszacować tempo jej utworów. Każde uruchomienie ponownie przelicza pliki, a detektor koryguje częste wskazania half-time, gdy puls w podwójnym tempie ma wystarczająco mocny sygnał.
- W Ustawieniach wybierz docelowe tempo setu w zakresie 60–180 BPM. Dla utworów z analizowanym BPM aplikacja dobiera indywidualną szybkość odtwarzania i zachowuje wysokość dźwięku.
- Włącz crossfade i wybierz 1, 2, 4, 8 lub 16 taktów w metrum 4/4. Pętla początku kolejnego utworu jest wcześniej odtwarzana po cichu w tempie setu; po cyklu zaczyna się miks, a pętla kończy się na granicy taktu.
- Analiza BPM wymaga dekodowalnego pliku audio do 256 MB. Nieobsługiwany plik pozostaje bez wyniku BPM.

## Kodeki i formaty

Lista w aplikacji określa typy plików rozpoznawane przez bibliotekę. Dekodowanie zależy od kodeka, wersji Chromium/Electron oraz samego pliku. Odtwarzacz pokazuje komunikat, gdy dany plik nie może zostać zdekodowany. Weryfikację konkretnych kodeków należy wykonywać na instalatorze zbudowanym dla wydania.
