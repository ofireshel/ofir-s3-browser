import { onRequestGet as __api_news_js_onRequestGet } from "C:\\Users\\ofire\\ofir-s3-browser\\functions\\api\\news.js"
import { onRequestGet as __api_scores_js_onRequestGet } from "C:\\Users\\ofire\\ofir-s3-browser\\functions\\api\\scores.js"
import { onRequestPost as __api_scores_js_onRequestPost } from "C:\\Users\\ofire\\ofir-s3-browser\\functions\\api\\scores.js"
import { onRequestPost as __api_stt_js_onRequestPost } from "C:\\Users\\ofire\\ofir-s3-browser\\functions\\api\\stt.js"

export const routes = [
    {
      routePath: "/api/news",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_news_js_onRequestGet],
    },
  {
      routePath: "/api/scores",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_scores_js_onRequestGet],
    },
  {
      routePath: "/api/scores",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_scores_js_onRequestPost],
    },
  {
      routePath: "/api/stt",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_stt_js_onRequestPost],
    },
  ]