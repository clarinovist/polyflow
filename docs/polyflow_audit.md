# PolyFlow Secrets Audit
# Generated: 2026-05-08 10:50
# Scope: .env, .env.example, config.yaml, *.json, *.yml di ~/Documents/polyflow
# Note: package-lock.json matches excluded (npm dependency names, not secrets)

## .env
File: /Users/nugroho/Documents/polyflow/.env baris 2: SECRET
File: /Users/nugroho/Documents/polyflow/.env baris 3: SECRET
File: /Users/nugroho/Documents/polyflow/.env baris 4: API_KEY
File: /Users/nugroho/Documents/polyflow/.env baris 7: PASSWORD

## .env.example
File: /Users/nugroho/Documents/polyflow/.env.example baris 6: PASSWORD (comment)
File: /Users/nugroho/Documents/polyflow/.env.example baris 11: SECRET
File: /Users/nugroho/Documents/polyflow/.env.example baris 12: SECRET
File: /Users/nugroho/Documents/polyflow/.env.example baris 17: PASSWORD
File: /Users/nugroho/Documents/polyflow/.env.example baris 28: API_KEY
File: /Users/nugroho/Documents/polyflow/.env.example baris 31: API_KEY (comment)

## docker-compose.yml
File: /Users/nugroho/Documents/polyflow/docker-compose.yml baris 14: SECRET
File: /Users/nugroho/Documents/polyflow/docker-compose.yml baris 16: SECRET
File: /Users/nugroho/Documents/polyflow/docker-compose.yml baris 30: PASSWORD

## docker-compose.dev.yml
File: /Users/nugroho/Documents/polyflow/docker-compose.dev.yml baris 17: SECRET
File: /Users/nugroho/Documents/polyflow/docker-compose.dev.yml baris 18: SECRET
File: /Users/nugroho/Documents/polyflow/docker-compose.dev.yml baris 32: PASSWORD

## Summary
Total findings: 16 (excl. package-lock.json false positives)
- API_KEY: 3
- SECRET: 9
- PASSWORD: 4
- TOKEN: 0

Risk: .env contains live dev credentials (AUTH_SECRET, NEXTAUTH_SECRET, FIREWORKS_API_KEY, POSTGRES_PASSWORD).
