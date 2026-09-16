export function isEnglishSubtitleTrack(track) {
  return /^english$/i.test(track?.label || '') || /\.(eng|en)\.srt$/i.test(track?.fileName || '');
}

export function isBilingualSubtitleTrack(track) {
  return /双语/.test(track?.label || '');
}

export function preferredSubtitleTrack(tracks, preferBilingual) {
  if (!Array.isArray(tracks) || tracks.length === 0) return null;
  const preferred = preferBilingual ? isBilingualSubtitleTrack : isEnglishSubtitleTrack;
  const fallback = preferBilingual ? isEnglishSubtitleTrack : isBilingualSubtitleTrack;
  return tracks.find(preferred) || tracks.find(fallback) || tracks[0];
}

export function subtitleVariantAvailability(tracks) {
  return {
    english: tracks.some(isEnglishSubtitleTrack),
    bilingual: tracks.some(isBilingualSubtitleTrack),
  };
}
