FROM node:18-bullseye
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund --omit=optional
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node","index.js"]
