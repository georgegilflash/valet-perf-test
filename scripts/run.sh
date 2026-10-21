#!/usr/bin/env bash

# k6 Performance Test Runner with .env support
set -e

SCRIPT="${1:-main.js}"
ENV_FILE="${2:-.env}"

echo -e "\033[36m=== k6 Performance Test Runner ===\033[0m"

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
    echo -e "\033[31mError: k6 is not installed or not in PATH.\033[0m"
    echo -e "\033[33mInstall via: brew install k6 (macOS) or sudo apt-key / apt-get install k6 (Linux)\033[0m"
    exit 1
fi

mkdir -p reports/known-drivers reports/known-driver-changes reports/kiosk reports/valet reports/pms reports/sign reports/payments reports/polling reports/device

RUN_TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
ENV_ARGS=("-e" "RUN_TIMESTAMP=$RUN_TIMESTAMP")
if [ -f "$ENV_FILE" ]; then
    echo -e "\033[32mLoading environment variables from $ENV_FILE...\033[0m"
    while IFS= read -r line || [ -n "$line" ]; do
        # Ignore comments and empty lines
        if [[ ! "$line" =~ ^[[:space:]]*# ]] && [[ -n "$line" ]]; then
            key=$(echo "$line" | cut -d '=' -f 1 | xargs)
            val=$(echo "$line" | cut -d '=' -f 2- | xargs)
            if [ -n "$key" ]; then
                ENV_ARGS+=("-e" "$key=$val")
            fi
        fi
    done < "$ENV_FILE"
else
    echo -e "\033[33mNotice: $ENV_FILE not found. Running with defaults from config/env.js\033[0m"
fi

echo -e "\033[36mRunning k6...\033[0m"
k6 run "${ENV_ARGS[@]}" "$SCRIPT"
