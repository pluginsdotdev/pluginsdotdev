FROM ruby:2.5-slim

RUN apt-get update \
  && apt-get install --assume-yes --no-install-recommends \
      git \
      build-essential \
      nodejs \
  && git clone --depth 1 --branch v2.7.1 https://github.com/slatedocs/slate.git /usr/src/app \
  && cd /usr/src/app \
  && gem install bundler \
  && bundle install \
  && chmod -R 777 /usr/src/app \
  && apt-get remove -y build-essential \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*
