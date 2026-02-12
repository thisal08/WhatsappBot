import botdata from "../botdata.json" assert { type: "json" };

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