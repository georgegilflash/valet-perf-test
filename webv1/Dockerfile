# Stage 1: Fetch official Grafana k6 binary
FROM grafana/k6:latest AS k6-bin

# Stage 2: Node.js backend + k6 runtime
FROM node:20-alpine

# Install ca-certificates and tzdata for HTTPS SOAP requests and accurate report timestamps
RUN apk add --no-cache ca-certificates tzdata

# Copy k6 binary into /usr/local/bin/k6
COPY --from=k6-bin /usr/bin/k6 /usr/local/bin/k6

WORKDIR /app

# Install Node dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application source and default data pools
COPY src ./src
COPY data ./data

# Ensure reports directory exists
RUN mkdir -p /app/reports

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "start"]
