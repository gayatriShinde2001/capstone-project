FROM nginx:alpine

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/nginx.conf

RUN touch /var/run/nginx.pid && \
  chown -R nginx:nginx /var/run/nginx.pid /var/cache/nginx

USER nginx
EXPOSE 80
