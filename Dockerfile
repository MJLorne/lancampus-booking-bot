FROM node:22-alpine

WORKDIR /app

# optional: wget für Healthcheck im Container
RUN apk add --no-cache wget

# Dependencies zuerst (Build-Cache)
COPY package*.json ./
RUN npm ci --omit=dev

# App-Code
COPY . .

ENV NODE_ENV=production
ENV TZ=Europe/Berlin
ENV PORT=3000

EXPOSE 3000
CMD ["node", "index.js"]
