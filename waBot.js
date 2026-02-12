import makeWASocket, {
  DisconnectReason,
  Browsers,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
} from "@whiskeysockets/baileys";

import P from "pino";
import path from "path";
import { fileURLToPath } from "url";

import { loadPlugins } from "./lib/loader.js";
import { useMongoDBAuthState } from "./lib/auth/mongoAuth.js";
import config from "./config.js";
import { handleMessage } from "./messageHandler.js";
import { getSettings } from "./lib/settings.js";
import { handleBootCommand } from "./lib/bootHandler.js";
import botdata from "./botdata.json" assert { type: "json" };

// =====================================================
// FILE PATH
// =====================================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const number = config.BOT_NUMBER;

let plugins = {};
let pairingRequested = false;

// =====================================================
// SETTINGS CACHE
// =====================================================
let cachedSettings = null;
let lastSettingsLoad = 0;

async function loadSettings() {
  const now = Date.now();
  if (!cachedSettings || now - lastSettingsLoad > 5000) {
    cachedSettings = await getSettings();
    lastSettingsLoad = now;
  }
  return cachedSettings;
}

// =====================================================
// EMOJI POOL
// =====================================================
const STATUS_REACTS = [
  "❤️","💙","💚","💛","💜","🧡","🩷","🩵","🤍","🤎",
  "💖","💘","💝","💗","💓","💞","💟","😍","🥰","😘",
  "🔥","💯","✨","⚡","🌟","🫶","🙌","👏","😎","🤯",
  "😮","🤩","🤝","👌","👍","💥","🎉","😂","🤣","😊",
  "🙂","😜","🤪","🤭","👀","😳","😱","🤔","😏","😌",
  "🌈","🌸","🌼","🌻","🍀","🎨","📸","🎬","🎧","🎶",
  "🚀","🐾","🦋","😈","👻","💀","🤖","🎯"
];

function getRandomReact() {
  return STATUS_REACTS[Math.floor(Math.random() * STATUS_REACTS.length)];
}

// =====================================================
// CONNECT FUNCTION
// =====================================================
export async function connectToWA() {
  console.log("🧬 Connecting WhatsApp bot...");

  const { state, saveCreds } = await useMongoDBAuthState(
    config.MONGODB_URI,
    config.DB_NAME
  );

  const { version } = await fetchLatestBaileysVersion();

  const conn = makeWASocket({
    logger: P({ level: "silent" }),
    printQRInTerminal: false,
    browser: Browsers.ubuntu("Chrome"),
    markOnlineOnConnect: true,
    syncFullHistory: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, P({ level: "silent" })),
    },
    version,
    qrTimeout: 0,
    getMessage: async () => ({ conversation: "" }),
  });

  // =====================================================
  // CONNECTION EVENTS
  // =====================================================
  conn.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !pairingRequested) {
      pairingRequested = true;
      try {
        const code = await conn.requestPairingCode(number);
        console.log("🔗 Pairing Code:", code.slice(0, 4) + "-" + code.slice(4));
      } catch (e) {
        console.log("❌ Pairing failed:", e.message);
      }
    }

    if (connection === "open") {
      const botJid = jidNormalizedUser(conn.user.id);
      console.log("✅ Bot Connected");

      await conn.sendMessage(botJid, {
        text: `${botdata.header}

🤖 *${botdata.botName} (${botdata.version})*
Connected successfully!

${botdata.footer}`,
      });

      plugins = await loadPlugins();
      console.log("🔌 Plugins loaded:", Object.keys(plugins).length);
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;

      if (code === 401) {
        console.log("⚠️ Auth failed — login again.");
      } else if (code !== DisconnectReason.loggedOut) {
        console.log("🔄 Reconnecting in 3 seconds...");
        pairingRequested = false;
        setTimeout(connectToWA, 3000);
      } else {
        console.log("❌ Logged out of WhatsApp.");
      }
    }
  });

  conn.ev.on("creds.update", saveCreds);

  // =====================================================
  // ANTI-CALL SYSTEM
  // =====================================================
  conn.ev.on("call", async (callEvents) => {
    const settings = await loadSettings();
    if (!settings.autoRejectCalls) return;

    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

    for (const call of callEvents) {
      if (call.status !== "offer") continue;

      const jid = call.from;
      const name = "bestie";

      const delayMs = Math.floor(Math.random() * 3000) + 1000;

      const message =
        `${botdata.header}\n\n` +
        `Hey ${name} ✨\n` +
        `Calls aren’t supported right now 😿\n` +
        `Please send a message instead 💬⚡\n\n` +
        `Thanks for understanding 🫶\n\n` +
        `${botdata.footer}`;

      try {
        await conn.sendMessage(jid, { text: message });
        await sleep(delayMs);
        await conn.rejectCall(call.id, jid);
        console.log(`🚫 Call rejected from ${jid}`);
      } catch (err) {
        console.error("❌ Call handler error:", err);
      }
    }
  });

  // =====================================================
  // MESSAGE HANDLER
  // =====================================================
  conn.ev.on("messages.upsert", async ({ messages }) => {
    const mek = messages?.[0];
    if (!mek?.message) return;
    if (mek.message.reactionMessage) return;

    const jid = mek.key.remoteJid;
    const sender = mek.key.participant || jid;

    const settings = await loadSettings();

    // Kill switch
    if (!settings.botEnabled) {
      const handled = await handleBootCommand(conn, mek);
      if (handled) return;
      return;
    }

    // Status Handling
    if (jid === "status@broadcast") {
      try {
        if (settings.autoReadStatus) await conn.readMessages([mek.key]);

        if (settings.autoReactStatus) {
          await new Promise((r) =>
            setTimeout(r, settings.reactDelayMs || 3000)
          );
          await conn.sendMessage(sender, {
            react: { text: getRandomReact(), key: mek.key },
          });
        }
      } catch (err) {
        console.error("❌ Status error:", err);
      }
      return;
    }

    // Normal commands
    try {
      await handleMessage(conn, mek, config.OWNER_NUMBERS);
    } catch (err) {
      console.error("❌ Handler error:", err);
    }
  });

  return conn;
}
