import { generateCommandMenu } from "../command.js";
import { formatMenu } from "../lib/style.js";

export default {
  pattern: "menu",
  react: "📋",
  category: "Main",

  async function(conn, mek, m, ctx) {
    const rawMenu = await generateCommandMenu();

    const menu = formatMenu(rawMenu);

    await conn.sendMessage(
      ctx.from,
      { text: menu },
      { quoted: mek }
    );
  },
};
