import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import path from "path";
import { v4 as uuidv4 } from "uuid";

// Use bundled path when provided
if (process.env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
} else if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

// Scaling mode mappings (similar to CSS object-fit)
const SCALING_MODES = {
  // Fill: Stretches to fill the frame completely
  fill: 'scale={width}:{height}',
  
  // Contain: Scales to fit within frame, maintaining aspect ratio
  contain: 'scale=\'if(gte(iw/ih,{width}/{height}),min({width},iw),-1)\':\'if(gte(iw/ih,{width}/{height}),-1,min({height},ih))\',pad={width}:{height}:(({width}-iw)/2):(({height}-ih)/2)',
  
  // Cover: Scales and crops to fill frame, maintaining aspect ratio
  cover: 'scale=\'if(gte(iw/ih,{width}/{height}),{height}*(iw/ih),{width})\':\'if(gte(iw/ih,{width}/{height}),{height},{width}/(iw/ih))\',crop={width}:{height}',
  
  // Scale-down: Like contain but never scales up
  'scale-down': 'scale=\'if(gte(iw/ih,{width}/{height}),min(iw,{width}),-1)\':\'if(gte(iw/ih,{width}/{height}),-1,min(ih,{height}))\',pad={width}:{height}:(({width}-iw)/2):(({height}-ih)/2)',
  
  // None: Keeps original size if smaller than target, scales down if larger
  none: 'scale=\'if(gt(iw,{width}),{width},-1)\':\'if(gt(ih,{height}),{height},-1)\',pad={width}:{height}:(({width}-iw)/2):(({height}-ih)/2)'
};

export default function renderJob({ instructions, fileMap, outputDir }) {
  const {
    resolution = "1280x720",
    quality = "23",
    extension = "mp4",
    timeline = [],
    scaling = "cover" // Default scaling mode
  } = instructions;

  if (!timeline.length) {
    throw new Error("Timeline is empty");
  }

  // Parse resolution
  const [width, height] = resolution.split('x').map(Number);
  if (!width || !height) {
    throw new Error("Invalid resolution format. Expected 'widthxheight' (e.g. '1280x720')");
  }

  // Get scaling filter based on mode
  const getScalingFilter = (mode = scaling) => {
    const filter = SCALING_MODES[mode] || SCALING_MODES.cover;
    return filter
      .replace(/{width}/g, width.toString())
      .replace(/{height}/g, height.toString());
  };

  const outputPath = path.join(outputDir, `${uuidv4()}.${extension}`);
  const command = ffmpeg({ stdoutLines: 0 });

  // Calculate total duration for progress tracking
  const totalDuration = timeline.reduce((acc, item) => {
    if (item.type === "video") {
      const duration = item.cut ? item.cut[1] - item.cut[0] : 0;
      return acc + duration;
    }
    if (item.type === "image") {
      return acc + (item.duration || 5);
    }
    return acc;
  }, 0);

  console.log('Starting FFmpeg render with totalDuration:', totalDuration);
  console.log('Timeline:', JSON.stringify(timeline, null, 2));

  // Add inputs and prepare filter complex
  const filterComplex = [];
  const videoLabels = [];
  const audioLabels = [];
  let inputIndex = 0;
  let hasAudio = false;

  // First add all inputs
  timeline.forEach((item) => {
    const filePath = fileMap[item.filename];
    if (!filePath) {
      throw new Error(`File not found for ${item.filename}`);
    }

    // Get item-specific scaling mode or use default
    const itemScaling = item.scaling || scaling;
    const scalingFilter = getScalingFilter(itemScaling);
    
    console.log(`Processing ${item.filename} with scaling mode: ${itemScaling}`);
    console.log(`Scaling filter: ${scalingFilter}`);

    if (item.type === "video") {
      // Add video input
      command.input(filePath)
        .inputOptions([
          '-accurate_seek',
          '-ss', String(item.cut ? item.cut[0] : 0),
          '-t', String(item.cut ? item.cut[1] - item.cut[0] : 5),
          '-r', '30'
        ]);
      
      // Video processing with scaling
      filterComplex.push(`[${inputIndex}:v]${scalingFilter},setsar=1,fps=30[v${inputIndex}]`);
      videoLabels.push(`[v${inputIndex}]`);

      // Audio processing if volume is not 0
      const volume = item.volume !== undefined ? item.volume : 100;
      if (volume > 0) {
        hasAudio = true;
        const normalizedVolume = volume / 100;
        filterComplex.push(`[${inputIndex}:a]volume=${normalizedVolume}[a${inputIndex}]`);
        audioLabels.push(`[a${inputIndex}]`);
      }
    }
    else if (item.type === "image") {
      // Add image input
      command.input(filePath)
        .inputOptions([
          '-framerate', '30',
          '-loop', '1',
          '-t', String(item.duration || 5)
        ]);
      
      // Image processing with scaling
      filterComplex.push(`[${inputIndex}:v]${scalingFilter},setsar=1,fps=30[v${inputIndex}]`);
      videoLabels.push(`[v${inputIndex}]`);
    }
    
    inputIndex++;
  });

  // Build the complete filter complex
  if (videoLabels.length > 1) {
    filterComplex.push(`${videoLabels.join('')}concat=n=${videoLabels.length}:v=1:a=0[outv]`);
  } else if (videoLabels.length === 1) {
    filterComplex.push(`${videoLabels[0]}copy[outv]`);
  }

  // Add audio concat if we have any audio
  if (hasAudio && audioLabels.length > 0) {
    if (audioLabels.length > 1) {
      filterComplex.push(`${audioLabels.join('')}concat=n=${audioLabels.length}:v=0:a=1[outa]`);
    } else {
      filterComplex.push(`${audioLabels[0]}aresample=async=1[outa]`);
    }
  }

  // Log the complete filter complex
  console.log('Complete filter complex:', filterComplex.join(';'));

  // Setup the command with filter complex
  command.complexFilter(filterComplex.join(';'));

  // Add output options
  command
    .outputOptions([
      '-map', '[outv]',
      '-vcodec', 'libx264',
      '-crf', quality,
      '-preset', 'veryfast',
      '-r', '30',
      '-pix_fmt', 'yuv420p',
      '-profile:v', 'main',
      '-level', '4.0',
      '-maxrate', '4M',
      '-bufsize', '8M',
      '-movflags', '+faststart',
      '-fps_mode', 'cfr',
      '-progress', 'pipe:1'
    ]);

  // Add audio output options if we have audio
  if (hasAudio && audioLabels.length > 0) {
    command.outputOptions([
      '-map', '[outa]',
      '-acodec', 'aac',
      '-b:a', '192k'
    ]);
  }

  // Set output
  command.output(outputPath);

  // Add detailed logging
  command.on('start', (commandLine) => {
    console.log('FFmpeg command started:', commandLine);
  });

  command.on('stderr', (stderrLine) => {
    console.log('FFmpeg stderr:', stderrLine);
  });

  // Custom progress tracking
  let lastProgress = 0;
  command.on('progress', (progress) => {
    try {
      // Parse timemark to seconds
      const timeMatch = progress.timemark.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
      if (timeMatch) {
        const hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const seconds = parseInt(timeMatch[3]);
        const currentTime = hours * 3600 + minutes * 60 + seconds;
        
        // Calculate progress percentage
        const percent = Math.min(Math.round((currentTime / totalDuration) * 100), 100);
        
        // Only emit if progress has changed
        if (percent > lastProgress) {
          lastProgress = percent;
          console.log('FFmpeg progress:', {
            percent,
            frames: progress.frames,
            currentFps: progress.currentFps,
            timemark: progress.timemark
          });
          
          command.emit('status', {
            progress: percent,
            frames: progress.frames,
            currentFps: progress.currentFps,
            timemark: progress.timemark
          });
        }
      }
    } catch (err) {
      console.warn('Progress parsing error:', err);
    }
  });

  // Return both command and promise
  return {
    command,
    promise: new Promise((resolve, reject) => {
      command.on('end', () => {
        console.log('FFmpeg render completed:', outputPath);
        resolve(outputPath);
      });
      command.on('error', (err) => {
        console.error('FFmpeg render error:', err);
        reject(err);
      });
      command.run();
    })
  };
}