export DB_FILENAME=wrangler.db
export DB_ENGINE=sqlite
export ENCRYPTION_KEY=test
export SECRET_KEY=test
export REDIS_HOST=redis
export REDIS_PORT=6379

# E2E test configuration (Playwright) — local defaults; CI overrides from GitHub secrets
export E2E_BASE_URL=http://localhost:4200
export E2E_USER_USERNAME=e2e-user
export E2E_USER_PASSWORD=e2e-user-password
export E2E_ADMIN_USERNAME=e2e-admin
export E2E_ADMIN_PASSWORD=e2e-admin-password
