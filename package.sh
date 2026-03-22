#!/bin/bash

# Read target parameter
target="$1"

if [ "$target" == "firefox" ]; then
    # Firefox packaging
    mv manifest_firefox.json manifest.json
    zip -r ../privacy-manager-firefox.zip *
    mv manifest.json manifest_firefox.json
else
    # Chrome packaging (default)
    mv manifest_chrome.json manifest.json
    zip -r ../privacy-manager-chrome.zip *
    mv manifest.json manifest_chrome.json
fi