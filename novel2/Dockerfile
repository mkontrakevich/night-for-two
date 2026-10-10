FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm config set fetch-retries 5 \
 && npm config set fetch-retry-mintimeout 2000 \
 && npm config set fetch-retry-maxtimeout 120000 \
 && (npm install --omit=dev || (sleep 8 && npm install --omit=dev) || (sleep 15 && npm install --omit=dev))
COPY src ./src
COPY public ./public
EXPOSE 5690
CMD ["npm","start"]
