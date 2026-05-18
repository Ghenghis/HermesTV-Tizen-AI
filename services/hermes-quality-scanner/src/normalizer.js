'use strict';

/**
 * normalizer.js
 * Converts raw ffprobe JSON output into the HermesTV quality JSON schema.
 */

// ---------------------------------------------------------------------------
// Resolution label from height
// ---------------------------------------------------------------------------
function resolutionLabel(height) {
  if (!height) return null;
  if (height > 1440) return '4K';
  if (height > 1080) return '1440p';
  if (height > 720)  return '1080p';
  if (height > 480)  return '720p';
  return '480p';
}

// ---------------------------------------------------------------------------
// Bitrate bucket
// ---------------------------------------------------------------------------
function bitrateBucket(kbps) {
  if (kbps == null) return null;
  if (kbps < 1000)  return 'low';
  if (kbps < 4000)  return 'medium';
  if (kbps < 10000) return 'high';
  return 'ultra';
}

// ---------------------------------------------------------------------------
// FPS from avg_frame_rate fraction string (e.g. "30000/1001" or "25/1")
// ---------------------------------------------------------------------------
function parseFps(avgFrameRate) {
  if (!avgFrameRate || avgFrameRate === '0/0') return null;
  const parts = avgFrameRate.split('/');
  if (parts.length === 2) {
    const num = parseFloat(parts[0]);
    const den = parseFloat(parts[1]);
    if (den === 0) return null;
    return Math.round((num / den) * 100) / 100; // 2 decimal places
  }
  return parseFloat(avgFrameRate) || null;
}

// ---------------------------------------------------------------------------
// HDR detection
// ---------------------------------------------------------------------------
const HDR_TRANSFERS = new Set([
  'smpte2084',    // HDR10 / PQ
  'arib-std-b67', // HLG
  'smpte428',
  'bt2020-10',
  'bt2020-12',
]);

function detectHdr(videoStream) {
  if (!videoStream) return { hdr: false, hdr_format: null };

  const primaries = videoStream.color_primaries || '';
  const transfer  = videoStream.color_transfer   || '';
  const sideData  = videoStream.side_data_list    || [];

  let hdr = false;
  let hdrFormat = null;

  // Dolby Vision side data
  const hasDolbyVision = sideData.some(
    sd => sd.side_data_type && sd.side_data_type.toLowerCase().includes('dolby vision')
  );
  if (hasDolbyVision) {
    hdr = true;
    hdrFormat = 'Dolby Vision';
  }

  // HDR10 / PQ
  if (!hdrFormat && primaries === 'bt2020' && transfer === 'smpte2084') {
    hdr = true;
    hdrFormat = 'HDR10';
  }

  // HLG
  if (!hdrFormat && transfer === 'arib-std-b67') {
    hdr = true;
    hdrFormat = 'HLG';
  }

  // Generic bt2020 primary with known HDR transfer
  if (!hdrFormat && primaries === 'bt2020' && HDR_TRANSFERS.has(transfer)) {
    hdr = true;
    hdrFormat = 'HDR';
  }

  return { hdr, hdr_format: hdrFormat };
}

// ---------------------------------------------------------------------------
// Upscale signal detection — 5 signals; flag if ≥2 fire
// ---------------------------------------------------------------------------
function detectUpscale(videoStream, resLabel, bitrateKbps, fps) {
  if (!videoStream) return { possible_upscale: false, upscale_signals_triggered: [] };

  const triggered = [];

  const height      = videoStream.height        || 0;
  const codec       = (videoStream.codec_name   || '').toLowerCase();
  const profile     = (videoStream.profile      || '').toLowerCase();
  const colorSpace  = (videoStream.color_space  || '').toLowerCase();
  const pixFmt      = (videoStream.pix_fmt      || '').toLowerCase();

  // Signal 1: bitrate too low for declared resolution
  const bLow = (
    (resLabel === '4K'    && bitrateKbps != null && bitrateKbps < 8000) ||
    (resLabel === '1440p' && bitrateKbps != null && bitrateKbps < 4000) ||
    (resLabel === '1080p' && bitrateKbps != null && bitrateKbps < 2000)
  );
  if (bLow) triggered.push(1);

  // Signal 2: codec profile mismatch
  const profileMismatch = (
    (resLabel === '4K' && codec === 'h264' && profile.includes('main') && !profile.includes('high')) ||
    (resLabel === '4K' && codec === 'hevc' && profile === 'main' /* not Main10 */)
  );
  if (profileMismatch) triggered.push(2);

  // Signal 3: fps > 60 AND bitrate < 6000 kbps at 4K
  if (resLabel === '4K' && fps != null && fps > 60 && bitrateKbps != null && bitrateKbps < 6000) {
    triggered.push(3);
  }

  // Signal 4: height > 1080 but color_space = bt709
  if (height > 1080 && colorSpace === 'bt709') {
    triggered.push(4);
  }

  // Signal 5: height > 1080 but pixel_format is yuv420p (not yuv420p10le)
  if (height > 1080 && pixFmt === 'yuv420p') {
    triggered.push(5);
  }

  return {
    possible_upscale: triggered.length >= 2,
    upscale_signals_triggered: triggered,
  };
}

// ---------------------------------------------------------------------------
// Failure mode mapping
// ---------------------------------------------------------------------------
const FAILURE_MODES = new Set([
  'timeout',
  'connection_refused',
  'auth_failed',
  'no_video_stream',
  'unsupported_codec',
  'parse_error',
]);

function resolveFailureMode(mode) {
  if (!mode) return null;
  return FAILURE_MODES.has(mode) ? mode : 'probe_error';
}

// ---------------------------------------------------------------------------
// Main normalizer
// ---------------------------------------------------------------------------
/**
 * Normalize raw ffprobe output into the HermesTV quality schema.
 *
 * @param {string} streamId   The stream identifier.
 * @param {object} rawFfprobe The parsed ffprobe JSON (streams[], format{}, __probe_duration_ms).
 * @param {object} [opts]     Optional: { failureMode, ffprobeVersion }
 * @returns {object}          Quality JSON schema object.
 */
function normalize(streamId, rawFfprobe, opts = {}) {
  const streams = rawFfprobe.streams || [];
  const format  = rawFfprobe.format  || {};
  const probeDurationMs = rawFfprobe.__probe_duration_ms || null;

  const videoStream = streams.find(s => s.codec_type === 'video') || null;
  const audioStream = streams.find(s => s.codec_type === 'audio') || null;

  // --- Video ---
  let videoObj = null;
  if (videoStream) {
    const width  = videoStream.width  || null;
    const height = videoStream.height || null;
    const resLabel = resolutionLabel(height);

    // Bitrate: prefer stream-level, fall back to format-level, convert to kbps
    const rawBitrate =
      parseInt(videoStream.bit_rate, 10) ||
      parseInt(format.bit_rate, 10)      ||
      null;
    const bitrateKbps = rawBitrate ? Math.round(rawBitrate / 1000) : null;

    const fps = parseFps(videoStream.avg_frame_rate);
    const { hdr, hdr_format } = detectHdr(videoStream);
    const { possible_upscale, upscale_signals_triggered } = detectUpscale(
      videoStream, resLabel, bitrateKbps, fps
    );

    videoObj = {
      resolution:                resLabel,
      width,
      height,
      codec:                     videoStream.codec_name  || null,
      profile:                   videoStream.profile     || null,
      bitrate_kbps:              bitrateKbps,
      bitrate_bucket:            bitrateBucket(bitrateKbps),
      fps,
      hdr,
      hdr_format,
      color_space:               videoStream.color_space || null,
      pixel_format:              videoStream.pix_fmt     || null,
      possible_upscale,
      upscale_signals_triggered,
    };
  }

  // --- Audio ---
  let audioObj = null;
  if (audioStream) {
    const rawAudioBitrate = parseInt(audioStream.bit_rate, 10) || null;
    audioObj = {
      codec:          audioStream.codec_name    || null,
      channels:       audioStream.channels      || null,
      channel_layout: audioStream.channel_layout || null,
      bitrate_kbps:   rawAudioBitrate ? Math.round(rawAudioBitrate / 1000) : null,
      sample_rate_hz: audioStream.sample_rate   ? parseInt(audioStream.sample_rate, 10) : null,
    };
  }

  // --- Container ---
  const durationS  = format.duration  ? parseFloat(format.duration)  : null;
  const sizeBytes  = format.size      ? parseInt(format.size, 10)    : null;
  const fmtName    = format.format_name || null;

  // Determine failure_mode
  let failureMode = resolveFailureMode(opts.failureMode || null);
  if (!failureMode && !videoStream) {
    failureMode = 'no_video_stream';
  }

  return {
    stream_id: streamId,
    scan_utc:  new Date().toISOString(),
    video:     videoObj,
    audio:     audioObj,
    container: {
      format:     fmtName,
      duration_s: durationS,
      size_bytes:  sizeBytes,
    },
    scan_meta: {
      ffprobe_version:  opts.ffprobeVersion || null,
      probe_duration_ms: probeDurationMs,
      failure_mode:     failureMode,
    },
  };
}

module.exports = { normalize };
