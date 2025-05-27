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

# For development, use ts-node directly
# For production, build first then use node
EXPOSE 3000

# Use ts-node for development to avoid build issues
CMD ["npm", "run", "dev"] 