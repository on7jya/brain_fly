# MaleCNS Tetris

Игра-тетрис, завязанная на **полном коннектоме ЦНС самца дрозофилы** (Google Research + HHMI Janelia, `male-cns:v1.0`), с переключателями ♀ FAFB / BANC / MANC / MAOL.

Источник: [A connectomics milestone: Mapping the complete male fruit fly brain](https://research.google/blog/a-connectomics-milestone-mapping-the-complete-male-fruit-fly-brain/)

Это не симуляция всех 166 700 нейронов. Локально поднимается официальный каталог типов и зрительно-моторный контур: **R1–R6 → … → LoVP92 → VES200m → DNg13**, плюс DNa02 и интернейроны VNC. Веса рёбер по возможности берутся из таблиц Cell Type Explorer.

## Стабильная версия

Текущая «замороженная» сборка:

| | |
|--|--|
| ветка | `stable/v1-tetris-brain` |
| тег | `stable-v1` |
| feature-ветка roadmap | `feat/codex-roadmap` |

Вернуться к стабильной:

```bash
cd /Users/on7j/Projects/brain_fly
git checkout stable-v1
# или: git checkout stable/v1-tetris-brain
python3 server.py
```

Снова к roadmap:

```bash
git checkout feat/codex-roadmap
python3 scripts/build_circuit.py && python3 scripts/build_datasets.py
python3 server.py
```

## Запуск

```bash
cd /Users/on7j/Projects/brain_fly
python3 scripts/build_circuit.py      # circuit_malecns.json (+ alias circuit.json)
python3 scripts/build_datasets.py     # fafb/banc/manc/maol + сравнение
python3 server.py
```

Открой http://127.0.0.1:8080/

Перекачать источники:

```bash
python3 scripts/fetch_mcns.py --skip-existing
python3 scripts/fetch_fafb.py --skip-existing   # по умолчанию — публичное GCS-зеркало (без Google)
python3 scripts/build_circuit.py --expand-partners 6
python3 scripts/build_datasets.py
```

### FAFB CSV (♀)

1. **Без логина (рекомендуется):** `python3 scripts/fetch_fafb.py` тянет lee-lab GCS (`fafb_783_meta` + `simple_edgelist`) и пишет `data/raw/fafb/*.csv.gz`. Нужен `pyarrow` (`uv pip install pyarrow`).
2. **Cookie Codex:** войди на https://codex.flywire.ai/api/download?dataset=fafb, скопируй Cookie → `export CODEX_COOKIE='...'` или файл `data/raw/fafb/.codex_cookie` (в `.gitignore`) → `python3 scripts/fetch_fafb.py --codex-only`.
3. **Вручную:** положи `consolidated_cell_types.csv.gz` и `connections_princeton.csv.gz` в `data/raw/fafb/`, затем `build_datasets.py`. Без CSV — scaffold весов.

## Новые возможности (roadmap)

1. **Реальные веса** — `build_circuit.py` предпочитает синаптические счётчики Explorer (`weight_source: explorer|heuristic|mirror`).
2. **Codex deep-link** — тултип / шапка: `?dataset=` + поиск типа (FAFB / MCNS / BANC…).
3. **♀↔♂ сравнение** — кнопка сравнения, `/api/compare` (реальные веса, если FAFB CSV есть; иначе scaffold).
4. **`scripts/fetch_fafb.py`** — публичное GCS-зеркало lee-lab (без Google) → CSV; иначе Codex + cookie / ручная выкладка; `STATUS.json`.
5. **Переключатель датасетов** — MaleCNS / FAFB / BANC / MANC·VNC / MAOL → `circuit_*.json`.
6. **Колонки** — overlay поля Tetris → optic columns L/R.
7. **Авто-расширение** — `--expand-partners N` (топ-партнёры ключевых типов, cap `--max-nodes`).
8. **NT-цвет** — окраска связей по нейротрансмиттеру (`nt_palette.json`).
9. **MANC VNC** — режим «только VNC/DN» (stub из MaleCNS + ссылка на neuPrint).
10. **Rate-сеть** — WebWorker (`web/rate_worker.js`) на тысячах syn-ops.
11. **Геймплей ♀/♂** — селект весов MaleCNS / FAFB / дуэль.
12. **Пути** — Pathways-inspired пресеты в контуре.
13. **Neuroglancer** — ссылки в шапке и тултипе (URL overlay).
14. **MAOL** — учебный optic-only режим (stub + ссылка Codex).

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
- переключатель **нейропиль 3D** / **карта 2D** / **Только активные**
- клик по нейрону — тултип Explorer / Codex / FlyWire / NG

Тур: http://127.0.0.1:8080/about.html

После правок UI: hard reload `Cmd+Shift+R` / `Ctrl+Shift+R`.

## Данные локально

- `data/raw/body-annotations-male-cns-v1.0-minconf-0.5.feather` — аннотации MaleCNS
- `data/raw/neurons.json` — 11 751 тип Cell Type Explorer
- `data/raw/types/*.html` — синаптические таблицы контура
- `data/processed/circuit_malecns.json` — основной игровой граф
- `data/processed/circuit_{fafb,banc,manc,maol}.json` — альтернативы
- `data/raw/fafb/STATUS.json` — статус загрузки FAFB (зеркало / cookie / scaffold)

Полный граф весов (~0.5–1 GB) и EM-том не качаются. Том: [Neuroglancer MaleCNS](https://neuroglancer-demo.appspot.com/#!gs://flyem-male-cns/v1.0/male-cns-v1.0.jso).
