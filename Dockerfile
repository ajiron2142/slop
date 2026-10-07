FROM nginxinc/nginx-unprivileged:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/
COPY app/ /usr/share/nginx/html/app/
COPY styles/ /usr/share/nginx/html/styles/
COPY fonts/ /usr/share/nginx/html/fonts/
COPY vendor/ /usr/share/nginx/html/vendor/
EXPOSE 8080
