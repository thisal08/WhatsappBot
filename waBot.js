// waBot.js
import bail from "@future-innovations-lk/baileys";
const {
  makeWASocket,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
} = bail;

import P from "pino";
import config from "./config.js";
import { loadPlugins } from "./lib/loader.js";
import { useMongoDBAuthState } from "./lib/auth/mongoAuth.js";
import { handleMessage } from "./messageHandler.js";
import { getSessionSettings } from "./lib/settings/sessionSettings.js";
import { getGroupSettings } from "./lib/settings/groupSettings.js";
import { renderTemplate } from "./lib/helpers/text.js";
import { handleBootCommand } from "./lib/helpers/bootHandler.js";

// session settings cache
const settingsCache = new Map(); // sessionId -> { settings, ts }
async function loadSettings(sessionId) {
  const now = Date.now();
  const cached = settingsCache.get(sessionId);
  if (!cached || now - cached.ts > 5000) {
    const s = await getSessionSettings(sessionId);
    settingsCache.set(sessionId, { settings: s, ts: now });
  }
  return settingsCache.get(sessionId).settings;
}

const pairingRequestedBySession = new Map();

const STATUS_REACTS = [
  "❤️",
  "💙",
  "💚",
  "💛",
  "💜",
  "🧡",
  "🩷",
  "🤍",
  "✨",
  "⚡",
  "😎",
  "😂",
  "🤖",
];
const getRandomReact = () =>
  STATUS_REACTS[Math.floor(Math.random() * STATUS_REACTS.length)];

function formatPairCode(code) {
  if (!code) return code;
  const raw = String(code).replace(/\s+/g, "");
  return raw.length >= 8 ? raw.slice(0, 4) + "-" + raw.slice(4) : raw;
}

export async function connectToWA({ sessionId, number, onPairingCode } = {}) {
  sessionId ||= "default";

  const plugins = await loadPlugins();

  console.log(`🧬 Connecting WhatsApp bot... session=${sessionId}`);

  const { state, saveCreds } = await useMongoDBAuthState(
    config.MONGODB_URI,
    config.DB_NAME,
    sessionId,
  );

  const { version } = await fetchLatestBaileysVersion();

  const conn = makeWASocket({
    logger: P({ level: "silent" }),
    printQRInTerminal: false,
    browser: ["macOS", "Safari", "20.0.0"],
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

  conn.requestPairCodeAndNotify = async () => {
    if (!number) throw new Error("No number provided for pairing.");
    const code = await conn.requestPairingCode(number);
    const pretty = formatPairCode(code);
    if (typeof onPairingCode === "function") await onPairingCode(pretty);
    return pretty;
  };

  conn.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    const already = pairingRequestedBySession.get(sessionId) || false;

    if (qr && !already) {
      pairingRequestedBySession.set(sessionId, true);
      if (number) {
        try {
          await conn.requestPairCodeAndNotify();
        } catch (e) {
          console.log(`❌ [${sessionId}] Pairing failed:`, e.message);
          pairingRequestedBySession.set(sessionId, false);
        }
      }
    }

    if (connection === "open") {
      const botJid = jidNormalizedUser(conn.user.id);
      console.log(`✅ [${sessionId}] Connected`);

      await conn.sendMessage(botJid, {
        text: `🤖 Streamline-MD-V2 connected! (session: ${sessionId})`,
      });
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;

      if (code === 401)
        console.log(`⚠️ [${sessionId}] Auth failed — login again.`);
      else if (code !== DisconnectReason.loggedOut) {
        console.log(`🔄 [${sessionId}] Reconnecting...`);
        pairingRequestedBySession.set(sessionId, false);
        setTimeout(
          () => connectToWA({ sessionId, number, onPairingCode }),
          3000,
        );
      } else {
        console.log(`❌ [${sessionId}] Logged out.`);
      }
    }
  });

  conn.ev.on("creds.update", saveCreds);

  // ✅ Anti-call (per session)
  conn.ev.on("call", async (callEvents) => {
    const settings = await loadSettings(sessionId);
    if (!settings.autoRejectCalls) return;

    for (const call of callEvents) {
      if (call.status !== "offer") continue;
      const jid = call.from;

      try {
        await conn.sendMessage(jid, {
          text: "⚡ STREAM LINE MD (V2) ⚡\n\nCalls aren’t supported 😿\nSend a message instead 💬",
        });
        await conn.rejectCall(call.id, jid);
        console.log(`🚫 [${sessionId}] Call rejected: ${jid}`);
      } catch (err) {
        console.error(`❌ [${sessionId}] [CALL ERROR]`, err);
      }
    }
  });

  // ✅ Welcome / Bye (per group per session)
  conn.ev.on("group-participants.update", async (ev) => {
    try {
      const groupJid = ev.id;
      if (!groupJid?.endsWith("@g.us")) return;

      let meta = null;
      try {
        meta = await conn.groupMetadata(groupJid);
      } catch {}

      const groupName = meta?.subject || "this group";
      const gs = await getGroupSettings(sessionId, groupJid, { groupName });

      if (ev.action === "add" && gs.welcome?.enabled) {
        for (const userJid of ev.participants || []) {
          const text = renderTemplate(gs.welcome.text, {
            user: `@${userJid.split("@")[0]}`,
            group: groupName,
            rules: gs.rules?.text || "",
          });
          await conn.sendMessage(groupJid, { text, mentions: [userJid] });
        }
      }

      if (ev.action === "remove" && gs.bye?.enabled) {
        for (const userJid of ev.participants || []) {
          const text = renderTemplate(gs.bye.text, {
            user: `@${userJid.split("@")[0]}`,
            group: groupName,
          });
          await conn.sendMessage(groupJid, { text, mentions: [userJid] });
        }
      }
    } catch (err) {
      console.error(`❌ [${sessionId}] [GROUP UPDATE ERROR]`, err);
    }
  });

  // ✅ Messages
  conn.ev.on("messages.upsert", async ({ messages }) => {
    const mek = messages?.[0];
    console.log(`📩 [${sessionId}] New message:`, mek);
    if (!mek?.message) return;
    if (mek.message.reactionMessage) return;

    const jid = mek.key.remoteJid;
    const sender = mek.key.participant || jid;

    const settings = await loadSettings(sessionId);

    // per-session kill switch
    if (!settings.botEnabled) {
      const handled = await handleBootCommand(conn, mek, sessionId);
      if (handled) return;
      return;
    }

    // ✅ status auto read/react (per session)
    if (jid === "status@broadcast") {
      try {
        if (settings.autoReadStatus) await conn.readMessages([mek.key]);
        if (settings.autoReactStatus) {
          await new Promise((r) =>
            setTimeout(r, settings.reactDelayMs || 3000),
          );
          await conn.sendMessage(sender, {
            react: { text: getRandomReact(), key: mek.key },
          });
        }
      } catch (err) {
        console.error(`❌ [${sessionId}] [STATUS ERROR]`, err);
      }
      return;
    }

    await handleMessage(conn, mek, {
      sessionId,
      plugins,
      ownerNumbers: config.OWNER_NUMBERS,
      settings,
    });
  });

  return conn;
}
