FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
COPY services/ai-service/package.json services/ai-service/
RUN npm install --omit=dev -w services/ai-service
COPY services/ai-service services/ai-service
WORKDIR /app/services/ai-service
EXPOSE 8081
CMD ["node", "src/index.js"]
