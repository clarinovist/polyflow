#!/bin/bash
PACKAGES=$(gh api "/user/packages?package_type=container&per_page=100" --jq '.[].name')

for pkg in $PACKAGES; do
  echo "Processing package: $pkg"
  # URL encode the package name
  ENCODED_PKG=$(echo "$pkg" | sed 's/\//%2F/g')
  
  # Fetch versions (up to 100 per page, assuming we loop until clean)
  # But simple approach: fetch all using pagination
  VERSIONS_JSON=$(gh api --paginate "/user/packages/container/$ENCODED_PKG/versions" 2>/dev/null)
  
  if [ -z "$VERSIONS_JSON" ]; then
     echo "No versions found for $pkg or error fetching. Skipping."
     continue
  fi
  
  VERSION_IDS=$(echo "$VERSIONS_JSON" | jq -r '.[].id')
  
  # The first one is the newest
  FIRST_VERSION=""
  for vid in $VERSION_IDS; do
    if [ -z "$FIRST_VERSION" ]; then
      FIRST_VERSION="$vid"
      echo "  Keeping latest version: $FIRST_VERSION"
    else
      echo "  Deleting version: $vid"
      gh api -X DELETE "/user/packages/container/$ENCODED_PKG/versions/$vid" --silent 2>/dev/null
    fi
  done
  echo "Done with $pkg"
done
