import axios from "axios";
import { format } from "../lib/style.js";
import botdata from "../botdata.json" assert { type: "json" };

function cleanTitle(title) {
  return title.replace(/#[\w\d_]+/g, "").trim();
}

function formatNumber(num) {
  if (num >= 1e9) return (num / 1e9).toFixed(1) + "B";
  if (num >= 1e6) return (num / 1e6).toFixed(1) + "M";
  if (num >= 1e3) return (num / 1e3).toFixed(1) + "K";
  return num.toString();
}

export default {
  pattern: "tt",
  alias: ["tdl", "tiktokdl", "tiktok", "ttdl"],
  category: "Download",

  async function(conn, mek, m, ctx) {
    const { q } = ctx;
    const validUrlPattern =
      /https:\/\/(?:www\.)?tiktok\.com\/.*|https:\/\/vt\.tiktok\.com\/.*/;

    if (!q || !validUrlPattern.test(q)) {
      await m.react("❓");
      return m.reply(format("❓ Please provide a valid TikTok video or image URL"));
    }

    const response = await conn.sendMessage(
      ctx.from,
      { text: format("📥 Fetching TikTok content...") },
      { quoted: mek }
    );

    try {
      const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(q)}`;
      const { data } = await axios.get(apiUrl);

      if (!data?.data) throw new Error("Failed to fetch TikTok data");

      const videoData = data.data;
      const clean_title = cleanTitle(videoData.title);

      let stats = `
📥 *TikTok Downloader*

📌 *Title:* ${clean_title}
👤 *Author:* ${videoData.author.nickname}
▶️ *Views:* ${formatNumber(videoData.play_count)}
❤️ *Likes:* ${formatNumber(videoData.digg_count)}
💬 *Comments:* ${formatNumber(videoData.comment_count)}
🔄 *Shares:* ${formatNumber(videoData.share_count)}
      `.trim();

      if (!videoData.images) {
        stats += `\n⏱ *Duration:* ${videoData.duration}s`;
      }

      await conn.sendMessage(ctx.from, {
        text: format(stats),
        edit: response.key,
      });

      if (videoData.images && videoData.images.length > 0) {
        await m.react("🖼️");

        for (const img of videoData.images) {
          await conn.sendMessage(ctx.from, {
            image: { url: img },
            quoted: mek,
          });
        }
      } else {
        await m.react("🎬");

        await conn.sendMessage(ctx.from, {
          video: { url: videoData.play },
          quoted: mek,
        });
      }

    } catch (e) {
      console.log(e);
      m.react("❌");
      await conn.sendMessage(ctx.from, {
        text: format(botdata.error),
        edit: response.key,
      });
    }
  },
};
