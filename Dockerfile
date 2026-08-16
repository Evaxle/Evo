# Build stage
FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++ git
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Serve stage — runs the Evo backend server (static dist + opencode bridge + terminal)
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache bash git curl openssh-client procps util-linux \
  && curl -fsSL https://opencode.ai/install | bash \
  && ln -sf /root/.opencode/bin/opencode /usr/local/bin/opencode
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
ENV EVO_PORT=4000
EXPOSE 4000
CMD ["node", "dist-server/index.js"]
