#!/bin/bash
# sync.sh — sincroniza Windows → WSL e reinicia backend

SRC="/mnt/c/Users/felipe.santos/.claude/projects/ClaudeProject/PGD/"
DST="$HOME/PGD/"

echo "🔄 Sincronizando arquivos..."
rsync -av --exclude='node_modules' --exclude='.git' --exclude='dist' "$SRC" "$DST"

echo ""
echo "🔪 Matando processo na porta 3001..."
pkill -9 -f "nest start" 2>/dev/null
pkill -9 -f "ts-node" 2>/dev/null
sleep 1

echo ""
echo "📦 Instalando dependências do backend (se necessário)..."
cd "$DST/backend" && npm install --silent

echo ""
echo "🚀 Iniciando backend..."
npm run start:dev
