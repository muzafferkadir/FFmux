import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { TEXT_STYLES, generateDrawTextFilter, escapeText, parseSRT } from "./textStyles.js";

if (process.env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
} else if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

if (process.env.FFPROBE_PATH) {
  ffmpeg.setFfprobePath(process.env.FFPROBE_PATH);
} else if (ffprobeStatic) {
  ffmpeg.setFfprobePath(ffprobeStatic.path);
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

// Helper function to check if file has audio stream
const hasAudioStream = (filePath) => {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        console.warn('Error probing file for audio:', err);
        // If we can't probe, assume no audio to allow processing to continue
        resolve(false);
        return;
      }
      
      const hasAudio = metadata.streams.some(stream => stream.codec_type === 'audio');
      resolve(hasAudio);
    });
  });
};

export default async function renderJob({ instructions, fileMap, outputDir }) {
  const {
    resolution = "1280x720",
    quality = "23",
    extension = "mp4",
    timeline = [],
    scaling = "cover", // Default scaling mode
    subtitles = null  // New parameter for SRT content
  } = instructions;

  if (!timeline.length) {
    throw new Error("Timeline is empty");
  }

  // Parse resolution
  const [width, height] = resolution.split('x').map(Number);
  if (!width || !height) {
    throw new Error("Invalid resolution format. Expected 'widthxheight' (e.g. '1280x720')");
  }

  // Parse SRT if provided and add to timeline
  let fullTimeline = [...timeline];
  if (subtitles) {
    const subtitleItems = parseSRT(subtitles);
    fullTimeline = [...timeline, ...subtitleItems];
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
  let totalDuration = 0;
  for (const item of fullTimeline) {
    if (item.type === "video") {
      const filePath = fileMap[item.filename];
      if (!filePath) {
        throw new Error(`File not found for ${item.filename}`);
      }

      // Get video duration
      const duration = await new Promise((resolve) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
          if (err) {
            console.warn('Error probing file for duration:', err);
            resolve(5); // default duration
            return;
          }
          
          resolve(metadata.format.duration || 5);
        });
      });

      const startTime = item.cut ? item.cut[0] : 0;
      const endTime = item.cut ? item.cut[1] : duration;
      const segmentDuration = endTime - startTime;

      console.log(`Video ${item.filename} duration info:`, {
        originalDuration: duration,
        startTime,
        endTime,
        segmentDuration
      });

      totalDuration += segmentDuration;
    }
    else if (item.type === "image") {
      totalDuration += (item.duration || 5);
    }
  }

  console.log('Starting FFmpeg render with totalDuration:', totalDuration);
  console.log('Timeline:', JSON.stringify(fullTimeline, null, 2));

  // Add inputs and prepare filter complex
  const filterComplex = [];
  const videoLabels = [];
  const audioLabels = [];
  let inputIndex = 0;
  let hasAudio = false;

  // First add all inputs
  for (const item of fullTimeline) {
    // Get item-specific scaling mode or use default
    const itemScaling = item.scaling || scaling;
    const scalingFilter = getScalingFilter(itemScaling);
    
    if (item.type === "video") {
      const filePath = fileMap[item.filename];
      if (!filePath) {
        throw new Error(`File not found for ${item.filename}`);
      }

      console.log(`Processing ${item.filename} with scaling mode: ${itemScaling}`);
      console.log(`Scaling filter: ${scalingFilter}`);

      // Get video duration using ffprobe
      const duration = await new Promise((resolve) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
          if (err) {
            console.warn('Error probing file for duration:', err);
            resolve(5); // default duration
            return;
          }
          
          resolve(metadata.format.duration || 5);
        });
      });

      // Calculate cut points
      const startTime = item.cut ? item.cut[0] : 0;
      const endTime = item.cut ? item.cut[1] : duration;
      const segmentDuration = endTime - startTime;

      if (segmentDuration <= 0) {
        throw new Error(`Invalid cut points for ${item.filename}: duration must be positive`);
      }

      console.log(`Adding video segment:`, {
        filename: item.filename,
        startTime,
        endTime,
        segmentDuration,
        scaling: itemScaling
      });

      // Add video input with proper duration
      command.input(filePath)
        .inputOptions([
          '-accurate_seek',
          '-ss', String(startTime),
          '-t', String(segmentDuration)
        ]);
      
      // Video processing with scaling
      let filter = `[${inputIndex}:v]${scalingFilter},setsar=1`;

      // Add text overlays that should appear during this video
      const textsForThisVideo = fullTimeline.filter(t => 
        t.type === "text" && 
        t.startTime >= startTime && 
        t.startTime < endTime
      );

      for (const textItem of textsForThisVideo) {
        // Get text style
        const style = textItem.style ? TEXT_STYLES[textItem.style] : TEXT_STYLES.basic;
        if (!style) {
          throw new Error(`Invalid text style: ${textItem.style}`);
        }

        // Set font size from item if specified
        if (textItem.fontSize) {
          style.fontSize = textItem.fontSize;
        }

        // Calculate relative start time and duration for this text within the video segment
        const relativeStart = textItem.startTime - startTime;
        const duration = Math.min(textItem.duration || 5, segmentDuration - relativeStart);
        
        // Generate text filter with position and timing
        const textFilter = generateDrawTextFilter(
          escapeText(textItem.text),
          style,
          textItem.position || {},
          relativeStart,
          duration
        );

        // Add text filter to the chain
        filter += `,${textFilter}`;
      }

      // Complete the filter chain
      filter += `[v${inputIndex}]`;
      filterComplex.push(filter);
      videoLabels.push(`[v${inputIndex}]`);

      // Audio processing if volume is not 0
      const volume = item.volume !== undefined ? item.volume : 100;
      if (volume > 0) {
        // Check if file has audio stream
        const fileHasAudio = await hasAudioStream(filePath);
        if (fileHasAudio) {
          hasAudio = true;
          const normalizedVolume = volume / 100;
          filterComplex.push(`[${inputIndex}:a]volume=${normalizedVolume}[a${inputIndex}]`);
          audioLabels.push(`[a${inputIndex}]`);
        }
      }
      inputIndex++;
    }
    else if (item.type === "image") {
      const filePath = fileMap[item.filename];
      if (!filePath) {
        throw new Error(`File not found for ${item.filename}`);
      }

      // Add image input
      command.input(filePath)
        .inputOptions([
          '-framerate', '30',
          '-loop', '1',
          '-t', String(item.duration || 5)
        ]);
      
      // Image processing with scaling
      let filter = `[${inputIndex}:v]${scalingFilter},setsar=1`;

      // Add text overlays that should appear during this image
      const textsForThisImage = fullTimeline.filter(t => 
        t.type === "text" && 
        t.startTime >= 0 && 
        t.startTime < (item.duration || 5)
      );

      for (const textItem of textsForThisImage) {
        // Get text style
        const style = textItem.style ? TEXT_STYLES[textItem.style] : TEXT_STYLES.basic;
        if (!style) {
          throw new Error(`Invalid text style: ${textItem.style}`);
        }

        // Set font size from item if specified
        if (textItem.fontSize) {
          style.fontSize = textItem.fontSize;
        }

        // Generate text filter with position and timing
        const textFilter = generateDrawTextFilter(
          escapeText(textItem.text),
          style,
          textItem.position || 'middle-center',
          textItem.startTime,
          textItem.duration || 5
        );

        // Add text filter to the chain
        filter += `,${textFilter}`;
      }

      // Complete the filter chain
      filter += `[v${inputIndex}]`;
      filterComplex.push(filter);
      videoLabels.push(`[v${inputIndex}]`);
      inputIndex++;
    }
  }

  // Build the complete filter complex for videos first
  if (videoLabels.length > 1) {
    // Add concat filter with explicit duration for each segment
    const concatFilter = videoLabels.map((label, i) => {
      const item = fullTimeline[i];
      if (item.type === "video") {
        const duration = item.cut ? 
          item.cut[1] - item.cut[0] : 
          item.duration || 5;
        return `${label}:d=${duration}`;
      }
      return label;
    }).join('');
    
    filterComplex.push(`${concatFilter}concat=n=${videoLabels.length}:v=1:a=0[outv]`);
  } else if (videoLabels.length === 1) {
    filterComplex.push(`${videoLabels[0]}copy[outv]`);
  }

  // Add audio concat if we have any audio
  if (hasAudio && audioLabels.length > 0) {
    if (audioLabels.length > 1) {
      // Add concat filter with explicit duration for each segment
      const concatFilter = audioLabels.map((label, i) => {
        const item = fullTimeline[i];
        if (item.type === "video") {
          const duration = item.cut ? 
            item.cut[1] - item.cut[0] : 
            item.duration || 5;
          return `${label}:d=${duration}`;
        }
        return label;
      }).join('');
      
      filterComplex.push(`${concatFilter}concat=n=${audioLabels.length}:v=0:a=1[outa]`);
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
      '-vsync', 'cfr',
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
            timemark: progress.timemark,
            totalDuration
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