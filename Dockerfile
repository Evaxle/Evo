# Use a Node base image
FROM node:20‑alpine

# Set working directory
WORKDIR /app

# Copy package.json and lockfile
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy rest of the source
COPY . .

# Build the project
RUN npm run build

# Expose the port (if you have a server)
EXPOSE 3000

# Start command
CMD ["npm", "start"]