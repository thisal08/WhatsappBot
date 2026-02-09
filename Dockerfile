# ---- BASE ----
FROM node:22-alpine

# Install git (needed for some pnpm deps / scripts)
RUN apk add --no-cache git

# Enable corepack + pnpm
RUN corepack enable && corepack prepare pnpm@10.22.0 --activate

WORKDIR /bot

# Copy manifest files first (best for docker cache)
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./

# Install deps
RUN pnpm install --prod

# Copy rest of project
COPY . .

# Start app
CMD ["pnpm", "start"]
