# Multi-stage Dockerfile for Mood Board App
# Stage 1: Build Next.js app
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code and build
COPY . .
RUN npm run build

# Stage 2: Python backend
FROM python:3.11-slim AS python-backend

WORKDIR /app/python-backend

# Install Python dependencies
COPY python-backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy Python backend code
COPY python-backend/ .

# Stage 3: Final production image
FROM node:18-alpine AS production

WORKDIR /app

# Install Python in the Node.js image
RUN apk add --no-cache python3 py3-pip

# Copy built Next.js app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/node_modules ./node_modules

# Copy Python backend
COPY --from=python-backend /app/python-backend ./python-backend

# Install Python dependencies
WORKDIR /app/python-backend
RUN pip install --no-cache-dir -r requirements.txt

WORKDIR /app

# Expose ports
EXPOSE 3000 5000

# Install concurrently for running both services
RUN npm install -g concurrently

# Start both services
CMD ["npm", "run", "start"]
