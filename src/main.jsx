import React from "react";
import { createRoot } from "react-dom/client";
import App from "../hvostoed.jsx";

createRoot(document.getElementById("root")).render(<App />);

/* Только в сборке: на дев-сервере worker кэшировал бы правки и мешал работать.
   Молча глотаем отказ — офлайн приятен, но игра без него полностью рабочая. */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js").catch(() => {});
  });
}
