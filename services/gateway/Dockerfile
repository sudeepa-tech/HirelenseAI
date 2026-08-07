FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
COPY services/gateway/package.json services/gateway/
RUN npm install --omit=dev -w services/gateway
COPY services/gateway services/gateway
COPY frontend/dist frontend/dist
WORKDIR /app/services/gateway
EXPOSE 8080
CMD ["node", "src/index.js"]
