FROM node:18.5.0-alpine3.15

WORKDIR /app

COPY package.json .
COPY yarn.lock .
COPY tsconfig.json .

RUN yarn install
COPY src/ src/

RUN ls -la

RUN yarn build && rm -rf src/

ENTRYPOINT [ "yarn", "start", "/etc/config.json" ]