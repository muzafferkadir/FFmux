# FFmux – Simple FFmpeg Rendering Service

This project is a minimal RESTful Node.js service built with Express that turns a set of user-supplied media assets (videos, images, audio, texts) into a single rendered video using **FFmpeg**.  
Only **one render job is processed at a time** to keep server resource usage predictable.

## Features

• Clean REST API with separate upload and render endpoints  
• Advanced scaling modes (similar to CSS object-fit)  
• Text overlay support with Google Fonts integration  
• Multiple text styles with customizable positions and timing  
• SRT subtitle support with automatic parsing  
• File management with listing, filtering, and deletion  
• Progress tracking and status updates  
• Simple download mechanism for completed renders  
• Uses [`fluent-ffmpeg`](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg) under the hood

## Requirements

* Node.js ≥ 18.0.0
* FFmpeg 6.0 (bundled via ffmpeg-static)
* Internet connection (for initial Google Fonts download)

## Quick start

```bash
npm install
npm run download-fonts  # downloads required Google Fonts
npm run dev   # starts at http://localhost:3000 with nodemon
```

## API Documentation

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

| Option | Description | Default | Values |
|--------|-------------|---------|---------|
| resolution | Output video resolution | "1280x720" | "widthxheight" |
| quality | FFmpeg CRF value (lower is better) | "23" | "0" to "51" |
| extension | Output file format | "mp4" | "mp4", "mov", etc. |
| scaling | Default scaling mode | "cover" | See scaling modes |

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

Common options for all items:
- type: "video", "image", or "text"
- scaling: Override default scaling mode (for video/image)

Video-specific options:
- filename: Name of the uploaded video file
- cut: [startTime, endTime] in seconds
- volume: 0-100 (default: 100)

Image-specific options:
- filename: Name of the uploaded image file
- duration: How long to show the image in seconds (default: 5)

Text-specific options:
- text: The text content to display
- style: Text style preset (see Text Styles section)
- fontSize: Custom font size in pixels (optional)
- position: Text position on screen (see Text Positions section)
- startTime: When to show the text in seconds
- duration: How long to show the text in seconds (default: 5)

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

Text can be positioned using predefined positions:

| Position | Description |
|----------|-------------|
| middle-center | Center of the frame (default) |
| top-left | Top left corner with padding |
| top-center | Top center with padding |
| top-right | Top right corner with padding |
| middle-left | Middle left with padding |
| middle-right | Middle right with padding |
| bottom-left | Bottom left corner with padding |
| bottom-center | Bottom center with padding |
| bottom-right | Bottom right corner with padding |

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

#### Check Render Status

```bash
curl "http://localhost:3000/status/xxx"

# Response:
{
  "status": "processing",
  "progress": 45,
  "frames": 150,
  "currentFps": 30,
  "timemark": "00:00:05.00"
}
```

#### Download Rendered File

```bash
curl "http://localhost:3000/download/result.mp4" --output result.mp4
```

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