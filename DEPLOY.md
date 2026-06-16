# Как пользоваться Workout без Mac

## Вариант 1 (рекомендуется): GitHub Pages — бесплатно, всегда онлайн

1. Создай репозиторий на GitHub, например `workout`
2. Залей файлы проекта
3. Settings → Pages → Source: `main` / `/ (root)`
4. Получишь URL: `https://<username>.github.io/workout/`
5. На iPhone в Safari открой этот URL
6. Поделиться → **На экран «Домой»**
7. Mac больше не нужен. Данные хранятся на телефоне.

## Вариант 2: Один файл через AirDrop (без сервера вообще)

1. На Mac в терминале:
   ```bash
   cd ~/Documents/projects/workout
   node scripts/build-standalone.mjs
   ```
2. AirDrop файл `standalone.html` на iPhone
3. Сохрани в **Файлы → На iPhone**
4. Открой файл → «Поделиться» → **Открыть в Safari**
5. В Safari: Поделиться → **На экран «Домой»**

Работает полностью офлайн. Обновления — снова AirDrop нового файла.

## Вариант 3: Локальный IP (только для первой установки)

`http://<IP-Mac>:8090` — Mac нужен только чтобы один раз установить.
После установки с GitHub Pages или standalone — Mac не нужен.
