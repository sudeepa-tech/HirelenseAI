FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
COPY services/interview-service/package.json services/interview-service/
RUN npm install --omit=dev -w services/interview-service
COPY services/interview-service services/interview-service
WORKDIR /app/services/interview-service
EXPOSE 8082
CMD ["node", "src/index.js"]
