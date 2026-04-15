FROM nginx:alpine

# Copy compiled production assets (identical to GCS compiled/)
COPY compiled/ /usr/share/nginx/html/

# Copy nginx config if exists, otherwise use default
COPY nginx.conf /etc/nginx/conf.d/default.conf 2>/dev/null || true

EXPOSE 3000

# Nginx default listens on 80, we remap to 3000 via nginx.conf or env
# Since Cloud Run expects port 3000, we modify default.conf
RUN sed -i 's/listen       80;/listen       3000;/g' /etc/nginx/conf.d/default.conf || \
    echo 'server { listen 3000; location / { root /usr/share/nginx/html; index index.html; try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf

CMD ["nginx", "-g", "daemon off;"]
