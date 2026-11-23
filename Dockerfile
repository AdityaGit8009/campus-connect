FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
COPY scripts ./scripts
RUN npm ci --omit=dev --ignore-scripts
COPY . .
RUN node scripts/vendor.js && mkdir -p /app/uploads && chown -R node:node /app
USER node
ENV PORT=3000
EXPOSE 3000
CMD ["node","src/server.js"]
