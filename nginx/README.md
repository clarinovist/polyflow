# Nginx Configuration - Moved to Central Directory

⚠️ **Note**: This nginx configuration has been moved to the central config directory for better maintainability.

## Current Location
The active nginx configuration for polyflow ERP is now located at:
```
/root/nginx-configs/polyflow.conf
```

## Architecture
This project uses a **centralized nginx configuration** approach where all nginx configs are stored in `/root/nginx-configs/` and mounted by the ceritakita-nginx reverse proxy.

### Structure
```
/root/nginx-configs/
├── ceritakita.conf      # Ceritakita booking site
├── ads-tracker.conf     # Ads tracking platform
└── polyflow.conf        # Polyflow ERP (this project)
```

## Benefits
- ✅ Zero cross-project dependencies
- ✅ No config loss when updating other projects
- ✅ Single source of truth for all nginx configs
- ✅ Easy backup and version control

## Making Changes
To modify the nginx configuration for polyflow:

1. Edit the central config:
   ```bash
   nano /root/nginx-configs/polyflow.conf
   ```

2. Test the configuration:
   ```bash
   docker exec ceritakita-nginx nginx -t
   ```

3. Reload nginx:
   ```bash
   docker exec ceritakita-nginx nginx -s reload
   ```

## Backup
The file in this directory (`polyflow.conf`) is kept for reference only. The active configuration is in `/root/nginx-configs/`.

For backup:
```bash
tar -czf nginx-configs-backup.tar.gz /root/nginx-configs/
```

## More Information
See the main deployment documentation or ceritakita-booking project for more details on the centralized nginx architecture.
