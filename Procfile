db:      postgres -k $PGHOST -c listen_addresses=
redis:   redis-server --port 6379 --dir .data/redis --loglevel warning
neo4j:   neo4j console
web:     bun run --filter @nexus/web dev
workers: bun run --filter @nexus/workers dev
