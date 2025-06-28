import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Font paths - you'll need to download and place these fonts in a 'fonts' directory
const FONT_DIR = path.join(__dirname, '..', 'fonts');

// Create fonts directory if it doesn't exist
if (!fs.existsSync(FONT_DIR)) {
  fs.mkdirSync(FONT_DIR);
}

// Predefined positions for text placement
export const TEXT_POSITIONS = {
  'top-left': {
    x: '50',
    y: '50'
  },
  'top-center': {
    x: '(w-text_w)/2',
    y: '50'
  },
  'top-right': {
    x: 'w-text_w-50',
    y: '50'
  },
  'middle-left': {
    x: '50',
    y: '(h-text_h)/2'
  },
  'middle-center': {
    x: '(w-text_w)/2',
    y: '(h-text_h)/2'
  },
  'middle-right': {
    x: 'w-text_w-50',
    y: '(h-text_h)/2'
  },
  'bottom-left': {
    x: '50',
    y: 'h-text_h-50'
  },
  'bottom-center': {
    x: '(w-text_w)/2',
    y: 'h-text_h-50'
  },
  'bottom-right': {
    x: 'w-text_w-50',
    y: 'h-text_h-50'
  }
};

// Text style presets
export const TEXT_STYLES = {
  // Simple white text
  basic: {
    fontColor: 'white',
    fontSize: 72,
    fontFile: path.join(FONT_DIR, 'Roboto-Regular.ttf')
  },
  
  // White text with black border
  outlined: {
    fontColor: 'white',
    fontSize: 72,
    borderColor: 'black',
    borderWidth: 3,
    fontFile: path.join(FONT_DIR, 'Roboto-Bold.ttf')
  },
  
  // Black text
  dark: {
    fontColor: 'black',
    fontSize: 72,
    fontFile: path.join(FONT_DIR, 'Roboto-Medium.ttf')
  },
  
  // TikTok-style captions
  tiktok: {
    fontColor: 'white',
    fontSize: 72,
    borderColor: 'black',
    borderWidth: 4,
    boxColor: 'black@0.5',
    boxBorderWidth: 10,
    fontFile: path.join(FONT_DIR, 'Roboto-Black.ttf')
  },

  // Subtitle style
  subtitle: {
    fontColor: 'white',
    fontSize: 48,
    borderColor: 'black',
    borderWidth: 2,
    fontFile: path.join(FONT_DIR, 'Roboto-Medium.ttf')
  }
};

// Helper function to parse SRT time format to seconds
export function srtTimeToSeconds(timeString) {
  const [hours, minutes, seconds] = timeString.split(':');
  const [secs, ms] = seconds.split(',');
  return (
    parseInt(hours) * 3600 +
    parseInt(minutes) * 60 +
    parseInt(secs) +
    parseInt(ms) / 1000
  );
}

// Helper function to parse SRT file
export function parseSRT(content) {
  const normalized = content.replace(/\\n/g, '\n');
  const subtitles = [];
  const blocks = normalized.trim().split('\n\n');

  console.log('Parsing SRT blocks:', blocks);

  blocks.forEach(block => {
    const lines = block.split('\n');
    if (lines.length >= 3) {
      const timecode = lines[1].split(' --> ');
      const startTime = srtTimeToSeconds(timecode[0]);
      const endTime = srtTimeToSeconds(timecode[1]);
      const text = lines.slice(2).join('\n');

      console.log('Parsed subtitle:', {
        text,
        startTime,
        endTime,
        duration: endTime - startTime
      });

      subtitles.push({
        type: 'text',
        text,
        style: 'subtitle',
        startTime,
        duration: endTime - startTime,
        position: 'bottom-center'
      });
    }
  });

  return subtitles;
}

// Helper function to generate FFmpeg drawtext filter string
export function generateDrawTextFilter(text, style, position = {}, startTime = 0, duration = 0) {
  const {
    fontColor = 'white',
    fontSize = 72,
    borderColor,
    borderWidth = 0,
    boxColor,
    boxBorderWidth = 0,
    fontFile
  } = style;

  // Handle predefined positions
  let positionConfig;
  if (typeof position === 'string' && TEXT_POSITIONS[position]) {
    positionConfig = TEXT_POSITIONS[position];
  } else if (typeof position === 'object') {
    positionConfig = position;
  } else {
    positionConfig = TEXT_POSITIONS['middle-center']; // Default to center if invalid position
  }

  const { x, y } = positionConfig;

  let filter = `drawtext=fontfile='${fontFile}':`;
  filter += `fontsize=${fontSize}:`;
  filter += `fontcolor=${fontColor}:`;
  filter += `x=${x}:y=${y}:`;
  filter += `text='${text}'`;

  // Add timing if specified
  if (startTime > 0 || duration > 0) {
    filter += `:enable='between(t,${startTime},${startTime + duration})'`;
  }

  // Add border if specified
  if (borderColor && borderWidth) {
    filter += `:bordercolor=${borderColor}:borderw=${borderWidth}`;
  }

  // Add box if specified
  if (boxColor) {
    filter += `:box=1:boxcolor=${boxColor}`;
    if (boxBorderWidth) {
      filter += `:boxborderw=${boxBorderWidth}`;
    }
  }

  return filter;
}

// Helper function to escape special characters in text for FFmpeg
export function escapeText(text) {
  return text
    .replace(/\\/g, "\\\\")  // Escape backslashes first
    .replace(/'/g, "'\\''")  // Escape single quotes
    .replace(/:/g, '\\:')    // Escape colons
    .replace(/%/g, '\\%')    // Escape percent signs
    .replace(/\n/g, '\\n');   // Escape newlines
} 