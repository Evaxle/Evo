FROM node:20-slim

WORKDIR /usr/src/app

# install deps
COPY package.json package-lock.json* ./
RUN npm install --production || npm install

# app
COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["node", "index.js"]
