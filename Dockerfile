FROM nginxinc/nginx-unprivileged:stable-alpine
COPY index.html style.css app.js api.js storage.js ui.js markdown.js /usr/share/nginx/html/
COPY vendor/ /usr/share/nginx/html/vendor/
EXPOSE 8080
