import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

/* Версия сборки для меню: дата и короткий хеш коммита, вшиваются на этапе
   сборки. Смысл один: service worker обновляет игру молча, и без видимой
   версии не понять, приехало обновление или смотришь на старый кэш. Руками
   версию не поднять и не забыть — она берётся из git самой сборкой. */
function buildStamp() {
  let s = new Date().toISOString().slice(0, 10);
  try { s += " · " + execSync("git rev-parse --short HEAD").toString().trim(); } catch (e) { /* без git — только дата */ }
  return s;
}

/* Service worker пишется плагином, а не руками, по одной причине: список файлов
   для предзагрузки должен содержать РЕАЛЬНОЕ имя бандла с хешем, а оно известно
   только после сборки. Список, набитый вручную, разойдётся с первым же билдом,
   и офлайн тихо перестанет работать.

   Хук — writeBundle, а не generateBundle, и это оплачено ошибкой: html-страницы
   Vite эмитит своим post-плагином ПОСЛЕ чужих generateBundle, поэтому mvp.html
   и index.html в список не попадали — офлайн-переход на mvp.html отдавал фолбэк
   с ГЛАВНОЙ игрой. В writeBundle всё уже лежит на диске, сканируем dist целиком.

   Версия кэша — хеш от СОДЕРЖИМОГО файлов, не от списка имён: правка одного
   лишь mvp.html (например, вписали ID счётчиков) не меняет ни одного имени, и
   версия-от-списка залипала бы — повторный посетитель вечно видел бы страницу
   без аналитики из старого кэша.

   skipWaiting + clients.claim: новый worker забирает управление сразу. Иначе
   классическая беда — человек не понимает, почему правки не приезжают неделями.
   Плата за это одна: уже открытая страница доживёт на старой версии до следующего
   открытия. */
function serviceWorker() {
  const walk = (dir, base = "") => {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name), base + e.name + "/") : [base + e.name]
    );
  };
  let outDir = "dist";
  return {
    name: "hv-service-worker",
    apply: "build",
    configResolved(c) { outDir = c.build.outDir; },
    writeBundle() {
      const onDisk = walk(outDir).filter((f) => f !== "sw.js" && !f.endsWith(".map")).sort();
      const files = ["./", ...onDisk];
      const h = crypto.createHash("sha1");
      for (const f of onDisk) { h.update(f); h.update(fs.readFileSync(path.join(outDir, f))); }
      const version = "hv-" + h.digest("hex").slice(0, 12);
      fs.writeFileSync(path.join(outDir, "sw.js"), `/* сгенерирован сборкой, править бесполезно */
const V = ${JSON.stringify(version)};
const FILES = ${JSON.stringify(files)};
const HOME = new URL("./", self.location).href;

self.addEventListener("install", (e) => {
  // reload, а не обычный fetch: GitHub Pages отдаёт max-age=600, и предзагрузка
  // рисковала бы положить в кэш прошлую сборку из HTTP-кэша браузера
  e.waitUntil(caches.open(V)
    .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* ignoreVary обязателен, и это не перестраховка. Vite вешает на модуль crossorigin,
   поэтому браузер шлёт Origin; сервер отвечает Vary: Origin; а предзагрузка ходила из
   worker'а без Origin. По правилам Vary это разные записи — бандл не находился в кэше,
   уходил в сеть и без неё падал. Отдаём свои же файлы по одному URL. */
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.type === "basic") {
        const copy = res.clone();
        caches.open(V).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => (req.mode === "navigate" ? caches.match(HOME, { ignoreVary: true }) : Promise.reject(new Error("офлайн")))))
  );
});
`);
    },
  };
}

export default defineConfig({
  // Проектная страница GitHub Pages живёт в подпапке /hvostoed/, поэтому база не корневая.
  base: "/hvostoed/",
  define: { __HV_BUILD__: JSON.stringify(buildStamp()) },
  build: {
    rollupOptions: {
      // Две страницы: игра целиком и MVP-поток для теста трафика (mvp-plan.md).
      // Service worker берёт обе из скана готового dist (writeBundle в плагине выше).
      input: {
        main: new URL("./index.html", import.meta.url).pathname,
        mvp: new URL("./mvp.html", import.meta.url).pathname,
      },
    },
  },
  plugins: [react(), serviceWorker()],
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: Boolean(process.env.PORT),
  },
});
