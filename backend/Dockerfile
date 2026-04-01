FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache postgresql-client ca-certificates

COPY fonts/NotoSansTC.ttf /app/fonts/NotoSansTC.ttf

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN mkdir -p uploads backups

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/health',r=>process.exit(r.statusCode===200?0:1))"

CMD ["node", "src/index.js"]
