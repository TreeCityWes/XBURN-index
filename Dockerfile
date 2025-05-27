FROM node:18

# Install PostgreSQL client and set permissions
RUN apt-get update && apt-get install -y postgresql-client && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies and TypeScript globally
RUN npm install -g typescript ts-node
RUN npm install

# Copy source code and schema
COPY . .

# Copy initialization script
COPY init.sh /app/init.sh
RUN chmod +x /app/init.sh

# Set proper permissions
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Build TypeScript code
RUN npm run build

EXPOSE 3000

# Use production command
CMD ["node", "dist/indexer.js"] 