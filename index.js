import express from "express";
import { connectToWA } from "./waBot.js";
import config from "./config.js";
import { listEnabledSessions } from "./lib/sessions/sessionStore.js";

const app = express();
const port = process.env.PORT || 5035;

app.get("/", (req, res) => res.send("Bot started ✅"));
app.listen(port, () =>
  console.log(`Server running on http://localhost:${port}`),
);

setTimeout(async () => {
  // always ensure default exists
  const sessions = await listEnabledSessions();

  // if default not in registry, still start it
  const hasDefault = sessions.some((s) => s.sessionId === "default");

  const toStart = hasDefault
    ? sessions
    : [{ sessionId: "default", number: config.BOT_NUMBER }, ...sessions];

  console.log(
    "🔁 Boot starting sessions:",
    toStart.map((s) => s.sessionId).join(", "),
  );

  for (const s of toStart) {
    connectToWA({
      sessionId: s.sessionId,
      number:
        s.number || (s.sessionId === "default" ? config.BOT_NUMBER : null),
      onPairingCode: (code) =>
        console.log(`🔗 [${s.sessionId}] Pairing code:`, code),
    }).catch((e) => console.error(`❌ Failed to start ${s.sessionId}`, e));
  }
}, 1500);
