# Liquibase with this repository's changelog, for running migrations in CI.
# Build context: db/
#   docker build -f db/liquibase/Dockerfile db
# Run (the image's entrypoint is liquibase):
#   docker run --rm -e LIQUIBASE_COMMAND_URL -e LIQUIBASE_COMMAND_USERNAME \
#     -e LIQUIBASE_COMMAND_PASSWORD <image> update
FROM liquibase/liquibase:4.33

COPY drivers/postgresql.jar /liquibase/lib/postgresql.jar
COPY changelog.xml /liquibase/changelog.xml
COPY scripts /liquibase/scripts

ENV LIQUIBASE_COMMAND_CHANGELOG_FILE=changelog.xml
