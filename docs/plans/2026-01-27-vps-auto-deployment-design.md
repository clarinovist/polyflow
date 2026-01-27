# VPS Auto-Deployment Design

**Date:** 2026-01-27
**Topic:** Automating Deployment from GitHub to VPS

## Overview
Currently, the CI pipeline builds and pushes images to GitHub Container Registry (GHCR). We want to automate the process so that every successful build on `main` is immediately deployed to the VPS.

## Proposed Approaches

### Approach 1: GitHub SSH Deploy (Recommended)
GitHub Actions logs into the VPS via SSH and executes deployment commands.

- **Workflow**:
    1. CI builds and pushes image to GHCR.
    2. CD job starts.
    3. Action uses `appleboy/ssh-action` to connect to VPS.
    4. Commands:
       ```bash
       docker compose pull polyflow
       docker compose up -d polyflow
       ```
- **Pros**: Flexible, no extra software on VPS, very fast.
- **Cons**: Requires storing SSH Private Key in GitHub Secrets.

### Approach 2: Pull-based via Webhook
A small service on the VPS listening for a GitHub Webhook to trigger the update.

- **Pros**: No inbound SSH needed for GitHub.
- **Cons**: Requires managing another service on the VPS.

## Technical Requirements (Approach 1)

### 1. GitHub Secrets
We need to add these to the repository:
- `SSH_HOST`: VPS IP address.
- `SSH_USER`: Username (e.g., `root` or a deploy user).
- `SSH_PRIVATE_KEY`: Private SSH key for access.
- `SSH_PORT`: (Optional) Custom SSH port.

### 2. VPS Setup
- Docker and Docker Compose installed.
- Access to GHCR (already handled via `docker login` or PAT).
- `docker-compose.yml` file located at a known path (e.g., `~/polyflow/docker-compose.yml`).

## Proposed Implementation Details

### Workflow Update
Update `.github/workflows/build.yml` to add a `deploy` job after `build-and-push`.

```yaml
  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to VPS via SSH
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.SSH_HOST }}
          username: ${{ secrets.SSH_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          port: ${{ secrets.SSH_PORT }}
          script: |
            cd /root/polyflow
            docker compose pull polyflow
            docker compose up -d polyflow
            docker image prune -f
```

## Questions for Validation
1. [x] Di folder mana Bapak menyimpan file `docker-compose.yml` di VPS? (**Confirmed: /root/polyflow/**)
2. [ ] Apakah Bapak sudah memiliki SSH Key untuk login ke VPS tanpa password?
