FROM nginx:alpine

# Copy compiled production assets (identical to GCS compiled/)
COPY compiled/ /usr/share/nginx/html/

EXPOSE 3000

# Configure nginx to listen on port 3000 for Cloud Run
RUN echo 'server { listen 3000; location / { root /usr/share/nginx/html; index index.html; try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf

CMD ["nginx", "-g", "daemon off;"]
