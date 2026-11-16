#!/usr/bin/env bash
# Restauração de um backup gerado por scripts/backup-mongo.sh.
#
# Uso:
#   MONGO_URI='mongodb+srv://...' ./scripts/restore-mongo.sh backups/arquivo.archive.gz
#   MONGO_URI='mongodb+srv://...' ./scripts/restore-mongo.sh backups/arquivo.archive.gz --yes
#
# Restaure em um cluster vazio/descartável: `mongorestore` faz merge dos
# documentos existentes (sem --drop). A URI nunca é impressa.
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
uso: MONGO_URI='mongodb+srv://...' ./scripts/restore-mongo.sh <arquivo.archive.gz> [--yes]

  --yes, -y  não pede confirmação (para automação/cron)
EOF
}

ARCHIVE=""
ASSUME_YES=0

for arg in "$@"; do
  case "$arg" in
    --yes | -y)
      ASSUME_YES=1
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    --*)
      echo "erro: opção desconhecida: $arg" >&2
      usage
      exit 2
      ;;
    *)
      if [[ -n "$ARCHIVE" ]]; then
        echo "erro: informe apenas um arquivo de backup." >&2
        usage
        exit 2
      fi
      ARCHIVE="$arg"
      ;;
  esac
done

if [[ -z "${MONGO_URI:-}" ]]; then
  echo "erro: MONGO_URI não definido." >&2
  usage
  exit 2
fi

if [[ -z "$ARCHIVE" ]]; then
  echo "erro: informe o arquivo .archive.gz." >&2
  usage
  exit 2
fi

if [[ ! -f "$ARCHIVE" ]]; then
  echo "erro: arquivo não encontrado: $ARCHIVE" >&2
  exit 2
fi

if ! command -v mongorestore >/dev/null 2>&1; then
  echo "erro: mongorestore não encontrado no PATH." >&2
  echo "instale MongoDB Database Tools: https://www.mongodb.com/try/download/database-tools" >&2
  exit 2
fi

if (( ! ASSUME_YES )); then
  if [[ ! -t 0 ]]; then
    echo "erro: confirmação necessária, mas não há terminal interativo; use --yes." >&2
    exit 2
  fi
  echo "ATENÇÃO: restore faz merge no banco apontado por MONGO_URI." >&2
  read -r -p "Continuar? [y/N] " reply
  if [[ ! "$reply" =~ ^[Yy]([Ee][Ss])?$ ]]; then
    echo "restore cancelado." >&2
    exit 1
  fi
fi

echo "restaurando $ARCHIVE"
mongorestore --uri="$MONGO_URI" --gzip --archive="$ARCHIVE"
echo "restore concluído."
