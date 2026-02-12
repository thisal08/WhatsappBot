import { downloadMediaMessage, sms } from "../lib/msg.js";
import fs from "fs";
import os from "os";
import path from "path";
const botdata = JSON.parse(
  fs.readFileSync(new URL("./botdata.json", import.meta.url))
);

export default {
  pattern: "setpf",
  alias: ["upf"],
  category: "Owner",
  react: "🖼️",

  async function(conn, mek, m, ctx) {
    const msg = await sms(conn, mek);
    const targetMsg = msg.quoted || msg;
    const { isOwner, isGroup, botJid } = ctx;

    const HEADER = botdata.header;
    const FOOTER = botdata.footer;

    if (isGroup) {
      m.react("❌");
      return m.reply(
        `${HEADER}\n\n⚡ This command works only in private chats.\nFor groups, use *.gsetpf*.\n\n${FOOTER}`
      );
    }

    if (!isOwner) {
      m.react("❌");
      return m.reply(
        `${HEADER}\n\n⛔ Only the owner can change my profile picture.\n\n${FOOTER}`
      );
    }

    if (!targetMsg || targetMsg.type !== "imageMessage") {
      m.react("❌");
      return m.reply(
        `${HEADER}\n\n📷 Reply to an image to set as my profile picture.\n\n${FOOTER}`
      );
    }

    try {
      const buffer = await downloadMediaMessage(targetMsg);

      const tmpFile = path.join(os.tmpdir(), `pf-${Date.now()}.jpg`);
      fs.writeFileSync(tmpFile, buffer);

      await conn.updateProfilePicture(botJid, { url: tmpFile });

      fs.unlinkSync(tmpFile);

      m.react("✅");
      m.reply(
        `${HEADER}\n\n✨ Profile picture updated successfully!\n\n${FOOTER}`
      );

    } catch (err) {
      console.error(err);
      m.react("❌");
      m.reply(
        `${HEADER}\n\n${botdata.error}\n\n${FOOTER}`
      );
    }
  },
};
