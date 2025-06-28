# FFmux – RESTful Video Editor via FFMPEG 🎬

A powerful REST API for video editing, text overlays, and subtitle generation using FFmpeg.

## Example 🎥

<table>
  <tr>
    <td width="50%">
      <h3>Input</h3>
      

https://github.com/user-attachments/assets/876902d9-3bfb-4db3-a4d0-71849f7ff1b7


   <td width="50%">
      <h3>Result</h3>
     

https://github.com/user-attachments/assets/740011e3-79bb-4d4d-b541-92d1ea3907be


  </tr>
</table>

#### *💡 You can find all these example files in the `examples` directory.*

## Quick Start 🚀

```bash
npm install
npm run download-fonts  # downloads required Google Fonts
npm run dev            # starts at http://localhost:3000
```

## Create a Video 🎥

### Basic Example
```bash
# 1. Upload your video
curl -X POST "http://localhost:3000/upload" \
  -F "file=@video.mp4"

# 2. Create video with text overlay
curl -X POST "http://localhost:3000/render" \
-H "Content-Type: application/json" \
-d '{
  "resolution": "1080x1920",
  "timeline": [
    {
      "type": "video",
      "filename": "video.mp4",
      "cut": [0, 5]
    },
    {
      "type": "text",
      "text": "Hello World!",
      "style": "tiktok",
      "position": "top-center",
      "startTime": 1,
      "duration": 4
    }
  ]
}'

# 3. Download the result
curl "http://localhost:3000/outputs/[output-filename].mp4" --output result.mp4
```

### More Examples 📚

#### TikTok-Style Video
```json
{
  "resolution": "1080x1920",
  "scaling": "cover",
  "timeline": [
    {
      "type": "video",
      "filename": "video.mp4",
      "cut": [0, 10],
      "scaling": "cover"
    },
    {
      "type": "text",
      "text": "Watch this!",
      "style": "tiktok",
      "position": "top-center",
      "startTime": 0,
      "duration": 3
    }
  ]
}
```

#### Video with Subtitles
```json
{
  "resolution": "1080x1920",
  "timeline": [
    {
      "type": "video",
      "filename": "video.mp4",
      "duration": 10
    }
  ],
  "subtitles": "1\n00:00:01,000 --> 00:00:04,000\nFirst subtitle\n\n2\n00:00:04,000 --> 00:00:08,000\nSecond subtitle"
}
```

## Features ✨

• **Video Processing**: Trim, scale, and combine multiple video files  
• **Audio Support**: Background music, audio overlays with volume control  
• **Image Integration**: Static images with custom durations  
• **Text Overlays**: 5 predefined styles with custom positioning and timing  
• **SRT Subtitle Support**: Import and render subtitle files  
• **CSS-like Scaling**: 5 scaling modes (cover, contain, fill, scale-down, none)  
• **Timeline-based Editing**: Precise control over timing and sequencing  
• **Progress Tracking**: Real-time render progress and status updates  
• **File Management API**: Upload, list, and delete media files  
• **Custom Fonts**: Google Fonts integration (Roboto family)  
• **Multiple Output Formats**: MP4, MOV, AVI and more

## API Documentation 📖

### 1. File Management

#### Upload Files
```bash
curl -X POST "http://localhost:3000/upload" \
  -F "file=@video.mp4" \
  -H "Content-Type: multipart/form-data"

# Response:
{
  "message": "File uploaded successfully",
  "filename": "video.mp4"
}
```

#### List Files

List files in uploads or outputs directory with optional filtering:

```bash
# List all uploaded files
curl "http://localhost:3000/uploads"

# List with search filter
curl "http://localhost:3000/uploads?search=video"

# List with extension filter
curl "http://localhost:3000/uploads?extension=mp4"

# List output files
curl "http://localhost:3000/outputs"

# Response format:
{
  "total": 2,
  "files": [
    {
      "filename": "video.mp4",
      "size": 1234567,
      "created": "2024-03-20T10:30:00.000Z",
      "modified": "2024-03-20T10:30:00.000Z",
      "extension": ".mp4"
    }
  ]
}
```

#### Delete Files

Delete files from uploads or outputs directory:

```bash
# Delete an uploaded file
curl --location --request DELETE 'http://localhost:3000/uploads' \
--header 'Content-Type: application/json' \
--data '{
    "filename": "video.mp4"
}'

# Delete an output file
curl --location --request DELETE 'http://localhost:3000/outputs' \
--header 'Content-Type: application/json' \
--data '{
    "filename": "result.mp4"
}'

# Response on success:
{
  "message": "File deleted successfully",
  "filename": "video.mp4"
}

# Response if file is in use:
{
  "error": "File is currently being used in job xxx"
}
```

### 2. Render API

#### Start Render Job

```bash
curl -X POST "http://localhost:3000/render" \
-H "Content-Type: application/json" \
-d '{
  "resolution": "1280x720",
  "quality": "23",
  "extension": "mp4",
  "scaling": "cover",
  "timeline": [
    {
      "type": "video",
      "filename": "intro.mp4",
      "cut": [0, 5],
      "volume": 100,
      "scaling": "contain"
    },
    {
      "type": "image",
      "filename": "slide.png",
      "duration": 3,
      "scaling": "cover"
    }
  ]
}'

# Response:
{
  "jobId": "xxx",
  "message": "Render job started"
}
```

#### Render Options

| Option | Type | Description | Default | Values |
|--------|------|-------------|---------|---------|
| `resolution` | String | Output video resolution | "1280x720" | "widthxheight" (e.g., "1920x1080") |
| `quality` | String | FFmpeg CRF value (lower = better quality) | "23" | "0" to "51" |
| `extension` | String | Output file format | "mp4" | "mp4", "mov", "avi", etc. |
| `scaling` | String | Default scaling mode for all items | "cover" | See scaling modes below |
| `timeline` | Array | Required. Array of timeline items | `[]` | Array of video/image/audio/text items |
| `subtitles` | String | Optional. SRT subtitle content | `null` | Valid SRT format string |

Example render request:
```json
{
  "resolution": "1920x1080",
  "quality": "20",
  "extension": "mp4",
  "scaling": "cover",
  "timeline": [
    {
      "type": "video",
      "filename": "intro.mp4",
      "cut": [0, 10],
      "volume": 100
    },
    {
      "type": "audio",
      "filename": "music.mp3",
      "startTime": 0,
      "volume": 60
    },
    {
      "type": "text",
      "text": "Welcome!",
      "style": "tiktok",
      "startTime": 2,
      "duration": 3
    }
  ],
  "subtitles": "1\n00:00:05,000 --> 00:00:08,000\nHello World!\n\n2\n00:00:10,000 --> 00:00:13,000\nThis is a subtitle"
}
```

#### Scaling Modes

The service supports CSS-like object-fit scaling modes for both videos and images:

| Mode | Description |
|------|-------------|
| cover | Scales to fill frame while maintaining aspect ratio, may crop |
| contain | Scales to fit within frame, adds padding if needed |
| fill | Stretches content to exactly fill frame |
| scale-down | Like contain but never scales up |
| none | Keeps original size if smaller than target, scales down if larger |

You can set a default scaling mode in the render options and override it per item in the timeline.

#### Timeline Item Options

All timeline items share these common properties:
- `type`: Required. Item type: "video", "image", "audio", or "text"
- `scaling`: Optional. Override default scaling mode (for video/image only)

**Video Items (`type: "video"`)**
- `filename`: Required. Name of the uploaded video file
- `cut`: Optional. Array of [startTime, endTime] in seconds to trim the video
- `volume`: Optional. Audio volume 0-100 (default: 100, set to 0 to mute)
- `scaling`: Optional. Override default scaling mode

Example:
```json
{
  "type": "video",
  "filename": "video.mp4",
  "cut": [10, 30],
  "volume": 80,
  "scaling": "contain"
}
```

**Image Items (`type: "image"`)**
- `filename`: Required. Name of the uploaded image file
- `duration`: Optional. How long to show the image in seconds (default: 5)
- `scaling`: Optional. Override default scaling mode

Example:
```json
{
  "type": "image",
  "filename": "slide.png",
  "duration": 3,
  "scaling": "cover"
}
```

**Audio Items (`type: "audio"`)**
- `filename`: Required. Name of the uploaded audio file
- `startTime`: Optional. When to start playing the audio in the timeline (default: 0)
- `cut`: Optional. Array of [startTime, endTime] in seconds to trim the audio
- `duration`: Optional. Override audio duration (will cut or loop to fit)
- `volume`: Optional. Audio volume 0-100 (default: 100)

Example:
```json
{
  "type": "audio",
  "filename": "background.mp3",
  "startTime": 5,
  "cut": [10, 60],
  "volume": 80
}
```

**Text Items (`type: "text"`)**
- `text`: Required. The text content to display
- `style`: Optional. Text style preset: "basic", "outlined", "dark", "tiktok", "subtitle" (default: "basic")
- `fontSize`: Optional. Custom font size in pixels (overrides style default)
- `position`: Optional. Text position on screen (default: "middle-center")
- `startTime`: Required. When to show the text in seconds
- `duration`: Optional. How long to show the text in seconds (default: 5)

Example:
```json
{
  "type": "text",
  "text": "Hello World!",
  "style": "tiktok",
  "fontSize": 64,
  "position": "top-center",
  "startTime": 2,
  "duration": 4
}
```

#### Text Styles

The service includes several predefined text styles:

| Style | Description |
|-------|-------------|
| basic | Simple white text (72px) |
| outlined | White text with black border (72px) |
| dark | Black text (72px) |
| tiktok | TikTok-style captions with semi-transparent background (72px) |
| subtitle | White text with black border, optimized for subtitles (48px) |

All text styles use the Roboto font family from Google Fonts. You can customize the font size for any style:

```json
{
  "type": "text",
  "text": "Custom size text",
  "style": "basic",
  "fontSize": 64
}
```

#### Text Positions

Text can be positioned using predefined positions or custom coordinates:

**Predefined Positions:**

| Position | Description | Coordinates |
|----------|-------------|-------------|
| `top-left` | Top left corner with padding | x: 50, y: 50 |
| `top-center` | Top center with padding | x: center, y: 50 |
| `top-right` | Top right corner with padding | x: right-50, y: 50 |
| `middle-left` | Middle left with padding | x: 50, y: center |
| `middle-center` | Center of the frame (default) | x: center, y: center |
| `middle-right` | Middle right with padding | x: right-50, y: center |
| `bottom-left` | Bottom left corner with padding | x: 50, y: bottom-50 |
| `bottom-center` | Bottom center with padding | x: center, y: bottom-50 |
| `bottom-right` | Bottom right corner with padding | x: right-50, y: bottom-50 |

**Custom Positioning:**

You can also specify custom coordinates using an object:

```json
{
  "type": "text",
  "text": "Custom positioned text",
  "position": {
    "x": "100",
    "y": "200"
  },
  "startTime": 0,
  "duration": 5
}
```

**Position Examples:**
```json
// Using predefined position
{
  "position": "top-center"
}

// Using custom coordinates (pixels from top-left)
{
  "position": {
    "x": "50",
    "y": "100"
  }
}

// Using FFmpeg expressions for dynamic positioning
{
  "position": {
    "x": "(w-text_w)/2",
    "y": "h*0.8"
  }
}
```

#### SRT Subtitle Support

```json
{
  "resolution": "1080x1920",
  "timeline": [
    {
      "type": "video",
      "filename": "video.mp4",
      "duration": 10
    }
  ],
  "subtitles": "1\n00:00:01,000 --> 00:00:04,000\nFirst subtitle\n\n2\n00:00:04,000 --> 00:00:08,000\nSecond subtitle\n\n"
}
```

You can mix regular text overlays with subtitles:
```json
{
  "resolution": "1080x1920",
  "timeline": [
    {
      "type": "video",
      "filename": "video.mp4",
      "duration": 10
    },
    {
      "type": "text",
      "text": "Title",
      "style": "tiktok",
      "position": "top-center",
      "startTime": 2,
      "duration": 4
    }
  ],
  "subtitles": "1\n00:00:01,000 --> 00:00:04,000\nSubtitle appears with title\n\n"
}
```

#### Check Job Status

```bash
curl "http://localhost:3000/status/{jobId}"

# Response:
{
  "status": "processing",  # or "finished", "failed"
  "progress": 45,         # percent complete
  "error": null,         # error message if failed
  "duration": 12345      # ms since job started
}
```

#### Download Rendered Video

There are two ways to download the rendered video:

1. Using job ID (requires active job in memory):
```bash
curl "http://localhost:3000/download/{jobId}" --output result.mp4
```

2. Direct file download (works even after server restart):
```bash
curl "http://localhost:3000/outputs/{filename}" --output result.mp4
```

For example:
```bash
# Download using job ID
curl "http://localhost:3000/download/3ff0d222-056d-4004-9978-36b71a21f422" --output result.mp4

# Download directly by filename
curl "http://localhost:3000/outputs/3ff0d222-056d-4004-9978-36b71a21f422.mp4" --output result.mp4
```

Note: The direct file download method is more reliable as it doesn't depend on the job being in memory. It's especially useful after server restarts or when the job ID is no longer available.

## Error Handling

The API uses standard HTTP status codes:
- 200: Success
- 400: Bad Request (invalid parameters)
- 404: Not Found (file or job not found)
- 409: Conflict (file in use)
- 500: Server Error

Error responses include a message:
```json
{
  "error": "Detailed error message"
}
```

## Development

The service is built with:
- Express.js for the REST API
- fluent-ffmpeg for video processing
- ffmpeg-static for bundled FFmpeg binary

## License

This project is licensed under the GNU General Public License v3.0 (GPLv3).

This means:
- You can use this software for any purpose
- You can modify the software
- You can distribute the software
- You MUST open source any derivative works under the same GPLv3 license
- You MUST include the original license and copyright notice
- You MUST state all changes made to the code

For more details, see the [GNU GPLv3 License](https://www.gnu.org/licenses/gpl-3.0.en.html).
