import { downloadContentFromMessage } from "@whiskeysockets/baileys";

export default {
  pattern: "sdlp",
  desc: "Download quoted WhatsApp status and send to bot",
  category: "Download",
  react: "⬇️",

  async function(conn, mek, m, ctx) {
    const chatId = ctx.from;
    const botJid = conn.user.id; // Bot's own JID
    const msg = mek.message;

    if (!msg) return;

    const type = Object.keys(msg)[0];
    const contextInfo = msg[type]?.contextInfo;

    // Check if replying to a status
    if (!contextInfo || contextInfo.remoteJid !== "status@broadcast") {
      return await conn.sendMessage(
        chatId,
        { text: "❌ Please reply to a *Status update* to download it." },
        { quoted: mek }
      );
    }

    const quotedMsg = contextInfo.quotedMessage;
    if (!quotedMsg) return;

    try {
      const quotedType = Object.keys(quotedMsg)[0];
      const mediaData = quotedMsg[quotedType];

      // TEXT STATUS
      if (
        quotedType === "conversation" ||
        quotedType === "extendedTextMessage"
      ) {
        const text =
          quotedMsg.conversation || quotedMsg.extendedTextMessage?.text;

        return await conn.sendMessage(
          botJid,
          { text: `📝 *Status Text:*\n\n${text}` }
        );
      }

      // MEDIA STATUS (image / video)
      const stream = await downloadContentFromMessage(
        mediaData,
        quotedType.replace("Message", "")
      );

      let buffer = Buffer.from([]);
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
      }

      if (quotedType === "imageMessage") {
        await conn.sendMessage(botJid, {
          image: buffer,
          caption: mediaData.caption || "",
        });
      } else if (quotedType === "videoMessage") {
        await conn.sendMessage(botJid, {
          video: buffer,
          caption: mediaData.caption || "",
        });
      }

      // Optional confirmation in chat
      await conn.sendMessage(
        chatId,
        { text: "✅ Status sent." },
        { quoted: mek }
      );

    } catch (err) {
      console.error("Status Download Error:", err);
      await conn.sendMessage(
        chatId,
        { text: "❌ Failed to download status media." },
        { quoted: mek }
      );
    }
  },
};
