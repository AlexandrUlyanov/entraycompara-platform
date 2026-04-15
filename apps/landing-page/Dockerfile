FROM nginx:alpine

# Copy compiled production assets (identical to GCS compiled/)
COPY compiled/ /usr/share/nginx/html/

# Copy nginx config if it exists
COPY nginx.conf /tmp/nginx.conf
RUN if [ -f /tmp/nginx.conf ]; then \
      mv /tmp/nginx.conf /etc/nginx/conf.d/default.conf; \
    else \
      echo 'server { listen 3000; location / { root /usr/share/nginx/html; index index.html; try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf; \
    fi

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
