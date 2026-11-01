# Supply an operator-reviewed digest, e.g. node:22-bookworm-slim@sha256:...
ARG NODE_IMAGE
FROM ${NODE_IMAGE}
COPY sandbox/load.mjs sandbox/json-check.mjs /opt/qa/
# Populate /opt/npm-cache in a separate trusted build for the target lockfile.
# Never download dependencies or pass credentials during a QA job.
RUN mkdir -p /opt/npm-cache && chmod -R a+rX /opt
USER 65532:65532
WORKDIR /workspace
