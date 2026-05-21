FROM node:22-alpine
WORKDIR /app

# Install frontend dependencies and build
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Install server dependencies
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --production
COPY server/ .

EXPOSE 3001
CMD ["node", "index.js"]
