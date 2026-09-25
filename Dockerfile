FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
COPY scripts ./scripts
COPY skills ./skills
EXPOSE 5681
CMD ["node","src/index.js"]
