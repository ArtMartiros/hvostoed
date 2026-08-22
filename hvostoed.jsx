import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Undo2, RotateCcw, Star, Play } from "lucide-react";

/* ================================================================
   ХВОСТОЕД — прототип v3
   Модель поражений: врезалась в препятствие — авария (уровень
   завален, но «Продолжить»/undo бесплатны); все пути закрыты —
   тупик. Лимита ходов больше нет. Все уровни проверены
   брутфорс-солвером.
   ================================================================ */

const CS = 100;

const COLORS = {
  green:  { fill: "#58A942", dark: "#3C7A2C", nom: "зелёная",    gen: "зелёной" },
  blue:   { fill: "#3D7BE0", dark: "#2856A8", nom: "синяя",      gen: "синей" },
  orange: { fill: "#F0912D", dark: "#B96613", nom: "оранжевая",  gen: "оранжевой" },
  plum:   { fill: "#9C56D9", dark: "#6F35A5", nom: "фиолетовая", gen: "фиолетовой" },
  pink:   { fill: "#E2519A", dark: "#AC2F6E", nom: "розовая",    gen: "розовой" },
  teal:   { fill: "#23B5A3", dark: "#0F8375", nom: "бирюзовая",  gen: "бирюзовой" },
  red:    { fill: "#E05548", dark: "#A93327", nom: "красная",    gen: "красной" },
  spiky:  { fill: "#8A9163", dark: "#535A33", nom: "колючая",    gen: "колючей" },
};
const ORDER = ["green", "blue", "orange", "plum", "pink", "teal", "red"];

/* ---------- уровни (все данные прогнаны через солвер) ---------- */
const RAW_LEVELS = [
  {
    name: "Разминка", lesson: "Тапни змею — она съест хвост, на который смотрит.",
    w: 7, h: 5, target: 6,
    snakes: [
      { cells: [[1, 2], [0, 2]] },
      { cells: [[4, 2], [3, 2]] },
      { cells: [[6, 2], [5, 2]] },
    ],
  },
  {
    name: "Цепочка", lesson: "После обеда змея смотрит туда же, куда смотрела съеденная.",
    w: 7, h: 7, target: 9,
    snakes: [
      { cells: [[1, 3], [0, 3], [0, 4], [1, 4]] },
      { cells: [[3, 1], [3, 0]] },
      { cells: [[4, 4], [4, 5], [3, 5]] },
    ],
  },
  {
    name: "Жертва", lesson: "Кого-то придётся выпустить с поля, чтобы открыть дорогу.",
    w: 7, h: 6, target: 8,
    snakes: [
      { cells: [[1, 2], [0, 2]] },
      { cells: [[6, 3], [6, 2], [5, 2], [4, 2]] },
      { cells: [[5, 5], [6, 5]] },
      { cells: [[3, 2], [3, 3]] },
    ],
  },
  {
    name: "Впритык", lesson: "Длины хватает ровно на одну жертву. Выбери верную.",
    w: 7, h: 6, target: 12,
    snakes: [
      { cells: [[3, 2], [2, 2]] },
      { cells: [[0, 0], [0, 1], [1, 1]] },
      { cells: [[6, 5], [6, 4], [6, 3], [6, 2]] },
      { cells: [[2, 1], [2, 0], [1, 0]] },
      { cells: [[1, 4], [1, 5], [0, 5]] },
    ],
  },
  {
    name: "Клубок", lesson: "Съешь всё поле. Терять нельзя никого.",
    w: 6, h: 6, target: 23,
    snakes: [
      { cells: [[0, 3], [0, 4], [0, 5], [1, 5], [1, 4], [2, 4]] },
      { cells: [[3, 1], [3, 0], [2, 0], [2, 1]] },
      { cells: [[4, 3], [5, 3], [5, 4]] },
      { cells: [[2, 3], [2, 2], [3, 2], [3, 3]] },
      { cells: [[5, 2], [5, 1], [4, 1], [4, 2]] },
      { cells: [[1, 1], [0, 1]] },
    ],
  },
  {
    name: "Пир", lesson: "Маленькая зелёная против всех. Съешь всё поле.",
    w: 7, h: 7, target: 38,
    snakes: [
      { cells: [[4, 0], [3, 0]] },
      { cells: [[4, 4], [4, 5], [5, 5]] },
      { cells: [[5, 4], [5, 3], [6, 3], [6, 2], [5, 2], [5, 1], [6, 1], [6, 0], [5, 0]] },
      { cells: [[0, 6], [1, 6], [1, 5], [2, 5], [3, 5], [3, 4], [3, 3]] },
      { cells: [[1, 0], [2, 0], [2, 1], [2, 2], [3, 2], [3, 1], [4, 1], [4, 2], [4, 3]] },
      { cells: [[2, 3], [1, 3], [1, 4], [0, 4], [0, 3], [0, 2], [0, 1], [0, 0]] },
    ],
  },
  {
    name: "Валуны", lesson: "Валун не съесть и не сдвинуть — взгляд в него упирается.",
    w: 7, h: 6, target: 9,
    rocks: [[3, 0], [3, 1], [3, 2], [3, 4], [3, 5]],
    snakes: [
      { cells: [[1, 3], [0, 3]] },
      { cells: [[5, 3], [5, 2], [4, 2], [4, 3]] },
      { cells: [[6, 4], [6, 5], [5, 5]] },
      { cells: [[2, 1], [1, 1]] },
    ],
  },
  {
    name: "Колючка", lesson: "Колючую не съесть. Но она тоже голодна — покорми её, чтобы сдвинуть.",
    w: 7, h: 6, target: 8,
    snakes: [
      { cells: [[1, 2], [0, 2]] },
      { cells: [[3, 2], [3, 1]], spiky: true },
      { cells: [[2, 5], [3, 5]] },
      { cells: [[5, 1], [5, 2], [4, 2]] },
      { cells: [[6, 1], [6, 0], [5, 0]] },
      { cells: [[1, 1], [0, 1]] },
    ],
  },
  {
    name: "Прицел", lesson: "Взгляд в чужое тело — авария. Тапай лишь тех, кто видит хвост.",
    w: 5, h: 5, target: 7,
    snakes: [
      { cells: [[3, 3], [3, 4]] },
      { cells: [[2, 1], [3, 1], [3, 2]] },
      { cells: [[0, 2], [0, 1]] },
      { cells: [[2, 3], [2, 4]] },
    ],
  },
  {
    name: "Очередь", lesson: "Обед подтягивает хвост — и очередь доходит до соседа.",
    w: 7, h: 6, target: 10,
    snakes: [
      { cells: [[2, 1], [1, 1], [0, 1]] },
      { cells: [[5, 1], [4, 1]] },
      { cells: [[5, 0], [6, 0], [6, 1]] },
      { cells: [[1, 4], [1, 5]] },
      { cells: [[4, 3], [5, 3]] },
    ],
  },
  {
    name: "Привратница", lesson: "Хвост колючей запер щель. Покорми её — хвост выйдет сам.",
    w: 7, h: 6, target: 8,
    rocks: [[4, 0], [4, 1], [5, 3], [6, 3]],
    snakes: [
      { cells: [[4, 3], [4, 2]], spiky: true },
      { cells: [[3, 5], [4, 5]] },
      { cells: [[2, 2], [1, 2]] },
      { cells: [[1, 3], [1, 4]] },
      { cells: [[6, 0], [5, 0], [5, 1], [5, 2]] },
    ],
  },
  {
    name: "Ёж", lesson: "Хвост колючей — тоже мина. Покорми её, и хвост уползёт.",
    w: 6, h: 6, target: 9,
    rocks: [[0, 1]],
    snakes: [
      { cells: [[3, 1], [4, 1], [5, 1]], spiky: true },
      { cells: [[1, 0], [1, 1]] },
      { cells: [[5, 2], [5, 3], [4, 3]] },
      { cells: [[4, 0], [5, 0]] },
      { cells: [[5, 4], [5, 5], [4, 5], [3, 5]] },
      { cells: [[3, 4], [2, 4]] },
    ],
  },
  {
    name: "Сквозняк", lesson: "Освободи коридор — и прокатись через всю пустоту.",
    w: 7, h: 7, target: 7,
    snakes: [
      { cells: [[1, 3], [0, 3]] },
      { cells: [[4, 3], [4, 2]] },
      { cells: [[3, 6], [4, 6]] },
      { cells: [[6, 1], [6, 2], [6, 3]] },
      { cells: [[5, 0], [6, 0]] },
    ],
  },
  {
    name: "Шлюз", lesson: "Напрямик через две щели не пройти. Съешь — развернёшься.",
    w: 7, h: 7, target: 11,
    rocks: [[2, 0], [2, 1], [2, 2], [2, 3], [2, 5], [2, 6], [3, 1], [4, 1], [6, 1]],
    snakes: [
      { cells: [[1, 4], [0, 4]] },
      { cells: [[5, 2], [5, 3], [5, 4], [4, 4], [3, 4]] },
      { cells: [[6, 0], [5, 0]] },
      { cells: [[0, 3], [0, 2]] },
      { cells: [[6, 5], [6, 6]] },
      { cells: [[1, 1], [0, 1]] },
      { cells: [[3, 2], [3, 3]] },
    ],
  },
  {
    name: "Сапёр", lesson: "Поле заминировано взглядами. Иди по цепочке хвостов.",
    w: 6, h: 6, target: 12,
    snakes: [
      { cells: [[3, 2], [3, 3]] },
      { cells: [[1, 1], [2, 1], [3, 1]] },
      { cells: [[0, 3], [0, 2], [0, 1]] },
      { cells: [[3, 5], [2, 5], [1, 5], [0, 5]] },
      { cells: [[2, 2], [2, 3]] },
      { cells: [[1, 4], [1, 3]] },
      { cells: [[4, 2], [5, 2]] },
    ],
  },
  {
    name: "Карман", lesson: "Из кармана не выходят. Загляни туда последним ходом.",
    w: 7, h: 5, target: 9,
    rocks: [[5, 2], [6, 1]],
    snakes: [
      { cells: [[2, 4], [3, 4]] },
      { cells: [[2, 1], [1, 1], [0, 1]] },
      { cells: [[0, 3], [0, 4]] },
      { cells: [[5, 1], [4, 1]] },
      { cells: [[5, 3], [5, 4]] },
    ],
  },
  {
    name: "Мельница", lesson: "Половина тапов — в камень. Читай направления, не тыкай.",
    w: 7, h: 7, target: 9,
    rocks: [[3, 2], [2, 3], [4, 3], [3, 4]],
    snakes: [
      { cells: [[1, 0], [0, 0]] },
      { cells: [[6, 1], [6, 0]] },
      { cells: [[5, 6], [6, 6]] },
      { cells: [[0, 5], [0, 6]] },
      { cells: [[2, 2], [1, 2]] },
      { cells: [[4, 2], [4, 1]] },
      { cells: [[4, 4], [5, 4]] },
      { cells: [[1, 4], [0, 4]] },
    ],
  },
  {
    name: "Размен", lesson: "Обе малышки просятся на волю. Отпусти ту, что стоит стеной.",
    w: 7, h: 6, target: 10,
    snakes: [
      { cells: [[1, 4], [0, 4], [0, 5]] },
      { cells: [[4, 3], [4, 4]] },
      { cells: [[2, 1], [3, 1], [4, 1]] },
      { cells: [[1, 0], [1, 1]] },
      { cells: [[3, 4], [3, 3]] },
    ],
  },
  {
    name: "Самозванец", lesson: "Запертый — не всегда герой. Стоящий у выхода — не всегда жертва.",
    w: 7, h: 6, target: 9,
    snakes: [
      { cells: [[2, 3], [1, 3]] },
      { cells: [[4, 4], [4, 3], [4, 2]] },
      { cells: [[3, 5], [2, 5]] },
      { cells: [[6, 4], [6, 5]] },
      { cells: [[6, 0], [6, 1]] },
    ],
  },
  {
    name: "Западня", lesson: "Колючая гостья легла поперёк поля. Выпусти её вовремя — и съешь всё.",
    w: 7, h: 7, target: 30,
    snakes: [
      { cells: [[2, 1], [1, 1], [0, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [4, 3]] },
      { cells: [[5, 0], [4, 0], [4, 1]] },
      { cells: [[4, 4], [4, 5], [3, 5], [3, 4]] },
      { cells: [[2, 5], [1, 5], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [6, 6], [6, 5]] },
      { cells: [[6, 4], [6, 3], [5, 3], [5, 4], [5, 5]] },
      { cells: [[3, 0], [3, 1]], spiky: true },
    ],
  },
  {
    name: "Глубокая пробка", lesson: "Пробка в две клетки: корми дважды — потом выдёргивай.",
    w: 7, h: 6, target: 10,
    rocks: [[3, 0], [4, 0], [3, 2], [4, 2], [2, 5], [5, 3], [6, 3], [6, 4]],
    snakes: [
      { cells: [[2, 2], [2, 1], [3, 1], [4, 1]], spiky: true },
      { cells: [[3, 4], [2, 4]] },
      { cells: [[5, 5], [5, 4]] },
      { cells: [[1, 1], [0, 1]] },
      { cells: [[0, 4], [0, 5]] },
      { cells: [[5, 2], [6, 2], [6, 1], [6, 0], [5, 0], [5, 1]] },
    ],
  },
  {
    name: "Крошки", lesson: "Великана тоже съедят — до последней клетки.",
    w: 7, h: 7, target: 33,
    rocks: [[3, 1], [4, 0], [5, 1]],
    snakes: [
      { cells: [[5, 6], [6, 6]] },
      { cells: [[1, 0], [0, 0], [0, 1]] },
      { cells: [[1, 6], [2, 6], [2, 5]] },
      { cells: [[3, 6], [4, 6]] },
      { cells: [[0, 3], [0, 4], [1, 4], [1, 5], [0, 5], [0, 6]] },
      { cells: [[6, 2], [6, 3], [6, 4], [6, 5], [5, 5], [4, 5], [4, 4], [4, 3], [3, 3], [3, 4], [2, 4], [2, 3], [1, 3], [1, 2], [1, 1], [2, 1], [2, 0]] },
    ],
  },
  {
    name: "Этикет", lesson: "Никто не начинает раньше старших. И никто не переедает.",
    w: 5, h: 6, target: 12,
    snakes: [
      { cells: [[2, 3], [1, 3]] },
      { cells: [[4, 2], [4, 3], [4, 4]] },
      { cells: [[3, 0], [4, 0]] },
      { cells: [[0, 2], [0, 1], [0, 0]] },
      { cells: [[1, 5], [0, 5]] },
    ],
  },
  {
    name: "Гордость", lesson: "Все смотрят на выход. Отпустить придётся самую большую.",
    w: 7, h: 5, target: 10,
    snakes: [
      { cells: [[1, 0], [0, 0]] },
      { cells: [[3, 0], [3, 1], [3, 2], [4, 2], [4, 1], [5, 1]] },
      { cells: [[5, 0], [4, 0]] },
      { cells: [[6, 1], [6, 0]] },
      { cells: [[5, 3], [6, 3]] },
      { cells: [[1, 4], [1, 3]] },
    ],
  },
  {
    name: "Обжора", lesson: "Колючую не съесть — она обязана съесть всех сама.",
    w: 7, h: 7, target: 30,
    snakes: [
      { cells: [[4, 1], [3, 1], [3, 0], [4, 0]], spiky: true },
      { cells: [[6, 3], [6, 2]] },
      { cells: [[3, 2], [4, 2], [5, 2]] },
      { cells: [[5, 3], [5, 4], [4, 4], [4, 3]] },
      { cells: [[6, 1], [6, 0], [5, 0], [5, 1]] },
      { cells: [[0, 1], [0, 0], [1, 0], [2, 0], [2, 1], [1, 1], [1, 2]] },
      { cells: [[4, 5], [4, 6], [5, 6], [5, 5], [6, 5], [6, 4]] },
    ],
  },
];

/* ---------- пак 2 «Пустота»: без валунов и колючек, ставка на переезд тела ---------- */
const RAW_LEVELS_VOID = [
  {
    name: "Хоровод", lesson: "Тапни змею — она проглотит хвост, на который смотрит.",
    w: 5, h: 3, target: 8,
    snakes: [
      { cells: [[1, 0], [0, 0]] },
      { cells: [[3, 2], [4, 2], [4, 1], [4, 0]] },
      { cells: [[0, 1], [0, 2]] },
    ],
  },
  {
    name: "Взгляд", lesson: "После обеда змея смотрит туда же, куда смотрела съеденная.",
    w: 5, h: 4, target: 7,
    snakes: [
      { cells: [[1, 3], [0, 3]] },
      { cells: [[3, 1], [3, 2], [3, 3]] },
      { cells: [[4, 0], [3, 0]] },
    ],
  },
  {
    name: "Прицел", lesson: "Хвост — это обед. Голова или тело на пути — авария.",
    w: 5, h: 4, target: 7,
    snakes: [
      { cells: [[2, 1], [2, 2], [2, 3]] },
      { cells: [[1, 3], [0, 3]] },
      { cells: [[3, 0], [2, 0]] },
      { cells: [[3, 2], [4, 2]] },
    ],
  },
  {
    name: "Переезд", lesson: "Змея ест издалека — и переезжает сама. Её хвост окажется в новом месте.",
    w: 7, h: 6, target: 8,
    snakes: [
      { cells: [[3, 3], [2, 3], [1, 3], [0, 3]] },
      { cells: [[6, 2], [6, 3]] },
      { cells: [[2, 1], [2, 0]] },
      { cells: [[2, 4], [2, 5]] },
    ],
  },
  {
    name: "Затор", lesson: "Некого есть? Выпусти змею с поля — дорога откроется.",
    w: 7, h: 5, target: 6,
    snakes: [
      { cells: [[3, 0], [3, 1], [3, 2], [3, 3], [3, 4]] },
      { cells: [[1, 2], [0, 2]] },
      { cells: [[5, 1], [5, 2]] },
      { cells: [[6, 0], [5, 0]] },
    ],
  },
  {
    name: "Тесный угол", lesson: "Далёкий обед уводит тело целиком — и строка освобождается.",
    w: 7, h: 6, target: 8,
    snakes: [
      { cells: [[3, 3], [3, 4], [3, 5]] },
      { cells: [[4, 0], [3, 0]] },
      { cells: [[1, 4], [0, 4]] },
      { cells: [[5, 3], [6, 3], [6, 4]] },
    ],
  },
  {
    name: "Цепочка", lesson: "Цепочка тянется через всё поле. Вопрос — с какого звена начать.",
    w: 7, h: 6, target: 9,
    snakes: [
      { cells: [[1, 2], [1, 3]] },
      { cells: [[2, 0], [1, 0]] },
      { cells: [[5, 2], [5, 1], [5, 0]] },
      { cells: [[3, 5], [4, 5], [5, 5]] },
      { cells: [[0, 4], [0, 5]] },
    ],
  },
  {
    name: "Уведи хвост", lesson: "Свой хвост можно убрать с чужого луча. Тогда луч найдёт добычу покрупнее.",
    w: 7, h: 5, target: 8,
    snakes: [
      { cells: [[1, 0], [0, 0]] },
      { cells: [[2, 2], [2, 1], [2, 0]] },
      { cells: [[3, 4], [2, 4]] },
      { cells: [[6, 4], [6, 3], [6, 2], [6, 1], [6, 0], [5, 0]] },
    ],
  },
  {
    name: "Два переезда", lesson: "Две стены. Одна уедет совсем, вторая подставит хвост. Порядок любой.",
    w: 7, h: 7, target: 7,
    snakes: [
      { cells: [[1, 2], [0, 2]] },
      { cells: [[3, 3], [3, 2], [3, 1]] },
      { cells: [[4, 6], [3, 6]] },
      { cells: [[5, 3], [5, 2], [5, 1]] },
      { cells: [[6, 5], [5, 5]] },
    ],
  },
  {
    name: "Кольцо", lesson: "Всё поле — одно кольцо. Собери его в одну змею и не разорви пополам.",
    w: 7, h: 7, target: 14,
    snakes: [
      { cells: [[1, 0], [0, 0]] },
      { cells: [[4, 0], [3, 0]] },
      { cells: [[6, 2], [6, 1], [6, 0]] },
      { cells: [[5, 6], [6, 6]] },
      { cells: [[2, 6], [3, 6]] },
      { cells: [[0, 4], [0, 5], [0, 6]] },
    ],
  },
  {
    name: "Балласт", lesson: "Цель меньше поля: одна змея лишняя. Отпусти её — дорога откроется.",
    w: 7, h: 7, target: 29,
    snakes: [
      { cells: [[1, 1], [2, 1], [2, 0]] },
      { cells: [[6, 2], [5, 2], [5, 1]] },
      { cells: [[4, 0], [5, 0], [6, 0]] },
      { cells: [[5, 5], [6, 5], [6, 6], [5, 6]] },
      { cells: [[1, 2], [2, 2], [3, 2], [3, 1], [4, 1], [4, 2], [4, 3], [3, 3], [3, 4], [2, 4], [2, 3], [1, 3], [0, 3], [0, 2], [0, 1]] },
      { cells: [[5, 3], [5, 4], [4, 4], [4, 5]] },
    ],
  },
  {
    name: "Пошлина", lesson: "За проход платят длиной. Кем платить — решай сам, путей несколько.",
    w: 8, h: 8, target: 40,
    snakes: [
      { cells: [[4, 3], [5, 3], [5, 2]] },
      { cells: [[1, 7], [0, 7], [0, 6], [1, 6], [2, 6], [2, 5], [2, 4]] },
      { cells: [[3, 2], [2, 2], [2, 3], [1, 3], [0, 3], [0, 2], [1, 2], [1, 1], [1, 0]] },
      { cells: [[3, 6], [3, 5]] },
      { cells: [[4, 0], [3, 0], [3, 1], [2, 1]] },
      { cells: [[3, 4], [3, 3]] },
      { cells: [[5, 1], [6, 1], [6, 2], [6, 3], [7, 3], [7, 4], [7, 5], [6, 5], [5, 5], [5, 4], [4, 4], [4, 5], [4, 6], [5, 6], [6, 6], [7, 6], [7, 7]] },
    ],
  },
  {
    name: "Отступные", lesson: "Двух змей придётся отпустить. Смотри на запас в шапке.",
    w: 8, h: 9, target: 41,
    snakes: [
      { cells: [[5, 3], [5, 4], [4, 4], [4, 5]] },
      { cells: [[7, 5], [7, 6], [6, 6]] },
      { cells: [[1, 3], [1, 2], [1, 1], [0, 1]] },
      { cells: [[5, 5], [6, 5], [6, 4], [6, 3], [7, 3]] },
      { cells: [[5, 7], [5, 6]] },
      { cells: [[3, 6], [3, 5], [2, 5], [2, 4], [3, 4], [3, 3], [4, 3], [4, 2], [3, 2], [3, 1], [4, 1], [4, 0], [5, 0], [5, 1], [6, 1], [6, 2], [5, 2]] },
      { cells: [[6, 7], [6, 8]] },
      { cells: [[4, 7], [4, 6]] },
      { cells: [[3, 7], [2, 7], [2, 6], [1, 6], [1, 5], [1, 4]] },
    ],
  },
  {
    name: "Долгий счёт", lesson: "Десять змей и две жертвы. Посчитай запас, прежде чем тапать.",
    w: 9, h: 9, target: 54,
    snakes: [
      { cells: [[2, 5], [1, 5], [1, 4], [0, 4], [0, 5], [0, 6]] },
      { cells: [[4, 0], [3, 0], [2, 0]] },
      { cells: [[4, 2], [4, 1], [3, 1], [3, 2], [3, 3], [4, 3], [4, 4], [4, 5], [5, 5], [5, 4], [6, 4], [7, 4], [8, 4], [8, 3]] },
      { cells: [[6, 6], [6, 5]] },
      { cells: [[7, 5], [8, 5], [8, 6], [7, 6], [7, 7], [7, 8], [8, 8]] },
      { cells: [[3, 7], [3, 6], [2, 6]] },
      { cells: [[7, 3], [6, 3], [5, 3], [5, 2], [6, 2], [7, 2], [7, 1], [6, 1], [5, 1], [5, 0]] },
      { cells: [[4, 6], [5, 6], [5, 7], [6, 7]] },
      { cells: [[1, 7], [1, 6]] },
      { cells: [[2, 1], [2, 2], [1, 2], [1, 3], [2, 3], [2, 4], [3, 4], [3, 5]] },
    ],
  },
  {
    name: "Обвал", lesson: "Одиннадцать змей должны стать одной. Веди одну цепь и не начинай вторую.",
    w: 9, h: 11, target: 62,
    snakes: [
      { cells: [[6, 6], [6, 5], [5, 5]] },
      { cells: [[6, 8], [6, 7]] },
      { cells: [[5, 8], [5, 9], [5, 10], [4, 10], [4, 9], [4, 8], [4, 7], [3, 7]] },
      { cells: [[5, 6], [5, 7]] },
      { cells: [[1, 6], [0, 6], [0, 5], [0, 4], [1, 4], [1, 3], [1, 2], [0, 2], [0, 3]] },
      { cells: [[8, 2], [8, 3]] },
      { cells: [[2, 4], [2, 3], [3, 3], [3, 2], [3, 1], [4, 1], [5, 1], [5, 2], [6, 2], [6, 3], [6, 4], [7, 4]] },
      { cells: [[8, 6], [8, 7], [7, 7], [7, 8], [7, 9], [6, 9], [6, 10]] },
      { cells: [[7, 2], [7, 1], [7, 0], [8, 0]] },
      { cells: [[3, 8], [3, 9], [2, 9], [1, 9], [1, 8], [0, 8], [0, 7], [1, 7], [2, 7], [2, 6]] },
      { cells: [[8, 4], [8, 5], [7, 5]] },
    ],
  },
  {
    name: "Колодец", lesson: "Тупик близко: сначала прикинь весь путь, потом тапай.",
    w: 8, h: 10, target: 58,
    snakes: [
      { cells: [[5, 1], [4, 1], [4, 0], [3, 0]] },
      { cells: [[5, 3], [5, 2], [4, 2], [4, 3], [3, 3], [3, 4], [4, 4], [4, 5]] },
      { cells: [[3, 1], [3, 2], [2, 2], [2, 1], [1, 1], [1, 2], [0, 2], [0, 3], [0, 4], [1, 4], [1, 5], [0, 5]] },
      { cells: [[4, 9], [5, 9], [5, 8]] },
      { cells: [[1, 8], [0, 8], [0, 9], [1, 9]] },
      { cells: [[0, 6], [0, 7], [1, 7], [1, 6], [2, 6]] },
      { cells: [[3, 6], [3, 7], [4, 7], [4, 8], [3, 8]] },
      { cells: [[3, 5], [2, 5], [2, 4]] },
      { cells: [[6, 8], [7, 8], [7, 7], [6, 7], [6, 6], [7, 6], [7, 5], [7, 4], [6, 4], [6, 5], [5, 5], [5, 4]] },
      { cells: [[2, 7], [2, 8]] },
    ],
  },
  {
    name: "Простор", lesson: "Места много, и дорог тоже. Веди одну змею — какой дорогой, решай сам.",
    w: 10, h: 14, target: 92,
    snakes: [
      { cells: [[4, 10], [3, 10], [3, 9], [4, 9], [4, 8], [5, 8], [5, 7], [4, 7], [4, 6], [5, 6], [6, 6], [6, 5], [5, 5]] },
      { cells: [[4, 5], [3, 5], [3, 6], [3, 7], [3, 8], [2, 8], [1, 8], [1, 7], [2, 7], [2, 6], [1, 6], [0, 6]] },
      { cells: [[0, 7], [0, 8], [0, 9]] },
      { cells: [[8, 5], [7, 5], [7, 4]] },
      { cells: [[1, 3], [2, 3], [2, 2], [3, 2], [3, 1], [4, 1], [4, 2], [5, 2], [5, 1]] },
      { cells: [[6, 1], [7, 1], [7, 2], [8, 2], [8, 3], [8, 4], [9, 4]] },
      { cells: [[1, 9], [2, 9], [2, 10]] },
      { cells: [[5, 10], [5, 9], [6, 9], [6, 8], [6, 7], [7, 7], [7, 6], [8, 6], [8, 7], [9, 7], [9, 6], [9, 5]] },
      { cells: [[3, 4], [2, 4], [2, 5]] },
      { cells: [[9, 2], [9, 1], [9, 0], [8, 0], [8, 1]] },
      { cells: [[1, 10], [0, 10], [0, 11], [1, 11], [2, 11], [3, 11], [3, 12], [2, 12], [1, 12], [0, 12], [0, 13], [1, 13], [2, 13], [3, 13], [4, 13], [4, 12], [4, 11], [5, 11]] },
      { cells: [[1, 5], [0, 5], [0, 4], [0, 3]] },
    ],
  },
  {
    name: "Перекрёсток", lesson: "Начать можно с любой змеи. А вот свернуть не туда — тупик.",
    w: 10, h: 12, target: 81,
    snakes: [
      { cells: [[7, 7], [8, 7], [8, 6], [9, 6]] },
      { cells: [[9, 7], [9, 8]] },
      { cells: [[5, 0], [6, 0]] },
      { cells: [[7, 3], [7, 4]] },
      { cells: [[5, 5], [5, 6], [4, 6], [4, 7]] },
      { cells: [[6, 4], [5, 4]] },
      { cells: [[8, 0], [9, 0], [9, 1], [8, 1]] },
      { cells: [[8, 9], [9, 9], [9, 10], [8, 10], [7, 10], [6, 10], [6, 11], [5, 11], [4, 11], [3, 11], [3, 10], [2, 10], [2, 11], [1, 11], [1, 10], [0, 10], [0, 9], [0, 8]] },
      { cells: [[4, 8], [3, 8], [3, 7], [3, 6], [2, 6], [2, 7], [1, 7], [1, 8], [1, 9], [2, 9], [3, 9], [4, 9], [4, 10], [5, 10], [5, 9]] },
      { cells: [[8, 8], [7, 8]] },
      { cells: [[4, 1], [3, 1], [3, 2], [2, 2], [2, 1], [2, 0], [1, 0], [1, 1]] },
      { cells: [[0, 7], [0, 6], [1, 6], [1, 5], [2, 5], [3, 5], [4, 5], [4, 4], [3, 4], [3, 3], [4, 3], [4, 2], [5, 2], [5, 3], [6, 3], [6, 2], [7, 2], [7, 1]] },
    ],
  },
  {
    name: "Пустошь", lesson: "Самая длинная цепь в игре. Считай наперёд, пустоты помогут переехать.",
    w: 10, h: 14, target: 92,
    snakes: [
      { cells: [[4, 0], [5, 0]] },
      { cells: [[7, 12], [7, 13], [8, 13], [8, 12]] },
      { cells: [[5, 7], [6, 7], [6, 6], [7, 6], [7, 7], [8, 7], [8, 6], [9, 6]] },
      { cells: [[2, 10], [1, 10], [1, 9], [0, 9], [0, 8]] },
      { cells: [[0, 4], [0, 3], [1, 3], [2, 3], [2, 2], [3, 2], [3, 1], [2, 1], [1, 1], [1, 2], [0, 2], [0, 1], [0, 0], [1, 0], [2, 0], [3, 0]] },
      { cells: [[8, 0], [9, 0]] },
      { cells: [[7, 10], [6, 10], [6, 11], [7, 11]] },
      { cells: [[8, 8], [7, 8], [6, 8], [5, 8], [4, 8], [3, 8], [3, 7], [2, 7], [2, 6], [3, 6], [3, 5], [4, 5], [4, 4], [5, 4], [6, 4], [6, 5], [7, 5], [8, 5], [9, 5], [9, 4], [8, 4], [7, 4], [7, 3], [6, 3], [5, 3], [4, 3], [3, 3], [3, 4], [2, 4], [2, 5], [1, 5], [1, 6], [1, 7], [1, 8], [2, 8], [2, 9]] },
      { cells: [[8, 9], [9, 9], [9, 10]] },
      { cells: [[5, 5], [5, 6], [4, 6], [4, 7]] },
      { cells: [[9, 7], [9, 8]] },
      { cells: [[5, 1], [5, 2], [6, 2], [6, 1], [7, 1], [7, 0]] },
    ],
  },
];


/* ---------- режим рекорда ----------
   Поле без цели: играешь, пока есть кого есть, счёт — самая длинная змея за партию.
   Поле нарезано из одного пути с зазорами, поэтому цепь «съесть всё» существует
   по построению (ceiling проверяется симуляцией в records.mjs), но каждая еда через
   зазор утаскивает хвост едока и рвёт чужие прицелы — порядок решает.
   Случайная игра берёт медианой 36 из 140, лучшая известная линия — все 140 за 28 ходов. */
const RAW_FIELDS = [
  {
    name: "Большая пустошь",
    lesson: "Цели нет — расти, пока есть кого есть. Счёт — самая длинная змея за партию.",
    w: 12, h: 16, ceiling: 140, proof: "chain", mass: 140, marks: [60, 95, 125],
    snakes: [
      { cells: [[5, 14], [4, 14], [3, 14]] },
      { cells: [[2, 14], [1, 14], [1, 13], [0, 13], [0, 14], [0, 15]] },
      { cells: [[2, 15], [3, 15]] },
      { cells: [[4, 15], [5, 15], [6, 15], [6, 14], [7, 14], [7, 15]] },
      { cells: [[9, 15], [10, 15], [11, 15], [11, 14], [11, 13], [11, 12], [11, 11]] },
      { cells: [[11, 10], [11, 9], [11, 8], [10, 8]] },
      { cells: [[10, 10], [10, 11], [9, 11], [9, 10], [8, 10], [8, 11], [8, 12]] },
      { cells: [[5, 12], [4, 12], [4, 13]] },
      { cells: [[3, 13], [2, 13], [2, 12], [3, 12], [3, 11], [4, 11]] },
      { cells: [[4, 10], [4, 9], [5, 9], [5, 8], [6, 8]] },
      { cells: [[6, 9], [6, 10], [5, 10], [5, 11], [6, 11], [7, 11]] },
      { cells: [[7, 9], [7, 8], [8, 8], [8, 9], [9, 9]] },
      { cells: [[9, 8], [9, 7]] },
      { cells: [[7, 7], [6, 7], [5, 7], [5, 6]] },
      { cells: [[6, 6], [7, 6], [7, 5], [8, 5], [8, 6]] },
      { cells: [[9, 6], [10, 6], [10, 7], [11, 7], [11, 6], [11, 5]] },
      { cells: [[10, 5], [9, 5], [9, 4], [9, 3], [9, 2], [9, 1], [10, 1]] },
      { cells: [[10, 2], [10, 3], [10, 4], [11, 4], [11, 3]] },
      { cells: [[11, 2], [11, 1], [11, 0]] },
      { cells: [[9, 0], [8, 0]] },
      { cells: [[8, 2], [8, 3], [8, 4]] },
      { cells: [[7, 4], [6, 4], [6, 5], [5, 5]] },
      { cells: [[5, 4], [5, 3], [6, 3], [7, 3], [7, 2], [6, 2]] },
      { cells: [[5, 2], [4, 2], [4, 1], [5, 1], [6, 1], [7, 1], [7, 0]] },
      { cells: [[5, 0], [4, 0], [3, 0], [2, 0], [1, 0], [0, 0], [0, 1]] },
      { cells: [[2, 1], [3, 1], [3, 2]] },
      { cells: [[2, 2], [1, 2], [0, 2], [0, 3], [1, 3], [1, 4], [0, 4]] },
      { cells: [[0, 6], [0, 7]] },
      { cells: [[1, 7], [2, 7], [3, 7], [3, 6], [2, 6], [1, 6], [1, 5]] },
    ],
  },  {
    name: "Разлёт",
    lesson: "Пустоты между змеями — рабочее пространство: почти каждый обед здесь дальний выстрел.",
    w: 12, h: 16, ceiling: 58, proof: "beam", mass: 98, marks: [30, 45, 58],
    snakes: [
      { cells: [[1, 14], [1, 15], [0, 15], [0, 14]] },
      { cells: [[0, 8], [0, 7], [0, 6]] },
      { cells: [[4, 10], [3, 10], [3, 9], [3, 8], [2, 8]] },
      { cells: [[0, 5], [1, 5]] },
      { cells: [[0, 4], [0, 3], [1, 3], [1, 4], [2, 4]] },
      { cells: [[2, 2], [2, 3]] },
      { cells: [[0, 1], [0, 0], [1, 0], [1, 1], [2, 1], [2, 0], [3, 0]] },
      { cells: [[3, 2], [3, 3], [3, 4], [4, 4], [4, 3]] },
      { cells: [[4, 1], [4, 0], [5, 0], [6, 0], [7, 0], [7, 1]] },
      { cells: [[6, 1], [5, 1], [5, 2]] },
      { cells: [[7, 4], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0]] },
      { cells: [[10, 0], [11, 0], [11, 1], [10, 1], [9, 1], [9, 2]] },
      { cells: [[11, 9], [11, 10], [11, 11], [10, 11], [10, 10], [9, 10]] },
      { cells: [[8, 12], [8, 13], [9, 13], [10, 13], [10, 14]] },
      { cells: [[6, 6], [6, 7], [5, 7], [5, 6], [4, 6], [4, 5], [5, 5], [6, 5]] },
      { cells: [[7, 6], [8, 6], [9, 6]] },
      { cells: [[9, 7], [9, 8], [8, 8], [8, 7], [7, 7]] },
      { cells: [[5, 8], [6, 8], [6, 9], [7, 9], [7, 8]] },
      { cells: [[7, 10], [6, 10], [5, 10], [5, 9]] },
      { cells: [[6, 13], [6, 12], [6, 11], [5, 11]] },
      { cells: [[5, 13], [5, 12]] },
      { cells: [[3, 11], [2, 11]] },
    ],
  },
  {
    name: "Порознь",
    lesson: "Змеи стоят врозь. Кто ест только соседа под носом, соберёт 12 из 66.",
    w: 12, h: 16, ceiling: 66, proof: "beam", mass: 92, marks: [32, 48, 60],
    snakes: [
      { cells: [[2, 10], [2, 9], [2, 8], [1, 8], [1, 7]] },
      { cells: [[1, 12], [0, 12], [0, 13]] },
      { cells: [[0, 14], [0, 15], [1, 15]] },
      { cells: [[10, 15], [11, 15], [11, 14]] },
      { cells: [[9, 14], [8, 14], [7, 14], [6, 14], [5, 14]] },
      { cells: [[5, 11], [5, 10], [4, 10], [4, 9], [5, 9], [6, 9]] },
      { cells: [[6, 12], [6, 13], [7, 13], [8, 13], [9, 13]] },
      { cells: [[11, 12], [11, 13], [10, 13]] },
      { cells: [[9, 11], [10, 11], [11, 11], [11, 10], [10, 10], [9, 10]] },
      { cells: [[9, 9], [8, 9], [7, 9], [7, 10], [8, 10]] },
      { cells: [[10, 7], [11, 7], [11, 6], [10, 6]] },
      { cells: [[9, 5], [8, 5], [8, 6], [9, 6]] },
      { cells: [[10, 5], [11, 5], [11, 4]] },
      { cells: [[6, 6], [7, 6], [7, 5]] },
      { cells: [[6, 5], [6, 4], [5, 4], [5, 3], [6, 3], [7, 3]] },
      { cells: [[10, 3], [11, 3], [11, 2], [10, 2], [9, 2], [9, 1]] },
      { cells: [[10, 1], [11, 1], [11, 0], [10, 0], [9, 0], [8, 0]] },
      { cells: [[8, 2], [8, 1]] },
      { cells: [[3, 0], [2, 0], [2, 1], [1, 1], [1, 0], [0, 0]] },
      { cells: [[0, 1], [0, 2], [1, 2], [2, 2], [2, 3]] },
      { cells: [[2, 5], [2, 6], [1, 6]] },
    ],
  },

];

// Цвета раздаём по кругу, но соседям (клетки бок о бок) один цвет не даём:
// на больших полях две однотонные змеи впритык читаются как одна.
const paintPack = (lv) => {
  const owner = new Map();
  lv.snakes.forEach((s, si) => s.cells.forEach(([x, y]) => owner.set(x + "," + y, si)));
  const near = lv.snakes.map(() => new Set());
  lv.snakes.forEach((s, si) =>
    s.cells.forEach(([x, y]) =>
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
        const o = owner.get(x + dx + "," + (y + dy));
        if (o != null && o !== si) { near[si].add(o); near[o].add(si); }
      })));
  const colors = [];
  let ci = 0;
  lv.snakes.forEach((s, si) => {
    if (s.spiky) { colors[si] = "spiky"; return; }
    const taken = new Set([...near[si]].map((o) => colors[o]).filter(Boolean));
    for (let k = 0; k < ORDER.length; k++) {
      const c = ORDER[(ci + k) % ORDER.length];
      if (!taken.has(c)) { colors[si] = c; ci += k + 1; return; }
    }
    colors[si] = ORDER[ci++ % ORDER.length];
  });
  return colors;
};

const buildPack = (raw, mode) =>
  raw.map((lv, i) => {
    const colors = paintPack(lv);
    return {
      ...lv,
      id: i,
      mode: mode || "goal",
      rocks: lv.rocks || [],
      snakes: lv.snakes.map((s, si) => ({
        id: "s" + si,
        color: colors[si],
        spiky: !!s.spiky,
        cells: s.cells,
      })),
    };
  });

const PACKS = [
  { id: "void", name: "Пустота", note: "19 уровней · только змеи", levels: buildPack(RAW_LEVELS_VOID) },
  { id: "record", name: "Рекорд", note: "3 поля 12×16 · без цели, на счёт", levels: buildPack(RAW_FIELDS, "record") },
  { id: "classic", name: "Кампания", note: "25 уровней · валуны и колючие", levels: buildPack(RAW_LEVELS) },
];

/* ---------- логика (идентична солверу) ---------- */
const facing = (cells) => [cells[0][0] - cells[1][0], cells[0][1] - cells[1][1]];
const ckey = (x, y) => x + "," + y;

function occMap(snakes) {
  const m = new Map();
  snakes.forEach((s) =>
    s.cells.forEach(([x, y], ci) => m.set(ckey(x, y), { sid: s.id, ci, len: s.cells.length, spiky: s.spiky }))
  );
  return m;
}

function raycast(snakes, sid, W, H, rockSet) {
  const s = snakes.find((q) => q.id === sid);
  const [dx, dy] = facing(s.cells);
  const occ = occMap(snakes);
  let [x, y] = s.cells[0];
  const gap = [];
  for (;;) {
    x += dx; y += dy;
    if (x < 0 || y < 0 || x >= W || y >= H) return { kind: "edge", gap, dir: [dx, dy] };
    if (rockSet.has(ckey(x, y))) return { kind: "rock", gap, hitCell: [x, y], dir: [dx, dy] };
    const hit = occ.get(ckey(x, y));
    if (hit) {
      if (hit.sid === sid) return { kind: "self", gap, hitCell: [x, y], dir: [dx, dy] };
      if (hit.ci === hit.len - 1)
        return hit.spiky
          ? { kind: "spikyTail", target: hit.sid, gap, hitCell: [x, y], dir: [dx, dy] }
          : { kind: "tail", target: hit.sid, gap, hitCell: [x, y], dir: [dx, dy] };
      if (hit.ci === 0) return { kind: "head", target: hit.sid, gap, hitCell: [x, y], dir: [dx, dy] };
      return { kind: "body", target: hit.sid, gap, hitCell: [x, y], dir: [dx, dy] };
    }
    gap.push([x, y]);
  }
}

const clone = (snakes) => snakes.map((s) => ({ ...s, cells: s.cells.map((c) => [c[0], c[1]]) }));

function applyEat(snakes, eaterId, ray) {
  const prey = snakes.find((s) => s.id === ray.target);
  const food = new Set(prey.cells.map(([x, y]) => ckey(x, y)));
  const path = ray.gap.concat(prey.cells.slice().reverse());
  let cells = snakes.find((s) => s.id === eaterId).cells.map((c) => c.slice());
  for (const p of path) {
    cells.unshift([p[0], p[1]]);
    if (!food.has(ckey(p[0], p[1]))) cells.pop();
  }
  return snakes
    .filter((s) => s.id !== ray.target)
    .map((s) => (s.id === eaterId ? { ...s, cells } : s));
}

const maxLen = (snakes) => Math.max(0, ...snakes.map((s) => s.cells.length));

/* ---------- построение хода для аниматора ---------- */
function buildEatMove(snakes, sid, ray) {
  const eater = snakes.find((s) => s.id === sid);
  const prey = snakes.find((s) => s.id === ray.target);
  const pathCells = ray.gap.concat(prey.cells.slice().reverse());
  const foodFlags = pathCells.map((_, i) => i >= ray.gap.length);
  return {
    kind: "eat",
    moverId: sid,
    preyId: prey.id,
    n0: eater.cells.length,
    trackCells: eater.cells.slice().reverse().concat(pathCells),
    pathCells, foodFlags,
    preyCells: prey.cells.map((c) => c.slice()),
    gained: prey.cells.length,
    finalSnakes: applyEat(clone(snakes), sid, ray),
  };
}

function buildLaunchMove(snakes, sid, ray) {
  const s = snakes.find((q) => q.id === sid);
  const n0 = s.cells.length;
  const [dx, dy] = ray.dir;
  const pathCells = [];
  let [x, y] = s.cells[0];
  const steps = ray.gap.length + n0 + 1;
  for (let i = 0; i < steps; i++) { x += dx; y += dy; pathCells.push([x, y]); }
  return {
    kind: "launch",
    moverId: sid,
    preyId: null,
    n0,
    trackCells: s.cells.slice().reverse().concat(pathCells),
    pathCells,
    foodFlags: pathCells.map(() => false),
    preyCells: null,
    gained: 0,
    lost: n0,
    lostAt: s.cells[0].slice(),
    finalSnakes: clone(snakes).filter((q) => q.id !== sid),
  };
}

/* ---------- геометрия для плавного скольжения ---------- */
const toPx = ([x, y]) => [x * CS + CS / 2, y * CS + CS / 2];

function ptAt(P, s) {
  const maxI = P.length - 1;
  let i = Math.floor(s / CS);
  if (i < 0) i = 0;
  if (i >= maxI) return [P[maxI][0], P[maxI][1]];
  const f = (s - i * CS) / CS;
  return [P[i][0] + (P[i + 1][0] - P[i][0]) * f, P[i][1] + (P[i + 1][1] - P[i][1]) * f];
}

function samplePts(P, s0, s1) {
  const res = [ptAt(P, s0)];
  for (let k = Math.floor(s0 / CS) + 1; k * CS < s1; k++)
    if (k >= 0 && k < P.length) res.push(P[k]);
  const e = ptAt(P, s1);
  const last = res[res.length - 1];
  if (Math.abs(e[0] - last[0]) + Math.abs(e[1] - last[1]) > 0.4) res.push(e);
  return res;
}

const dStr = (pts) => pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");

function segAngle(P, i) {
  return (Math.atan2(P[i + 1][1] - P[i][1], P[i + 1][0] - P[i][0]) * 180) / Math.PI;
}
function lerpAngle(a, b, t) {
  let d = ((b - a + 540) % 360) - 180;
  return a + d * t;
}
function angleAt(P, s) {
  const maxI = P.length - 1;
  let i = Math.floor(s / CS);
  if (i >= maxI) i = maxI - 1;
  if (i < 0) i = 0;
  const f = (s - i * CS) / CS;
  const a = segAngle(P, i);
  if (f < 0.35 && i > 0) return lerpAngle(segAngle(P, i - 1), a, f / 0.35);
  return a;
}

/* ---------- отрисовка ---------- */
function Rock({ x, y }) {
  const cx = x * CS + CS / 2, cy = y * CS + CS / 2;
  return (
    <g>
      <rect x={cx - 36} y={cy - 32} width="72" height="66" rx="26" fill="#B7B1A0" stroke="#857F6C" strokeWidth="6" />
      <circle cx={cx - 12} cy={cy - 8} r="5" fill="#948E7B" />
      <circle cx={cx + 14} cy={cy + 10} r="4" fill="#948E7B" />
      <path d={"M" + (cx - 22) + " " + (cy - 22) + " q 14 -8 30 -2"} stroke="#CFC9B8" strokeWidth="6" strokeLinecap="round" fill="none" />
    </g>
  );
}

function SnakeView({ snake, shaking, onTap, regRef }) {
  const C = COLORS[snake.color];
  const pts = snake.cells.map(toPx);
  const d = dStr(pts);
  const head = pts[0];
  const hasBody = pts.length >= 2;
  const angle = hasBody ? segAngle([pts[1], pts[0]], 0) : 0;

  // полоски на хвосте (обычные) / шипы (колючая)
  let tailDeco = null;
  if (hasBody && !snake.spiky) {
    const t = pts[pts.length - 1], pv = pts[pts.length - 2];
    const td = [(pv[0] - t[0]) / CS, (pv[1] - t[1]) / CS];
    const tp = [-td[1], td[0]];
    tailDeco = (
      <g data-part="stripes">
        {[10, 24].map((off, i) => (
          <line key={i}
            x1={t[0] + td[0] * off - tp[0] * 18} y1={t[1] + td[1] * off - tp[1] * 18}
            x2={t[0] + td[0] * off + tp[0] * 18} y2={t[1] + td[1] * off + tp[1] * 18}
            stroke={C.dark} strokeWidth="7" strokeLinecap="round" opacity="0.85" />
        ))}
      </g>
    );
  }
  let spikes = null;
  if (snake.spiky && hasBody) {
    const tris = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const dx = (a[0] - b[0]) / CS, dy = (a[1] - b[1]) / CS;
      const nx = -dy, ny = dx;
      const side = i % 2 ? 1 : -1;
      const bx = b[0] + nx * side * 20, by = b[1] + ny * side * 20;
      tris.push(
        <path key={i}
          d={"M" + (bx + dx * 13) + " " + (by + dy * 13) +
             " L" + (bx - dx * 13) + " " + (by - dy * 13) +
             " L" + (b[0] + nx * side * 44) + " " + (b[1] + ny * side * 44) + " Z"}
          fill={C.dark} />
      );
    }
    spikes = <g data-part="spikes">{tris}</g>;
  }

  return (
    <g ref={(n) => { if (n) regRef.current[snake.id] = n; else delete regRef.current[snake.id]; }}
       className={shaking ? "hv-shake" : ""} style={{ cursor: "pointer" }}
       onPointerDown={(e) => { e.stopPropagation(); onTap(snake.id); }}>
      {hasBody && <path data-part="outline" d={d} fill="none" stroke={C.dark} strokeWidth="70" strokeLinecap="round" strokeLinejoin="round" />}
      {hasBody && <path data-part="body" d={d} fill="none" stroke={C.fill} strokeWidth="58" strokeLinecap="round" strokeLinejoin="round" />}
      {spikes}
      {tailDeco}
      {hasBody && <path data-part="touch" d={d} fill="none" stroke="transparent" strokeWidth="94" strokeLinecap="round" strokeLinejoin="round" />}
      <g data-part="headG" transform={"translate(" + head[0].toFixed(1) + " " + head[1].toFixed(1) + ")"}>
        <circle data-part="headCircle" r="43" fill={C.fill} stroke={C.dark} strokeWidth="7" />
        <g data-part="rotG" transform={"rotate(" + angle.toFixed(1) + ")"}>
          <path className="hv-tongue" d="M43 0 L61 8 M43 0 L61 -8" stroke="#D9382B" strokeWidth="6" strokeLinecap="round" fill="none" />
          <circle cx="17" cy="-15" r="9.5" fill="#FFFDF4" />
          <circle cx="17" cy="15" r="9.5" fill="#FFFDF4" />
          <circle cx="21" cy="-15" r="4.5" fill="#1E2A1D" />
          <circle cx="21" cy="15" r="4.5" fill="#1E2A1D" />
        </g>
        <text data-part="num" textAnchor="middle" dominantBaseline="central"
          fontFamily="Rubik, sans-serif" fontWeight="800" fontSize="30" fill="#FFFDF4"
          stroke={C.dark} strokeWidth="4" paintOrder="stroke" style={{ pointerEvents: "none" }}>
          {snake.cells.length}
        </text>
      </g>
    </g>
  );
}

function RayView({ ray, from, color }) {
  const [hx, hy] = toPx(from);
  let x2, y2;
  if (ray.hitCell) {
    x2 = ray.hitCell[0] * CS + CS / 2 - ray.dir[0] * 34;
    y2 = ray.hitCell[1] * CS + CS / 2 - ray.dir[1] * 34;
  } else {
    x2 = hx + ray.dir[0] * (ray.gap.length * CS + CS * 0.62);
    y2 = hy + ray.dir[1] * (ray.gap.length * CS + CS * 0.62);
  }
  return (
    <g style={{ pointerEvents: "none" }}>
      <line x1={hx} y1={hy} x2={x2} y2={y2} stroke={color} strokeWidth="10"
        strokeLinecap="round" strokeDasharray="4 26" className="hv-dash" />
      {ray.kind === "edge" ? (
        <path d={"M" + x2 + " " + y2 + " m" + (-ray.dir[0] * 16) + " " + (-ray.dir[1] * 16) +
                 " l" + (ray.dir[0] * 26 - ray.dir[1] * 14) + " " + (ray.dir[1] * 26 - ray.dir[0] * 14) +
                 " M" + x2 + " " + y2 + " m" + (-ray.dir[0] * 16) + " " + (-ray.dir[1] * 16) +
                 " l" + (ray.dir[0] * 26 + ray.dir[1] * 14) + " " + (ray.dir[1] * 26 + ray.dir[0] * 14)}
          stroke={color} strokeWidth="10" strokeLinecap="round" fill="none" />
      ) : (
        <g transform={"translate(" + (ray.hitCell[0] * CS + CS / 2) + " " + (ray.hitCell[1] * CS + CS / 2) + ")"}>
          <line x1="-15" y1="-15" x2="15" y2="15" stroke={color} strokeWidth="11" strokeLinecap="round" />
          <line x1="15" y1="-15" x2="-15" y2="15" stroke={color} strokeWidth="11" strokeLinecap="round" />
        </g>
      )}
    </g>
  );
}

/* ---------- игра ---------- */
function Game({ level, onExit, onWin, onNext, hasNext, record, onRecord }) {
  const isRec = level.mode === "record";
  const [snakes, setSnakes] = useState(() => clone(level.snakes));
  const [runBest, setRunBest] = useState(() => maxLen(level.snakes));
  const [history, setHistory] = useState([]);
  const [launched, setLaunched] = useState(0);
  const [phase, setPhase] = useState("idle"); // idle | anim | crash | won | lost | done
  const [fx, setFx] = useState(null);
  const [toast, setToast] = useState(null);
  const [plus, setPlus] = useState(null);
  const [wonInfo, setWonInfo] = useState(null);
  const [lostReason, setLostReason] = useState(null);
  const [crashed, setCrashed] = useState(false); // авария: поле не менялось, «Продолжить» бесплатен
  const regRef = useRef({});
  const rafRef = useRef(null);
  const fxTimerRef = useRef(null);
  const crashTimerRef = useRef(null);
  const rockSet = useMemo(() => new Set(level.rocks.map(([x, y]) => ckey(x, y))), [level]);
  const reduced = useMemo(
    () => typeof window !== "undefined" && window.matchMedia &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches, []
  );

  useEffect(() => () => { cancelAnimationFrame(rafRef.current); clearTimeout(fxTimerRef.current); clearTimeout(crashTimerRef.current); }, []);

  const best = maxLen(snakes);
  // Запас = сколько длины ещё можно потерять на выпусках. Показываем только там,
  // где цель меньше суммы клеток, — на бюджетных уровнях без этого числа не сыграть.
  const onBoard = snakes.reduce((a, s) => a + s.cells.length, 0);
  const hasBudget = !isRec && level.snakes.reduce((a, s) => a + s.cells.length, 0) > level.target;
  const slack = onBoard - level.target;
  const idle = phase === "idle";
  const canEatAny = idle && snakes.some((s) => raycast(snakes, s.id, level.w, level.h, rockSet).kind === "tail");
  const canLaunchAny = idle && snakes.some((s) => raycast(snakes, s.id, level.w, level.h, rockSet).kind === "edge");

  function showFx(next, ms) {
    clearTimeout(fxTimerRef.current);
    setFx(next);
    if (ms) fxTimerRef.current = setTimeout(() => { setFx(null); setToast(null); }, ms);
  }

  function part(root, name) { return root ? root.querySelector('[data-part="' + name + '"]') : null; }

  function commit(mv) {
    setSnakes(mv.finalSnakes);
    if (mv.gained > 0) {
      const e = mv.finalSnakes.find((s) => s.id === mv.moverId);
      if (e) setPlus({ x: e.cells[0][0], y: e.cells[0][1], n: mv.gained, sign: "+", key: Date.now() });
    } else if (mv.lost > 0) {
      setPlus({ x: mv.lostAt[0], y: mv.lostAt[1], n: mv.lost, sign: "−", key: Date.now() });
    }
    const ml = maxLen(mv.finalSnakes);
    if (ml > runBest) { setRunBest(ml); if (isRec) onRecord(ml); }
    if (!isRec && ml >= level.target) {
      const stars = 1 + (mv.launchedAfter === 0 ? 1 : 0) + (mv.finalSnakes.length === 1 ? 1 : 0);
      setWonInfo({ len: ml, stars, ateAll: mv.finalSnakes.length === 1 });
      setPhase("won");
      onWin(stars);
      return;
    }
    const anyEat = mv.finalSnakes.some((s) => raycast(mv.finalSnakes, s.id, level.w, level.h, rockSet).kind === "tail");
    const anyLaunch = mv.finalSnakes.some((s) => raycast(mv.finalSnakes, s.id, level.w, level.h, rockSet).kind === "edge");
    if (!anyEat && !anyLaunch) {
      if (isRec) { setPhase("done"); return; }
      setLostReason("Все пути закрыты — двигаться некому.");
      setPhase("lost");
    } else {
      setPhase("idle");
    }
  }

  // Авария: тап по змее, чей луч заблокирован. Поле не меняется,
  // но уровень завален — после тряски показываем экран поражения.
  function crash(reason, sid, ray, from) {
    setToast(reason);
    showFx({ ray, from, color: "#E05548", shakeId: sid });
    setPhase("crash");
    if (isRec) {                       // на рекордном поле промах — просто тычок, партия идёт дальше
      crashTimerRef.current = setTimeout(() => setPhase("idle"), 420);
      return;
    }
    setCrashed(true);
    setLostReason(reason);
    crashTimerRef.current = setTimeout(() => setPhase("lost"), 700);
  }

  function forgiveCrash() {
    clearTimeout(crashTimerRef.current);
    setCrashed(false); setLostReason(null);
    setPhase("idle"); setFx(null); setToast(null);
  }

  function runMove(mv) {
    setPhase("anim");
    if (reduced) { commit(mv); return; }
    const root = regRef.current[mv.moverId];
    const preyRoot = mv.preyId ? regRef.current[mv.preyId] : null;
    if (!root) { commit(mv); return; }
    const P = mv.trackCells.map(toPx);
    const preyP = mv.preyCells ? mv.preyCells.map(toPx) : null;
    const pathLen = mv.pathCells.length;
    const gapLen = pathLen - (mv.preyCells ? mv.preyCells.length : 0);
    const nfPre = [0]; const ffPre = [0];
    for (let i = 0; i < pathLen; i++) {
      nfPre.push(nfPre[i] + (mv.foodFlags[i] ? 0 : 1));
      ffPre.push(ffPre[i] + (mv.foodFlags[i] ? 1 : 0));
    }
    const body = part(root, "body"), outline = part(root, "outline"), touch = part(root, "touch");
    const stripes = part(root, "stripes"), spikesG = part(root, "spikes");
    const headG = part(root, "headG"), rotG = part(root, "rotG");
    const headCircle = part(root, "headCircle"), num = part(root, "num");
    const pBody = part(preyRoot, "body"), pOutline = part(preyRoot, "outline"), pTouch = part(preyRoot, "touch");
    const pStripes = part(preyRoot, "stripes"), pHeadG = part(preyRoot, "headG");
    if (stripes) stripes.setAttribute("opacity", "0");
    if (spikesG) spikesG.setAttribute("opacity", "0.25");
    if (pStripes) pStripes.setAttribute("opacity", "0");
    const cellDur = mv.kind === "launch" ? 66 : Math.max(46, Math.min(90, 1250 / pathLen));
    const dur = pathLen * cellDur;
    const t0 = performance.now();

    const frame = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const u = mv.kind === "launch"
        ? pathLen * (0.3 * p + 0.7 * p * p)
        : pathLen * p;
      const k = Math.min(pathLen - 1, Math.floor(u));
      const fu = u - Math.floor(u);
      const h = (mv.n0 - 1 + u) * CS;
      let tAdv = nfPre[Math.floor(Math.min(u, pathLen))];
      if (u < pathLen && !mv.foodFlags[k]) tAdv += fu;
      const t = tAdv * CS;
      const dd = dStr(samplePts(P, t, h));
      if (body) body.setAttribute("d", dd);
      if (outline) outline.setAttribute("d", dd);
      if (touch) touch.setAttribute("d", dd);
      const hp = ptAt(P, h);
      if (headG) headG.setAttribute("transform", "translate(" + hp[0].toFixed(1) + " " + hp[1].toFixed(1) + ")");
      if (rotG) rotG.setAttribute("transform", "rotate(" + angleAt(P, h).toFixed(1) + ")");
      if (num) num.textContent = String(mv.n0 + ffPre[Math.floor(Math.min(u, pathLen))]);
      if (headCircle) {
        const r = mv.kind === "eat" && u > gapLen && u < pathLen
          ? 43 + 9 * Math.abs(Math.sin(Math.PI * fu)) : 43;
        headCircle.setAttribute("r", r.toFixed(1));
      }
      if (preyP && preyRoot) {
        const into = Math.max(0, u - gapLen) * CS;
        const rem = (mv.preyCells.length - 1) * CS - into;
        if (rem > 26) {
          const pd = dStr(samplePts(preyP, 0, rem));
          if (pBody) pBody.setAttribute("d", pd);
          if (pOutline) pOutline.setAttribute("d", pd);
          if (pTouch) pTouch.setAttribute("d", pd);
        } else {
          if (pBody) pBody.setAttribute("opacity", "0");
          if (pOutline) pOutline.setAttribute("opacity", "0");
          const op = Math.max(0, (rem + 10) / 36);
          if (pHeadG) pHeadG.setAttribute("opacity", op.toFixed(2));
        }
      }
      if (p < 1) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        if (stripes) stripes.setAttribute("opacity", "1");
        if (spikesG) spikesG.setAttribute("opacity", "1");
        if (headCircle) headCircle.setAttribute("r", "43");
        commit(mv);
      }
    };
    rafRef.current = requestAnimationFrame(frame);
  }

  function tapSnake(sid) {
    if (phase !== "idle") return;
    setToast(null); setFx(null);
    const ray = raycast(snakes, sid, level.w, level.h, rockSet);
    const s = snakes.find((q) => q.id === sid);
    const nom = COLORS[s.color].nom;
    const Nom = nom.charAt(0).toUpperCase() + nom.slice(1);
    if (ray.kind === "tail") {
      const mv = buildEatMove(snakes, sid, ray);
      mv.launchedAfter = launched;
      setHistory((hh) => [...hh, { snakes: clone(snakes), launched, runBest }]);
      runMove(mv);
    } else if (ray.kind === "edge") {
      const mv = buildLaunchMove(snakes, sid, ray);
      mv.launchedAfter = launched + 1;
      setHistory((hh) => [...hh, { snakes: clone(snakes), launched, runBest }]);
      setLaunched((n) => n + 1);
      runMove(mv);
    } else if (ray.kind === "self") {
      crash(Nom + " змея смотрит на собственный хвост — уроборос запрещён.", sid, ray, s.cells[0]);
    } else if (ray.kind === "rock") {
      crash(Nom + " змея врезалась в валун.", sid, ray, s.cells[0]);
    } else if (ray.kind === "spikyTail") {
      crash(Nom + " змея укололась о шипы — колючий хвост не съесть.", sid, ray, s.cells[0]);
    } else if (ray.kind === "head") {
      const t = snakes.find((q) => q.id === ray.target);
      crash(Nom + " змея врезалась в голову " + COLORS[t.color].gen + " — есть можно только за хвост.", sid, ray, s.cells[0]);
    } else {
      const t = snakes.find((q) => q.id === ray.target);
      crash(Nom + " змея врезалась в тело " + COLORS[t.color].gen + " змеи.", sid, ray, s.cells[0]);
    }
  }

  function undo() {
    if (phase === "anim") return;
    if (crashed) { forgiveCrash(); return; }
    if (!history.length) return;
    const last = history[history.length - 1];
    setHistory((hh) => hh.slice(0, -1));
    setSnakes(last.snakes);
    setLaunched(last.launched);
    setRunBest(last.runBest != null ? last.runBest : maxLen(last.snakes));
    setPhase("idle"); setWonInfo(null); setLostReason(null);
    setFx(null); setToast(null); setPlus(null);
  }

  function restart() {
    if (phase === "anim") return;
    clearTimeout(crashTimerRef.current);
    setSnakes(clone(level.snakes)); setHistory([]); setLaunched(0); setRunBest(maxLen(level.snakes));
    setPhase("idle"); setWonInfo(null); setLostReason(null); setCrashed(false);
    setFx(null); setToast(null); setPlus(null);
  }

  const stuckMsg =
    idle && (isRec || best < level.target) && !canEatAny && canLaunchAny
      ? "Съесть некого. Выпусти змею, чтобы расчистить путь, или закончи партию."
      : null;

  const W = level.w * CS, H = level.h * CS;
  const cells = [];
  for (let y = 0; y < level.h; y++)
    for (let x = 0; x < level.w; x++)
      cells.push(
        <rect key={x + "-" + y} x={x * CS + 5} y={y * CS + 5} width={CS - 10} height={CS - 10}
          rx="16" fill={(x + y) % 2 ? "#DFE9C6" : "#E5EED1"} />
      );

  return (
    <div className="hv-screen">
      <header className="hv-top">
        <button className="hv-icon" onClick={onExit} aria-label="К уровням"><ChevronLeft size={22} /></button>
        <div className="hv-lvname"><span className="hv-lvnum">{level.id + 1}</span> {level.name}</div>
        <button className="hv-icon" onClick={undo} disabled={(!history.length && !crashed) || phase === "anim"} aria-label="Отменить ход">
          <Undo2 size={20} />
        </button>
        <button className="hv-icon" onClick={restart} disabled={phase === "anim"} aria-label="Заново">
          <RotateCcw size={19} />
        </button>
      </header>

      {isRec ? (
        <div className="hv-goalrow">
          <span className="hv-goal rec">Рекорд {Math.max(record || 0, runBest)}</span>
          <div className="hv-bar" role="progressbar" aria-valuenow={runBest} aria-valuemax={level.ceiling}>
            <div className="hv-fill" style={{ width: Math.min(100, (runBest / level.ceiling) * 100) + "%" }} />
            {(level.marks || []).map((m) => (
              <i key={m} className={"hv-mark" + (runBest >= m ? " hit" : "")} style={{ left: (m / level.ceiling) * 100 + "%" }} />
            ))}
          </div>
          <span className="hv-count">{runBest} / {level.ceiling}</span>
        </div>
      ) : (
        <div className="hv-goalrow">
          <span className="hv-goal">Цель ≥ {level.target}</span>
          <div className="hv-bar" role="progressbar" aria-valuenow={best} aria-valuemax={level.target}>
            <div className="hv-fill" style={{ width: Math.min(100, (best / level.target) * 100) + "%" }} />
          </div>
          <span className="hv-count">{best} / {level.target}</span>
        </div>
      )}

      {hasBudget ? (
        <div className={"hv-slack" + (slack <= 0 ? " tight" : "")}>
          Запас: <b>{Math.max(0, slack)}</b>{slack > 0 ? " — столько длины ещё можно отпустить" : " — больше терять нечего"}
        </div>
      ) : null}

      <div className="hv-boardwrap" onPointerDown={() => { setFx(null); setToast(null); }}>
        <svg className="hv-board" viewBox={"0 0 " + W + " " + H} style={{ aspectRatio: W + " / " + H }}>
          <defs>
            <clipPath id="hv-clip"><rect x="0" y="0" width={W} height={H} rx="20" /></clipPath>
          </defs>
          <rect x="0" y="0" width={W} height={H} rx="20" fill="#ECF2DE" />
          {cells}
          {level.rocks.map(([x, y]) => <Rock key={"r" + x + "-" + y} x={x} y={y} />)}
          <g clipPath="url(#hv-clip)">
            {snakes.map((s) => (
              <SnakeView key={s.id} snake={s} regRef={regRef}
                shaking={fx && fx.shakeId === s.id} onTap={tapSnake} />
            ))}
          </g>
          {fx && fx.ray && <RayView ray={fx.ray} from={fx.from} color={fx.color} />}
          {plus && (
            <text key={plus.key} className="hv-plus" x={plus.x * CS + CS / 2} y={plus.y * CS - 6}
              textAnchor="middle" fontFamily="Rubik, sans-serif" fontWeight="800" fontSize="46"
              fill={plus.sign === "−" ? "#C0532A" : "#2F6E1F"} stroke="#FFFDF4" strokeWidth="6" paintOrder="stroke">
              {plus.sign}{plus.n}
            </text>
          )}
        </svg>

        {phase === "won" && wonInfo && (
          <div className="hv-overlay">
            <div className="hv-card">
              <div className="hv-stars">
                {[0, 1, 2].map((i) => (
                  <Star key={i} size={34} className="hv-star" style={{ animationDelay: i * 0.12 + "s" }}
                    fill={i < wonInfo.stars ? "#EFAF3C" : "none"}
                    color={i < wonInfo.stars ? "#EFAF3C" : "#57685A"} />
                ))}
              </div>
              <div className="hv-wontitle">Уровень пройден</div>
              <div className="hv-wonsub">
                Длина змеи: {wonInfo.len}{wonInfo.ateAll ? " · съедено всё поле" : ""}
              </div>
              <div className="hv-btnrow">
                <button className="hv-btn ghost" onClick={restart}>Ещё раз</button>
                {hasNext
                  ? <button className="hv-btn main" onClick={onNext}><Play size={16} /> Дальше</button>
                  : <button className="hv-btn main" onClick={onExit}>К уровням</button>}
              </div>
            </div>
          </div>
        )}

        {phase === "done" && (
          <div className="hv-overlay">
            <div className="hv-card">
              <div className="hv-stars">
                {(level.marks || []).map((m, i) => (
                  <Star key={m} size={34} className="hv-star" style={{ animationDelay: i * 0.12 + "s" }}
                    fill={runBest >= m ? "#EFAF3C" : "none"} color={runBest >= m ? "#EFAF3C" : "#57685A"} />
                ))}
              </div>
              <div className="hv-wontitle">{runBest > (record || 0) ? "Новый рекорд!" : "Партия окончена"}</div>
              <div className="hv-wonsub">
                Самая длинная змея: <b>{runBest}</b>
                {level.proof === "beam" ? " · машина собирает " + level.ceiling : " из " + level.ceiling}
                {runBest > (record || 0) ? "" : " · твой рекорд " + (record || 0)}
              </div>
              <div className="hv-btnrow">
                <button className="hv-btn ghost" onClick={undo} disabled={!history.length}>
                  <Undo2 size={15} /> Отменить ход
                </button>
                <button className="hv-btn main" onClick={restart}><RotateCcw size={15} /> Ещё раз</button>
              </div>
            </div>
          </div>
        )}

        {phase === "lost" && (
          <div className="hv-overlay">
            <div className="hv-card">
              <div className="hv-wontitle lost">{crashed ? "Авария!" : "Не вышло"}</div>
              <div className="hv-wonsub">{lostReason}</div>
              <div className="hv-btnrow">
                {crashed ? (
                  <button className="hv-btn ghost" onClick={forgiveCrash}>
                    <Undo2 size={15} /> Продолжить
                  </button>
                ) : (
                  <button className="hv-btn ghost" onClick={undo} disabled={!history.length}>
                    <Undo2 size={15} /> Отменить ход
                  </button>
                )}
                <button className="hv-btn main" onClick={restart}><RotateCcw size={15} /> Заново</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="hv-foot">
        {toast ? (
          <div className="hv-toast">{toast}</div>
        ) : stuckMsg ? (
          <div className="hv-toast warn">
            {stuckMsg}
            {isRec ? <button className="hv-endbtn" onClick={() => setPhase("done")}>Закончить</button> : null}
          </div>
        ) : (
          <div className="hv-lesson">{level.lesson}</div>
        )}
      </footer>
    </div>
  );
}

/* ---------- меню ---------- */
function Menu({ stars, records, onPlay, packIdx, onPack }) {
  const pack = PACKS[packIdx];
  return (
    <div className="hv-screen hv-menu">
      <div className="hv-logo">ХВОСТОЕД</div>
      <svg className="hv-squiggle" viewBox="0 0 220 26">
        <path d="M6 16 q 18 -18 36 0 t 36 0 t 36 0 t 36 0 t 36 0" fill="none"
          stroke="#58A942" strokeWidth="7" strokeLinecap="round" className="hv-squigpath" />
        <circle cx="196" cy="14" r="8" fill="#58A942" />
        <circle cx="199" cy="11" r="2" fill="#152118" />
      </svg>
      <div className="hv-tag">Съешь соседа за хвост — и вырасти самой длинной</div>
      <ul className="hv-rules">
        <li><b>Тапни змею.</b> Если она смотрит на чужой хвост — проглотит его целиком.</li>
        <li><b>Смотри, куда она смотрит.</b> Врежется в тело{pack.id === "void" ? "" : ", валун"} или голову — авария.</li>
        <li><b>Некого есть?</b> Выпусти змею с поля и расчисти дорогу. Но её длина пропадёт.</li>
        {pack.id === "record" ? (
          <li><b>Цели нет.</b> Расти, пока есть кого есть. В зачёт идёт самая длинная змея за партию.</li>
        ) : (
          <li><b>Цель:</b> хотя бы одна змея нужной длины. Неважно, какая.</li>
        )}
      </ul>
      <div className="hv-packs">
        {PACKS.map((p, i) => (
          <button key={p.id} className={"hv-pack" + (i === packIdx ? " hv-pack-on" : "")} onClick={() => onPack(i)}>
            <span className="hv-packname">{p.name}</span>
            <span className="hv-packnote">{p.note}</span>
          </button>
        ))}
      </div>
      <div className="hv-levels">
        {pack.levels.map((lv) => {
          const rec = records[pack.id + ":" + lv.id] || 0;
          const got = lv.mode === "record"
            ? (lv.marks || []).filter((m) => rec >= m).length
            : (stars[pack.id + ":" + lv.id] || 0);
          return (
            <button key={lv.id} className="hv-lvcard" onClick={() => onPlay(lv.id)}>
              <span className="hv-lvbig">{lv.mode === "record" ? "∞" : lv.id + 1}</span>
              <span className="hv-lvinfo">
                <span className="hv-lvtitle">{lv.name}</span>
                <span className="hv-lvmeta">
                  {lv.w}×{lv.h} · {lv.mode === "record"
                    ? lv.snakes.length + " змей · рекорд " + rec + (lv.proof === "beam" ? ", машина " : " из ") + lv.ceiling
                    : "цель ≥ " + lv.target}
                </span>
              </span>
              <span className="hv-lvstars">
                {[0, 1, 2].map((i) => (
                  <Star key={i} size={14}
                    fill={i < got ? "#EFAF3C" : "none"}
                    color={i < got ? "#EFAF3C" : "#41544A"} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      <div className="hv-note">прототип · звёзды живут до перезагрузки, рекорды — навсегда</div>
    </div>
  );
}

/* ---------- приложение ---------- */
export default function App() {
  const [screen, setScreen] = useState("menu");
  const [packIdx, setPackIdx] = useState(0);
  const [idx, setIdx] = useState(0);
  const [stars, setStars] = useState({});
  const [records, setRecords] = useState(() => {
    try { return JSON.parse(localStorage.getItem("hv-records") || "{}"); } catch (e) { return {}; }
  });
  const pack = PACKS[packIdx];
  const levels = pack.levels;
  const recKey = pack.id + ":" + idx;
  const saveRecord = (len) => setRecords((p) => {
    if ((p[recKey] || 0) >= len) return p;
    const next = { ...p, [recKey]: len };
    try { localStorage.setItem("hv-records", JSON.stringify(next)); } catch (e) {}
    return next;
  });

  return (
    <div className="hv-root">
      <style>{CSS_TEXT}</style>
      {screen === "menu" ? (
        <Menu
          stars={stars}
          records={records}
          packIdx={packIdx}
          onPack={(i) => { setPackIdx(i); setIdx(0); }}
          onPlay={(i) => { setIdx(i); setScreen("game"); }}
        />
      ) : (
        <Game
          key={pack.id + ":" + idx}
          level={levels[idx]}
          record={records[recKey] || 0}
          onRecord={saveRecord}
          onExit={() => setScreen("menu")}
          onWin={(st) => setStars((p) => {
            const k = pack.id + ":" + idx;
            return { ...p, [k]: Math.max(p[k] || 0, st) };
          })}
          onNext={() => setIdx((i) => Math.min(i + 1, levels.length - 1))}
          hasNext={idx < levels.length - 1}
        />
      )}
    </div>
  );
}

/* ---------- стили ---------- */
const CSS_TEXT = `
@import url('https://fonts.googleapis.com/css2?family=Unbounded:wght@500;800&family=Rubik:wght@400;600;800&display=swap');

.hv-root{min-height:100vh;background:radial-gradient(120% 90% at 50% 0%,#1C2C20 0%,#152118 55%,#101A13 100%);
  color:#F3F0E4;font-family:Rubik,system-ui,sans-serif;display:flex;justify-content:center;}
.hv-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
.hv-screen{width:100%;max-width:440px;padding:14px 14px 22px;display:flex;flex-direction:column;}

.hv-top{display:flex;align-items:center;gap:8px;margin-bottom:10px;}
.hv-icon{width:40px;height:40px;border-radius:13px;border:1px solid #2C3E30;background:#1B2A1F;color:#F3F0E4;
  display:flex;align-items:center;justify-content:center;cursor:pointer;}
.hv-icon:disabled{opacity:.35;cursor:default;}
.hv-icon:not(:disabled):active{transform:scale(.93);}
.hv-lvname{flex:1;font-weight:600;font-size:16px;letter-spacing:.2px;}
.hv-lvnum{display:inline-flex;width:24px;height:24px;border-radius:8px;background:#58A942;color:#0F1A12;
  align-items:center;justify-content:center;font-weight:800;font-size:13px;margin-right:6px;}

.hv-goalrow{display:flex;align-items:center;gap:9px;margin-bottom:10px;}
.hv-goal{font-size:12px;font-weight:800;color:#0F1A12;background:#EFAF3C;border-radius:9px;padding:4px 8px;white-space:nowrap;}
.hv-bar{flex:1;height:12px;border-radius:8px;background:#243527;overflow:hidden;position:relative;}
.hv-goal.rec{background:#58A942;color:#08120A;}
.hv-mark{position:absolute;top:0;width:2px;height:100%;background:#0F1A12;opacity:.55;transform:translateX(-1px);}
.hv-mark.hit{background:#FFFDF4;opacity:.75;}
.hv-endbtn{margin-left:10px;font:inherit;font-weight:800;color:#0F1A12;background:#EFAF3C;
  border:0;border-radius:8px;padding:3px 10px;cursor:pointer;}
.hv-fill{height:100%;border-radius:8px;background:linear-gradient(90deg,#58A942,#9CCB3B);transition:width .35s ease;}
.hv-count{font-size:13px;font-weight:600;color:#B9C8B4;min-width:52px;text-align:right;font-variant-numeric:tabular-nums;}
.hv-slack{font-size:12px;color:#9FB29B;background:#1B2A1F;border:1px solid #2C3E30;border-radius:10px;
  padding:5px 10px;margin:-4px 0 10px;align-self:flex-start;}
.hv-slack b{color:#EFAF3C;font-variant-numeric:tabular-nums;}
.hv-slack.tight{background:#33290F;border-color:#5C4A18;color:#F0D9A0;}
.hv-slack.tight b{color:#F0D9A0;}

.hv-boardwrap{position:relative;}
.hv-board{width:100%;display:block;border-radius:24px;background:#ECF2DE;
  box-shadow:0 14px 34px rgba(0,0,0,.42),inset 0 0 0 1px #C9D6AE;touch-action:manipulation;}

.hv-shake{animation:hvshake .38s ease;}
@keyframes hvshake{0%,100%{transform:translate(0,0)}20%{transform:translate(-7px,0)}40%{transform:translate(7px,0)}
  60%{transform:translate(-5px,0)}80%{transform:translate(5px,0)}}
.hv-dash{animation:hvdash 1s linear infinite;}
@keyframes hvdash{to{stroke-dashoffset:-60;}}
.hv-plus{animation:hvplus 1s ease forwards;pointer-events:none;}
@keyframes hvplus{0%{opacity:0;transform:translateY(10px)}20%{opacity:1}100%{opacity:0;transform:translateY(-34px)}}
.hv-tongue{transform-box:fill-box;transform-origin:left center;animation:hvtongue 3.2s ease-in-out infinite;}
@keyframes hvtongue{0%,86%,100%{transform:scaleX(.12);opacity:0}90%,95%{transform:scaleX(1);opacity:1}}

.hv-foot{margin-top:12px;min-height:64px;display:flex;align-items:center;}
.hv-lesson{font-size:14px;color:#9FB29B;line-height:1.45;}
.hv-toast{font-size:14px;color:#F3F0E4;background:#22331F;border:1px solid #355030;border-radius:14px;
  padding:10px 14px;line-height:1.4;width:100%;animation:hvfade .25s ease;}
.hv-toast.warn{background:#33290F;border-color:#5C4A18;color:#F0D9A0;}
@keyframes hvfade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.hv-btn{border-radius:13px;border:none;font-family:Rubik,sans-serif;font-weight:800;font-size:14px;
  padding:11px 16px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;}
.hv-btn.main{background:#58A942;color:#0F1A12;}
.hv-btn.ghost{background:transparent;color:#C9D6C2;border:1px solid #3A4E3E;}
.hv-btn.small{padding:8px 12px;font-size:13px;}
.hv-btn:disabled{opacity:.4;cursor:default;}
.hv-btn:not(:disabled):active{transform:scale(.95);}
.hv-btn:focus-visible,.hv-icon:focus-visible,.hv-lvcard:focus-visible{outline:2px solid #EFAF3C;outline-offset:2px;}

.hv-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  background:rgba(14,22,15,.55);border-radius:24px;backdrop-filter:blur(3px);animation:hvfade .3s ease;}
.hv-card{background:#1B2A1F;border:1px solid #35503C;border-radius:22px;padding:22px 24px;text-align:center;
  width:min(86%,310px);box-shadow:0 20px 50px rgba(0,0,0,.5);}
.hv-stars{display:flex;justify-content:center;gap:8px;margin-bottom:10px;}
.hv-star{animation:hvstar .5s cubic-bezier(.5,1.8,.5,1) backwards;}
@keyframes hvstar{from{opacity:0;transform:scale(.2) rotate(-30deg)}to{opacity:1;transform:none}}
.hv-wontitle{font-family:Unbounded,sans-serif;font-weight:800;font-size:19px;margin-bottom:6px;}
.hv-wontitle.lost{color:#E8A9A0;}
.hv-wonsub{font-size:13px;color:#9FB29B;margin-bottom:16px;}
.hv-btnrow{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;}

.hv-menu{padding-top:34px;align-items:center;}
.hv-logo{font-family:Unbounded,sans-serif;font-weight:800;font-size:34px;letter-spacing:1px;
  color:#F3F0E4;text-shadow:0 3px 0 #0D150F;}
.hv-squiggle{width:210px;margin:6px 0 12px;}
.hv-squigpath{stroke-dasharray:300;stroke-dashoffset:300;animation:hvdraw 1.1s .15s ease forwards;}
@keyframes hvdraw{to{stroke-dashoffset:0;}}
.hv-tag{font-size:14px;color:#9FB29B;margin-bottom:16px;text-align:center;}
.hv-rules{list-style:none;margin:0 0 18px;padding:0;display:flex;flex-direction:column;gap:8px;width:100%;}
.hv-rules li{font-size:13.5px;line-height:1.45;color:#C9D6C2;background:#1B2A1F;border:1px solid #2C3E30;
  border-radius:14px;padding:10px 13px;}
.hv-rules b{color:#F3F0E4;}
.hv-packs{display:flex;gap:8px;width:100%;margin-bottom:12px;}
.hv-pack{flex:1;display:flex;flex-direction:column;gap:2px;align-items:flex-start;background:#1B2A1F;
  border:1px solid #2C3E30;border-radius:14px;padding:9px 12px;color:#8AA089;cursor:pointer;text-align:left;
  font-family:Rubik,sans-serif;transition:border-color .12s ease,color .12s ease;}
.hv-pack-on{border-color:#58A942;color:#F3F0E4;background:#20321F;}
.hv-packname{font-weight:600;font-size:14px;}
.hv-packnote{font-size:11px;opacity:.75;}
.hv-levels{display:flex;flex-direction:column;gap:9px;width:100%;}
.hv-lvcard{display:flex;align-items:center;gap:12px;background:#1B2A1F;border:1px solid #2C3E30;border-radius:16px;
  padding:11px 14px;color:#F3F0E4;cursor:pointer;text-align:left;font-family:Rubik,sans-serif;transition:transform .12s ease;}
.hv-lvcard:active{transform:scale(.98);}
.hv-lvbig{font-family:Unbounded,sans-serif;font-weight:800;font-size:20px;color:#58A942;width:28px;text-align:center;}
.hv-lvinfo{flex:1;display:flex;flex-direction:column;gap:2px;}
.hv-lvtitle{font-weight:600;font-size:15px;}
.hv-lvmeta{font-size:12px;color:#8AA089;}
.hv-lvstars{display:flex;gap:3px;}
.hv-note{margin-top:16px;font-size:11.5px;color:#5F7263;}

@media (prefers-reduced-motion: reduce){
  .hv-shake,.hv-dash,.hv-plus,.hv-star,.hv-squigpath,.hv-tongue{animation:none !important;}
  .hv-fill{transition:none;}
}
`;
