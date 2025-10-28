#!/bin/bash

# This script generates config.js from env.template.js during Netlify build
# It replaces environment variables with actual values from Netlify

# Template file
TEMPLATE_FILE="env.template.js"

# Output file
OUTPUT_FILE="assets/js/config.js"

# Check if template exists
if [ ! -f "$TEMPLATE_FILE" ]; then
    echo "Error: $TEMPLATE_FILE not found"
    exit 1
fi

# Create output directory if it doesn't exist
mkdir -p assets/js

# Replace environment variables
sed -e "s|\${SUPABASE_URL}|${SUPABASE_URL}|g" \
    -e "s|\${SUPABASE_PUBLIC_KEY}|${SUPABASE_PUBLIC_KEY}|g" \
    "$TEMPLATE_FILE" > "$OUTPUT_FILE"

echo "Generated $OUTPUT_FILE"

