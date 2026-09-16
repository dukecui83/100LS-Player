# Third-party notices

The PolyForm Noncommercial License for 100LS跟读播放器 applies only to original project code and assets owned by duke cui. The third-party components below remain under their own licenses.

## Electron

The desktop application is built with Electron.

- Source: https://github.com/electron/electron
- License: MIT
- Copyright: Electron contributors and GitHub Inc.

Electron also incorporates Chromium, Node.js, and other third-party software. Their notices are included with the Electron runtime distributed in the desktop package.

## FFmpeg / ffmpeg-static

The Windows desktop package includes an FFmpeg executable obtained through `ffmpeg-static` and used to prepare compatible local playback caches.

- ffmpeg-static source: https://github.com/eugeneware/ffmpeg-static
- ffmpeg-static license: GPL-3.0-or-later
- Bundled Windows FFmpeg build: 6.1.1 essentials build from gyan.dev
- Bundled binary license: GPL v3
- Corresponding FFmpeg source revision: https://github.com/FFmpeg/FFmpeg/commit/e38092ef93
- Included license files: `node_modules/ffmpeg-static/LICENSE` and `node_modules/ffmpeg-static/ffmpeg.exe.LICENSE`

## ECDICT

100LS跟读播放器 includes a compact, statically sharded build of the ECDICT English-to-Chinese dictionary database.

- Source: https://github.com/skywind3000/ECDICT
- License: MIT
- Copyright: Copyright (c) 2025 Linwei
- Included license: `public/dictionary/LICENSE.txt`

The generated dictionary shards contain the word, phonetic, Chinese translation, and word-form exchange fields used by the local lookup feature.
