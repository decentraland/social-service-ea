
FROM node:20-alpine AS builderenv

WORKDIR /app

# some packages require a build step
RUN apk update && apk add --no-cache wget

# build the app
COPY . /app
RUN yarn install --frozen-lockfile
RUN yarn build

# remove devDependencies, keep only used dependencies
RUN yarn install --prod --frozen-lockfile

########################## END OF BUILD STAGE ##########################

FROM node:20-alpine

RUN apk update && \
    apk add --no-cache wget tini libstdc++ gcompat && \
    rm -rf /var/cache/apk/*

# NODE_ENV is used to configure some runtime options, like JSON logger
ENV NODE_ENV=production

ARG COMMIT_HASH=local
ENV COMMIT_HASH=${COMMIT_HASH:-local}

ARG CURRENT_VERSION=Unknown
ENV CURRENT_VERSION=${CURRENT_VERSION:-Unknown}

# Set V8 heap limit to 75% of container memory (prod=1024MB, so 768MB).
# Override at deploy time via environment variable for non-prod (e.g. 384 for 512MB containers).
ENV NODE_OPTIONS="--max-old-space-size=768"

WORKDIR /app
COPY --from=builderenv /app /app

RUN echo "" > /app/.env

# Please _DO NOT_ use a custom ENTRYPOINT because it may prevent signals
# (i.e. SIGTERM) to reach the service
# Read more here: https://aws.amazon.com/blogs/containers/graceful-shutdowns-with-ecs/
#            and: https://www.ctl.io/developers/blog/post/gracefully-stopping-docker-containers/
ENTRYPOINT ["tini", "--"]
# Run the program under Tini
CMD [ "/usr/local/bin/node", "--inspect=0.0.0.0:9229", "--trace-warnings", "--abort-on-uncaught-exception", "--unhandled-rejections=strict", "dist/index.js" ]
