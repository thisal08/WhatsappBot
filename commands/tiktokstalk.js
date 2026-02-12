import axios from "axios";
import botdata from "../botdata.json" assert { type: "json" };
import { format } from "../lib/style.js";

export default {
  pattern: "tiktokstalk",
  alias: ["tstalk", "ttstalk"],
  desc: "Fetch TikTok public profile details using TikWM API.",
  category: "Search",
  react: "📱",

  async function(conn, mek, m, ctx) {
    try {
      const username = ctx.args[0];

      if (!username) {
        return conn.sendMessage(
          ctx.from,
          {
            text: format(
              "❎ Please provide a TikTok username.\n\nExample: *.tiktokstalk backup.pavan.lk*"
            ),
          },
          { quoted: mek }
        );
      }

      const apiUrl = `https://www.tikwm.com/api/user/info/?unique_id=@${encodeURIComponent(
        username
      )}`;

      const { data } = await axios.get(apiUrl);

      if (data.code !== 0 || !data.data) {
        return conn.sendMessage(
          ctx.from,
          {
            text: format("❌ Could not fetch profile. User may not exist."),
          },
          { quoted: mek }
        );
      }

      const user = data.data.user;
      const stats = data.data.stats;

      const caption = `
🎭 *TikTok Profile Viewer*

👤 *Username:* @${user.uniqueId}
📛 *Nickname:* ${user.nickname}
📝 *Bio:* ${user.signature || "No bio"}
🔒 *Private:* ${user.privateAccount ? "Yes" : "No"}

📊 *Statistics*
👥 Followers: ${stats.followerCount.toLocaleString()}
👤 Following: ${stats.followingCount.toLocaleString()}
❤️ Likes: ${stats.heartCount.toLocaleString()}
🎥 Videos: ${stats.videoCount.toLocaleString()}

🌍 Profile: https://www.tiktok.com/@${user.uniqueId}
      `.trim();

      await conn.sendMessage(
        ctx.from,
        {
          image: { url: user.avatarLarger },
          caption: format(caption),
        },
        { quoted: mek }
      );

    } catch (err) {
      console.error("TikTok Stalk Error:", err);

      await conn.sendMessage(
        ctx.from,
        {
          text: format(botdata.error || "⚠️ Something went wrong fetching TikTok data."),
        },
        { quoted: mek }
      );
    }
  },
};
