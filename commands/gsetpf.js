import { downloadMediaMessage, sms } from "../lib/msg.js";
import fs from "fs";
import os from "os";
import path from "path";
import botdata from "../botdata.json" assert { type: "json" };

export default {
  pattern: "gsetpf",
  alias: ["gupf"],
  category: "Owner",
  react: "🖼️",

  async function(conn, mek, m, ctx) {
    const msg = await sms(conn, mek);
    const targetMsg = msg.quoted || msg;

    const { isOwner, isGroup, isAdmins, isBotAdmins, groupJid } = ctx;

    const HEADER = botdata.header;
    const FOOTER = botdata.footer;

    if (!isGroup) {
      m.react("❌");
      return m.reply(`${HEADER}\n\n⚡ This command works only in groups.\n\n${FOOTER}`);
    }

    if (!isOwner && !isAdmins) {
      m.react("❌");
      return m.reply(`${HEADER}\n\n⛔ Only owner or admins can change group profile picture.\n\n${FOOTER}`);
    }

    if (!isBotAdmins) {
      m.react("❌");
      return m.reply(`${HEADER}\n\n⛔ I need admin rights to change profile picture.\n\n${FOOTER}`);
    }

    if (!targetMsg || targetMsg.type !== "imageMessage") {
      m.react("❌");
      return m.reply(`${HEADER}\n\n📷 Reply to an image to set as group profile picture.\n\n${FOOTER}`);
    }

    if (!groupJid) {
      m.react("❌");
      return m.reply(`${HEADER}\n\n⚠️ Unable to retrieve group info.\n\n${FOOTER}`);
    }

    try {
      const buffer = await downloadMediaMessage(targetMsg);

      const tmpFile = path.join(os.tmpdir(), `pf-${Date.now()}.jpg`);
      fs.writeFileSync(tmpFile, buffer);

      await conn.updateProfilePicture(groupJid, { url: tmpFile });

      fs.unlinkSync(tmpFile);

      m.react("✅");
      m.reply(`${HEADER}\n\n✨ Profile picture updated successfully!\n\n${FOOTER}`);

    } catch (err) {
      console.error(err);
      m.react("❌");
      m.reply(`${HEADER}\n\n${botdata.error}\n\n${FOOTER}`);
    }
  },
};
