{
  description = "Nexus Platform";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = {
    self,
    nixpkgs,
  }: let
    inherit (nixpkgs) lib;
    supportedSystems = [
      "x86_64-linux"
      "aarch64-linux"
      "aarch64-darwin"
    ];

    forEachSupportedSystem = f:
      lib.genAttrs supportedSystems (
        system:
          f {
            pkgs = import nixpkgs {
              inherit system;
            };
          }
      );
  in {
    devShells = forEachSupportedSystem (
      {pkgs}:
        with pkgs; {
          default = mkShell {
            packages = [
              # web
              bun
              biome
              typescript-go
              vscode-json-languageserver
              tailwindcss-language-server

              # nix
              nixd
              alejandra

              # services
              postgresql
              redis
              neo4j
              hivemind

              # memes
              figlet
              lolcat
            ];

            env = rec {
              PRODUCT_NAME = "Nexus";

              # postgres (DATABASE_URL set in shellHook — needs $PWD for socket path)
              PGDATABASE = "nexus";

              # neo4j
              NEO4J_URI = "bolt://localhost:7687";
              NEO4J_USER = "neo4j";
              NEO4J_PASSWORD = "nexus-dev";

              # redis
              REDIS_URL = "redis://localhost:6379";

              # s3 (Cloudflare R2 — keys loaded from .env)
              S3_ENDPOINT = "https://22eb1fb8984276aecf1dfbeb78a40f31.eu.r2.cloudflarestorage.com";
              S3_BUCKET = "nexus";
              S3_REGION = "auto";

              # auth
              BETTER_AUTH_SECRET = "nix-dev-secret-change-in-prod";
              BETTER_AUTH_URL = "http://localhost:3000";

              # misc
              LOG_LEVEL = "debug";
            };

            shellHook = ''
              export PATH="$PWD/scripts:$PATH"
              export PGDATA="$PWD/.data/postgres"
              export PGHOST="$PWD/.data/postgres"
              export DATABASE_URL="postgres:///nexus?host=$PGHOST"
              export NEO4J_HOME="$PWD/.data/neo4j"

              # initialise postgres data locally within the project
              if [ ! -d "$PGDATA" ]; then
                mkdir -p "$PGDATA"
                initdb --no-locale --encoding=UTF8 --auth=trust
              fi

              # initialise neo4j data locally within the project
              if [ ! -d "$NEO4J_HOME/data" ]; then
                mkdir -p "$NEO4J_HOME"/{data,logs,run,plugins,conf}
                cat > "$NEO4J_HOME/conf/neo4j.conf" <<NEOCONF
              server.bolt.listen_address=:7687
              server.http.listen_address=:7474
              server.directories.data=$PWD/.data/neo4j/data
              server.directories.logs=$PWD/.data/neo4j/logs
              server.directories.run=$PWD/.data/neo4j/run
              server.directories.plugins=$PWD/.data/neo4j/plugins
              initial.dbms.default_database=neo4j
              dbms.security.auth_enabled=true
              NEOCONF
                # set initial password
                neo4j-admin dbms set-initial-password nexus-dev 2>/dev/null || true
              fi

              # initialise redis data dir
              mkdir -p "$PWD/.data/redis"

              # ensure postgres database exists
              scripts/withpg sh -c "
                psql -lqt | grep $PGDATABASE -q || createdb $PGDATABASE 2>/dev/null
              "

              echo bun: installing deps
              bun install --silent

              # push database schema
              scripts/withpg sh -c "
                bun run db:push
              "

              figlet $PRODUCT_NAME | lolcat --seed 42069
            '';
          };
        }
    );
  };
}
