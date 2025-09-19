# GitHub Stars Extension Icons

This directory contains the logo and icon files for the GitHub Stars Chrome Extension.

## Design Concept

The logo combines:
- **Golden star**: Represents GitHub repository stars (the core functionality)
- **Dark background**: Uses GitHub's signature dark theme color (#24292f)
- **Blue badge indicator**: Small badge in bottom-right representing the inline badge feature
- **Clean, minimal design**: Suitable for browser extension icons at various sizes

## Files

### Production Icons (PNG format - used by Chrome extension)
- `icon16.png` - Small icon for browser toolbar (16x16)
- `icon48.png` - Medium icon for extension management (48x48) 
- `icon128.png` - Large icon for Chrome Web Store (128x128)

### Source Files (SVG format - for editing and reference)
- `logo.svg` - Main logo file (128x128)
- `icon16.svg` - Source file for 16x16 icon
- `icon48.svg` - Source file for 48x48 icon
- `icon128.svg` - Source file for 128x128 icon

## Color Palette

- **Background**: #24292f (GitHub dark)
- **Star**: #ffd700 (Gold)
- **Star outline**: #ffffff (White)
- **Badge**: #0969da (GitHub blue)
- **Badge text**: #ffffff (White)

## Usage

These PNG icons are referenced in `manifest.json` and will be used by Chrome for:
- Browser toolbar display
- Extension management page
- Chrome Web Store listing
- System notifications

The PNG format is required by Chrome extensions (SVG and WebP are not supported). The source SVG files are kept for easy editing and re-generation of PNG files when needed.