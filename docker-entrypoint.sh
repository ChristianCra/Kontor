#!/bin/sh
set -e

# Ohne AUTH_SECRET wird einmalig ein zufälliger Schlüssel erzeugt und im Datenvolume gespeichert,
# damit Anmeldungen einen Neustart überstehen.
if [ -z "$AUTH_SECRET" ]; then
  if [ ! -f /data/auth_secret ]; then
    node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))" > /data/auth_secret
    chmod 600 /data/auth_secret
  fi
  AUTH_SECRET="$(cat /data/auth_secret)"
  export AUTH_SECRET
fi

mkdir -p "$STORAGE_DIR"
# Datenbank anlegen bzw. auf den neuesten Stand bringen
./node_modules/.bin/prisma migrate deploy
exec ./node_modules/.bin/next start -p "$PORT"
