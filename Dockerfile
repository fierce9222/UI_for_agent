# build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
# Use npm ci when lockfile exists, otherwise fallback to npm install
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
RUN npm run build

# runtime stage
FROM nginx:alpine
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
