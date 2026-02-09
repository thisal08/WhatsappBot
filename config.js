// config.js
import { configDotenv } from "dotenv";
configDotenv();

/* =========================
   CONFIG (from env vars)
========================= */
const config = {
  BOT_NUMBER: process.env.BOT_NUMBER || "94713829670",
  OWNER_NUMBERS: (process.env.OWNER_NUMBERS || "94713829670")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  DB_NAME: process.env.DB_NAME || "StreamLineMD-V2",
  MONGODB_URI: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",

  PREFIX: process.env.PREFIX || ".",
};

console.log("====== CONFIG LOADED ======");
console.log("BOT_NUMBER:", config.BOT_NUMBER);
console.log("OWNER_NUMBERS:", config.OWNER_NUMBERS);
console.log("DB:", config.DB_NAME);
console.log("MONGODB_URI:", config.MONGODB_URI);
console.log("GEMINI_MODEL:", config.GEMINI_MODEL);
console.log(
  "GEMINI_API_KEY:",
  config.GEMINI_API_KEY ? "Set (hidden)" : "Not set",
);
console.log("===========================");

export default config;
