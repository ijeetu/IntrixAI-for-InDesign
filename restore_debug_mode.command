#!/bin/bash
# Revert CEP Debug Mode to previous state
cd "$(dirname "$0")"
defaults write com.adobe.CSXS.9 PlayerDebugMode 1
echo "Restored PlayerDebugMode for com.adobe.CSXS.9"
defaults write com.adobe.CSXS.10 PlayerDebugMode 1
echo "Restored PlayerDebugMode for com.adobe.CSXS.10"
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
echo "Restored PlayerDebugMode for com.adobe.CSXS.11"
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
echo "Restored PlayerDebugMode for com.adobe.CSXS.12"
defaults write com.adobe.CSXS.13 PlayerDebugMode 1
echo "Restored PlayerDebugMode for com.adobe.CSXS.13"
defaults write com.adobe.CSXS.14 PlayerDebugMode 1
echo "Restored PlayerDebugMode for com.adobe.CSXS.14"
defaults write com.adobe.CSXS.15 PlayerDebugMode 1
echo "Restored PlayerDebugMode for com.adobe.CSXS.15"
echo "----------------------------------------"
echo "✅ Reverted debug mode settings successfully!"
echo "Press [Enter] to close..."
read
