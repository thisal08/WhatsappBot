// messageHandler.js
import bail from "@future-innovations-lk/baileys";
const { jidNormalizedUser, getContentType } = bail;

import { sms } from "./lib/msg.js";
import { getGroupAdmins } from "./lib/functions.js";
import { getReply } from "./lib/replyStore.js";
import { extractInteractiveCommand } from "./lib/helpers/interaction.js";

/* =========================
   HELPERS
========================= */
function normalizeHelp(cmd, prefix) {
  if (typeof cmd.help === "function") return cmd.help({ prefix, cmd });
  if (typeof cmd.help === "string" && cmd.help.trim()) return cmd.help.trim();

  const aliases = cmd.alias?.length ? `\nAliases: ${cmd.alias.join(", ")}` : "";
  return `Usage: ${prefix}${cmd.pattern}\n${cmd.disc || "No description."}${aliases}`;
}

function findCommand(plugins, name) {
  const n = String(name || "").toLowerCase();
  const all = Object.values(plugins || {}).filter(Boolean);

  return (
    all.find((c) => c?.pattern?.toLowerCase() === n) ||
    all.find((c) => (c?.alias || []).some((a) => String(a).toLowerCase() === n))
  );
}

/**
 * Extract user-visible text from many WA message types.
 * This ensures reply-store and commands work even when user replies via buttons/lists/etc.
 */
function getBodyText(mek, type) {
  const msg = mek?.message || {};

  if (type === "conversation") return msg.conversation || "";
  if (type === "extendedTextMessage")
    return msg.extendedTextMessage?.text || "";
  if (type === "imageMessage") return msg.imageMessage?.caption || "";
  if (type === "videoMessage") return msg.videoMessage?.caption || "";
  if (type === "documentMessage") return msg.documentMessage?.caption || "";

  // Buttons / lists / templates (common in Baileys)
  if (type === "buttonsResponseMessage") {
    return (
      msg.buttonsResponseMessage?.selectedButtonId ||
      msg.buttonsResponseMessage?.selectedDisplayText ||
      ""
    );
  }

  if (type === "listResponseMessage") {
    return (
      msg.listResponseMessage?.singleSelectReply?.selectedRowId ||
      msg.listResponseMessage?.title ||
      ""
    );
  }

  if (type === "templateButtonReplyMessage") {
    return (
      msg.templateButtonReplyMessage?.selectedId ||
      msg.templateButtonReplyMessage?.selectedDisplayText ||
      ""
    );
  }

  // Newer interactive responses (depends on baileys version)
  if (type === "interactiveResponseMessage") {
    // some builds keep text/json; safest fallback:
    return (
      msg.interactiveResponseMessage?.body?.text ||
      msg.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
      ""
    );
  }

  return "";
}

/**
 * Extract stanzaId for replies from ANY message type.
 * Your old version only checked extendedTextMessage contextInfo, which breaks threads.
 */
function getReplyStanzaId(mek) {
  const msg = mek?.message || {};

  const ctxInfo =
    msg?.extendedTextMessage?.contextInfo ||
    msg?.imageMessage?.contextInfo ||
    msg?.videoMessage?.contextInfo ||
    msg?.documentMessage?.contextInfo ||
    msg?.audioMessage?.contextInfo ||
    msg?.stickerMessage?.contextInfo ||
    msg?.buttonsResponseMessage?.contextInfo ||
    msg?.listResponseMessage?.contextInfo ||
    msg?.templateButtonReplyMessage?.contextInfo ||
    msg?.interactiveResponseMessage?.contextInfo ||
    msg?.messageContextInfo || // sometimes present
    null;

  return ctxInfo?.stanzaId || null;
}

/* =========================
   MAIN
========================= */
export async function handleMessage(
  conn,
  mek,
  {
    sessionId = "default",
    plugins = {},
    ownerNumbers = [],
    settings = null,
  } = {},
) {
  const m = await sms(conn, mek);

  const type = getContentType(mek.message);
  const from = mek.key.remoteJid;

  // ✅ unified body extraction
  let body = getBodyText(mek, type);

  const prefix = settings?.prefix || ".";

  // ✅ UI interaction routing: convert list/button selection into command text
  const interactiveCmd = extractInteractiveCommand(mek);
  if (interactiveCmd && typeof interactiveCmd === "string") {
    body = interactiveCmd.startsWith(prefix)
      ? interactiveCmd
      : `${prefix}${interactiveCmd}`;
  }

  const bodyTrim = (body || "").trim();
  const isCmd = bodyTrim.startsWith(prefix);

  const command = isCmd
    ? bodyTrim.slice(prefix.length).trim().split(/\s+/)[0].toLowerCase()
    : "";

  const args = isCmd
    ? bodyTrim.slice(prefix.length).trim().split(/\s+/).slice(1)
    : [];

  const q = args.join(" ");

  const isGroup = (from || "").endsWith("@g.us");

  // ---------------------------
  // Sender Normalization
  // ---------------------------
  let rawSender;
  if (mek.key.fromMe) rawSender = conn.user.id;
  else if (mek.key.participantAlt) rawSender = mek.key.participantAlt;
  else rawSender = mek.key.participant || mek.key.remoteJid;

  const sender = jidNormalizedUser(rawSender);
  const senderNumber = sender.split("@")[0];

  const botNumber = conn.user.id.split(":")[0];
  const pushname = mek.pushName || "Unknown";

  const isMe = botNumber.includes(senderNumber);
  const isOwner = ownerNumbers.includes(senderNumber) || isMe;

  const botJid = jidNormalizedUser(conn.user.id);

  // Reply helper
  const reply = (text) => conn.sendMessage(from, { text }, { quoted: mek });

  // ---------------------------
  // ✅ Reply listener (session safe) — NOW WORKS FOR ALL MESSAGE TYPES
  // ---------------------------
  const stanzaId = getReplyStanzaId(mek);

  if (stanzaId) {
    const replyData = getReply(sessionId, stanzaId);
    console.log("🧵 stanzaId:", stanzaId, "found:", !!replyData);

    if (replyData?.onReply) {
      try {
        await replyData.onReply(bodyTrim, {
          conn,
          mek,
          m,
          from,
          sender,
          senderNumber,
          isOwner,
          reply,
          sessionId,
          settings,
          prefix,
          key: mek.key,
          plugins,
          isGroup,
          pushname,
          botJid,
          botNumber,
        });
      } catch (err) {
        console.error("❌ [REPLY HANDLER ERROR]", err);
      }
      return; // stop normal command processing
    }
  }

  // ---------------------------
  // ✅ Not a command? done.
  // ---------------------------
  if (!isCmd) return;

  // ---------------------------
  // Group info (lazy: only when command exists + needs ctx)
  // ---------------------------
  let groupMetadata = null;
  let groupName = "";
  let participants = [];
  let groupAdmins = [];
  let isBotAdmins = false;
  let isAdmins = false;

  if (isGroup) {
    groupMetadata = await conn.groupMetadata(from).catch(() => null);
    groupName = groupMetadata?.subject || "";
    participants = groupMetadata?.participants || [];
    groupAdmins = await getGroupAdmins(participants);
    isBotAdmins = groupAdmins.includes(botJid);
    isAdmins = groupAdmins.includes(sender);
  }

  const cmd = findCommand(plugins, command);

  if (!cmd) {
    return reply(
      `❌ Unknown command: *${command}*\nType *${prefix}help* to see commands.`,
    );
  }

  // ✅ .cmd help / ? / --help
  if (q === "help" || q === "?" || q === "--help") {
    return reply(
      `📖 *Help — ${prefix}${cmd.pattern}*\n\n${normalizeHelp(cmd, prefix)}`,
    );
  }

  // react
  if (cmd.react) {
    await conn.sendMessage(from, {
      react: { text: cmd.react, key: mek.key },
    });
  }

  try {
    await cmd.function(conn, mek, m, {
      from,
      body: bodyTrim,
      isCmd,
      command,
      args,
      q,
      isGroup,
      sender,
      senderNumber,
      botNumber,
      botJid,
      pushname,
      isMe,
      isOwner,

      groupMetadata,
      groupName,
      participants,
      groupAdmins,
      isBotAdmins,
      isAdmins,

      reply,

      // ✅ session + runtime
      sessionId,
      settings,
      prefix,
      plugins,
    });
  } catch (e) {
    console.error("❌ [PLUGIN ERROR]", e);
    reply(`❌ Error in *${cmd.pattern}*\n${e?.message || e}`);
  }
}
