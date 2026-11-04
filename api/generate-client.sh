#!/bin/bash

# Function to display usage
show_usage() {
    echo "Usage: $0 <platform> <output-dir>"
    echo ""
    echo "Arguments:"
    echo "  platform     Either 'desktop' or 'mcp'"
    echo "  output-dir   Directory path for generated code output"
    echo ""
    echo "Example:"
    echo "  $0 desktop /home/user/project/src/open-api"
    exit 1
}

# Check if correct number of arguments is provided
if [ $# -ne 2 ]; then
    echo "Error: Exactly 2 arguments are required"
    show_usage
fi

platform=$1
output_dir=$2

# Validate platform argument
if [ "$platform" != "desktop" ] && [ "$platform" != "mcp" ]; then
    echo "Error: Platform must be either 'desktop' or 'mcp'"
    show_usage
fi

# Set generator based on platform
if [ "$platform" = "desktop" ]; then
    generator="typescript-angular"
else
    generator="typescript"
fi

# The generator never deletes a file it no longer produces, so a model dropped from swagger.yml would stay behind.
# Start the generated folders empty; .openapi-generator-ignore and the other root files are kept.
rm -rf "$output_dir/api" "$output_dir/model"

# Execute the OpenAPI generator command
npx @openapitools/openapi-generator-cli generate \
    -i swagger.yml \
    -g "$generator" \
    -o "$output_dir"

# Check if command executed successfully
if [ $? -ne 0 ]; then
    echo "Error: API code generation failed"
    exit 1
fi

echo "API code successfully generated in: $output_dir"
