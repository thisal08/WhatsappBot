// commands/viewonce.js
import { downloadMediaMessage, sms } from "../lib/msg.js";
import { format } from "../lib/style.js";
const botdata = JSON.parse(
  fs.readFileSync(new URL("./botdata.json", import.meta.url))
);

function safeReact(ctx, emoji) {
  try {
    if (ctx && typeof ctx.react === "function") return ctx.react(emoji);
  } catch {}
}

function getMessageType(messageObj) {
  if (!messageObj || typeof messageObj !== "object") return null;

  const allowed = [
    "imageMessage",
    "videoMessage",
    "audioMessage",
    "stickerMessage",
    "documentMessage",
  ];

  return allowed.find((k) => k in messageObj) || null;
}

export default {
  pattern: "vv",
  alias: ["viewonce"],
  category: "Tools",
  react: "🫣",

  async function(conn, mek, m, ctx) {
    try {
      const msg = await sms(conn, mek);
      const quoted = msg?.quoted;

      if (!quoted) {
        safeReact(ctx, "❗");
        return ctx.reply(
          format("Please *reply* to the view-once media you want me to save ✨")
        );
      }

      const key = mek?.key || {};
      const targetJid =
        key.remoteJidAlt || key.remoteJid || ctx?.from || msg?.from;

      await ctx.reply(format("Gimme a sec… I’m grabbing it for you 🐾💫"));

      const type = getMessageType(quoted) || quoted?.type;

      const buffer = await downloadMediaMessage(quoted);

      if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
        safeReact(ctx, "❗");
        return ctx.reply(
          format("I couldn’t download that media 😭 Try replying directly to the view-once image/video.")
        );
      }

      const imageCaption = format("✨ *Here Is The View Once Image* ✨");
      const videoCaption = format("✨ *Here Is The View Once Video* ✨");

      const finalType =
        quoted?.type ||
        type ||
        (quoted?.imageMessage
          ? "imageMessage"
          : quoted?.videoMessage
          ? "videoMessage"
          : quoted?.audioMessage
          ? "audioMessage"
          : null);

      if (finalType === "imageMessage") {
        await conn.sendMessage(
          targetJid,
          {
            image: buffer,
            caption: imageCaption,
          },
          { quoted: mek }
        );
      } else if (finalType === "videoMessage") {
        await conn.sendMessage(
          targetJid,
          {
            video: buffer,
            caption: videoCaption,
          },
          { quoted: mek }
        );
      } else if (finalType === "audioMessage") {
        await conn.sendMessage(
          targetJid,
          {
            audio: buffer,
            mimetype: "audio/mpeg",
          },
          { quoted: mek }
        );
      } else if (finalType === "stickerMessage") {
        await conn.sendMessage(
          targetJid,
          {
            sticker: buffer,
          },
          { quoted: mek }
        );
      } else if (finalType === "documentMessage") {
        await conn.sendMessage(
          targetJid,
          {
            document: buffer,
            mimetype:
              quoted?.msg?.mimetype || quoted?.documentMessage?.mimetype,
            fileName:
              quoted?.msg?.fileName ||
              quoted?.documentMessage?.fileName ||
              "file",
          },
          { quoted: mek }
        );
      } else {
        safeReact(ctx, "❗");
        return ctx.reply(format("Unsupported media type 😭"));
      }

      safeReact(ctx, "✅");
    } catch (e) {
      console.log(e);
      safeReact(ctx, "❌");
      ctx.reply(format(botdata.error || "Something went wrong while saving 😭"));
    }
  },
};
