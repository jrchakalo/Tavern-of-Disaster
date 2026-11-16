#!/usr/bin/env bash
# Backup compactado do MongoDB (Atlas M0 ou local).
#
# Uso:
#   MONGO_URI='mongodb+srv://...' ./scripts/backup-mongo.sh
#   MONGO_URI='mongodb+srv://...' BACKUP_DIR=/mnt/backup ./scripts/backup-mongo.sh
#
# A URI nunca é impressa. O arquivo .archive.gz vai para backups/ (ignorado pelo
# Git) por padrão; copie-o para um drive/S3 fora do repositório.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"

if [[ -z "${MONGO_URI:-}" ]]; then
  echo "erro: MONGO_URI não definido." >&2
  echo "uso: MONGO_URI='mongodb+srv://...' $0" >&2
  exit 2
fi

if ! command -v mongodump >/dev/null 2>&1; then
  echo "erro: mongodump não encontrado no PATH." >&2
  echo "instale MongoDB Database Tools: https://www.mongodb.com/try/download/database-tools" >&2
  exit 2
fi

BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
case "$BACKUP_DIR" in
  /*) ;;
  *) BACKUP_DIR="$REPO_ROOT/$BACKUP_DIR" ;;
esac

# Dump contém dados de usuários: restringe diretório/arquivo ao dono.
umask 077

mkdir -p -- "$BACKUP_DIR"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE="$BACKUP_DIR/tavern-of-disaster-$TIMESTAMP.archive.gz"

echo "criando backup em $ARCHIVE"
mongodump --uri="$MONGO_URI" --gzip --archive="$ARCHIVE"

if [[ ! -s "$ARCHIVE" ]]; then
  echo "erro: mongodump terminou sem criar um arquivo não vazio." >&2
  exit 1
fi

echo "backup concluído: $ARCHIVE"
echo "copie este arquivo para fora do repositório (drive pessoal/S3)."
