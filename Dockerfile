FROM node:14.8.0-alpine3.12

# git since we want to commit within the container
RUN apk -v --no-cache add \
      git

# puppeteer config
RUN apk -v --no-cache add \
      chromium \
      nss \
      freetype \
      freetype-dev \
      harfbuzz \
      ca-certificates \
      ttf-freefont

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
