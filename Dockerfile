
# Base image is Debian Trixie (glibc 2.41), NOT alpine or node:24-slim (bookworm,
# glibc 2.36). @dcl/uws-http-server bundles uWebSockets.js, whose prebuilt binaries
# are glibc-only and require GLIBC >= 2.38: they fail to load on bookworm and
# segfault on alpine (musl), even with gcompat.
FROM node:24-trixie-slim@sha256:287c662bed62f3c7b68ea68544814eaff9d7ed2254d2fc9627f2df5957bb7401 AS builderenv

WORKDIR /app

# some packages require a build step
RUN apt-get update && apt-get install -y --no-install-recommends wget && rm -rf /var/lib/apt/lists/*

# build the app
COPY . /app
RUN yarn install --frozen-lockfile
RUN yarn build

# remove devDependencies, keep only used dependencies
RUN yarn install --prod --frozen-lockfile

########################## END OF BUILD STAGE ##########################

# Debian Trixie (glibc 2.41) — required by uWebSockets.js, see note on the builder stage above.
FROM node:24-trixie-slim@sha256:287c662bed62f3c7b68ea68544814eaff9d7ed2254d2fc9627f2df5957bb7401

RUN apt-get update && \
    apt-get install -y --no-install-recommends wget tini && \
    rm -rf /var/lib/apt/lists/*

# NODE_ENV is used to configure some runtime options, like JSON logger
ENV NODE_ENV=production

ARG COMMIT_HASH=local
ENV COMMIT_HASH=${COMMIT_HASH:-local}

ARG CURRENT_VERSION=Unknown
ENV CURRENT_VERSION=${CURRENT_VERSION:-Unknown}

WORKDIR /app
COPY --from=builderenv /app /app

RUN echo "" > /app/.env

# Please _DO NOT_ use a custom ENTRYPOINT because it may prevent signals
# (i.e. SIGTERM) to reach the service
# Read more here: https://aws.amazon.com/blogs/containers/graceful-shutdowns-with-ecs/
#            and: https://www.ctl.io/developers/blog/post/gracefully-stopping-docker-containers/
ENTRYPOINT ["tini", "--"]
# Run the program under Tini
# V8 heap limit set to 75% of prod container memory (1024MB → 768MB).
CMD [ "/usr/local/bin/node", "--max-old-space-size=768", "--inspect=0.0.0.0:9229", "--trace-warnings", "--abort-on-uncaught-exception", "--unhandled-rejections=strict", "dist/index.js" ]
