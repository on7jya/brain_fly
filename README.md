# MaleCNS Tetris

Игра-тетрис, завязанная на **полном коннектоме ЦНС самца дрозофилы** (Google Research + HHMI Janelia, `male-cns:v1.0`).

Источник: [A connectomics milestone: Mapping the complete male fruit fly brain](https://research.google/blog/a-connectomics-milestone-mapping-the-complete-male-fruit-fly-brain/)

Это не симуляция всех 166 700 нейронов. Локально поднимается официальный каталог типов и визуально-моторный контур из статьи / Cell Type Explorer: **R1–R6 → … → LoVP92 → VES200m → DNg13**, плюс нисходящие нейроны `DNa02` и интернейроны VNC. Поле тетриса кодируется как зрительное поле, «решения» читаются с descending neurons.

## Запуск

```bash
cd /Users/on7j/Projects/brain_fly
python3 scripts/build_circuit.py   # если ещё нет data/processed/circuit.json
python3 server.py
```

Открой http://127.0.0.1:8080/

Перекачать публичные таблицы (аннотации GCS + каталог типов + страницы контура):

```bash
python3 scripts/fetch_mcns.py --skip-existing
python3 scripts/build_circuit.py
```

## Управление

- `←` `→` — сдвиг (или мозг сам)
- `↑` / `X` — поворот
- `↓` — мягкое падение
- `Shift` / `Enter` — хард-дроп
- `C` — удержать фигуру
- `B` — мозг мухи играет / человек играет
- `Space` / `P` — пауза / продолжить
- `R` — заново
- слайдер **Скорость** — темп падения и решений мозга
- клик по стадии конвейера — фильтр визуализации (`Все` сбрасывает)
- переключатель **нейропиль 3D** / **карта 2D**
- клик по нейрону — тултип со ссылками Explorer / Codex / FlyWire

Тур: http://127.0.0.1:8080/about.html

После правок UI сделай hard reload: `Cmd+Shift+R` (Mac) / `Ctrl+Shift+R`.

## Что скачано локально

- `data/raw/body-annotations-male-cns-v1.0-minconf-0.5.feather` — официальные аннотации (~14 MB, `gs://flyem-male-cns`)
- `data/raw/neurons.json` — 11 751 тип Cell Type Explorer (`male-cns:v1.0`)
- `data/raw/types/*.html` — синаптические таблицы DNg13, DNa02, LoVP92, VES200m, …

Полный граф весов (~0.5–1 GB) и EM-том в Neuroglancer не качаются. Смотреть том: [Neuroglancer MaleCNS](https://neuroglancer-demo.appspot.com/#!gs://flyem-male-cns/v1.0/male-cns-v1.0.jso).
