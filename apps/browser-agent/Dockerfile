FROM mcr.microsoft.com/playwright:v1.60.0-noble AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json .eslintrc.json ./
COPY src ./src
RUN npm run build

FROM mcr.microsoft.com/playwright:v1.60.0-noble
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["node", "dist/server.js"]
