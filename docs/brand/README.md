# Аватарка бота

Три варианта в цветах карты — те же зелень, песок и вода, что в
`src/three/worldPalette.ts`, плюс лаймовый акцент интерфейса.

| Файл | Что это |
| --- | --- |
| `bot-a-ostrov-chasy.png` | островок и есть циферблат: камни по кругу вместо цифр, лаймовая стрелка |
| `bot-b-perekrestok.png` | композиция карты: четыре дороги сходятся к метке в центре |
| `bot-c-sekundomer.png` | секундомер, внутри — кусочек мира с холмом и ёлками |

Посмотреть все три разом, включая то, как их обрежет Telegram и как они
выглядят в списке чатов, — `варианты.png` (или `preview.html` в браузере).

**Сейчас на боте стоит Б — перекрёсток.**

## Как поменять

Bot API умеет ставить аватарку сам, BotFather для этого не нужен:

    curl -X POST "https://api.telegram.org/bot<ТОКЕН>/setMyProfilePhoto" \
      -F 'photo={"type":"static","photo":"attach://pic"}' \
      -F "pic=@docs/brand/bot-a-ostrov-chasy.png"

Проверить, что встало:
`https://api.telegram.org/bot<ТОКЕН>/getUserProfilePhotos?user_id=8757076259`

## Как они сделаны

`generate.mjs` рисует SVG кодом — многоугольники вместо кругов, грани
подсвечены с одной стороны, как на карте. Правится там же: цвета, углы,
количество ёлок.

    node docs/brand/generate.mjs

PNG из SVG снимаются браузером (512×512 — размер, который Telegram просит для
аватарки):

    chrome --headless --window-size=512,512 \
      --screenshot=docs/brand/bot-b-perekrestok.png \
      file:///.../docs/brand/bot-b-perekrestok.svg

## Иконка приложения — та же картинка

С созвона №7 у приложения и бота одно лицо: `public/favicon.svg`,
`icon-192.png`, `icon-512.png` и `apple-touch-icon.png` — это вариант Б.
Столбиков статистики (их рисовали ещё до карты) больше нет.

    node docs/brand/generate.mjs   # SVG: аватарки бота + public/favicon.svg
    node scripts/gen-icons.mjs     # PNG-размеры для телефона и вкладки

У иконки, в отличие от аватарки, скруглены углы: кружком её никто не обрежет —
ни вкладка браузера, ни главный экран телефона.
