
const botdata = JSON.parse(
  fs.readFileSync(new URL("./botdata.json", import.meta.url))
);

export const formatMenu = (content) => {
  return `
${botdata.header}

🤖 *${botdata.botName}* (${botdata.version})

${content}

${botdata.footer}
`;
};

export const format = (text) => {
  return `${botdata.header}\n\n${text}\n\n${botdata.footer}`;
};