/* eslint-disable no-console */
import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import fs from "fs-extra";
import renderJob from "./render.js";
import { spawnSync } from "child_process";
import ffmpegStatic from "ffmpeg-static";
import { spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(express.json());

// Ensure working directories exist
const uploadDir = path.join(__dirname, "../uploads");
const outputDir = path.join(__dirname, "../outputs");
fs.ensureDirSync(uploadDir);
fs.ensureDirSync(outputDir);

// Check FFmpeg availability
const ffprobe = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
if (ffprobe.error) {
  process.env.FFMPEG_PATH = ffmpegStatic;
  console.log("System ffmpeg not found – using bundled static binary.");
}

// Download required fonts
console.log("Downloading required fonts...");
const fontDownloadScript = path.join(__dirname, "../scripts/download-fonts.js");
const fontDownload = spawn("node", [fontDownloadScript], {
  stdio: "inherit"
});

fontDownload.on("close", (code) => {
  if (code !== 0) {
    console.error("Font download failed with code:", code);
  } else {
    console.log("Fonts downloaded successfully!");
  }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const originalName = path.parse(file.originalname);
    let fileName = originalName.name;
    let extension = originalName.ext.toLowerCase();
    let counter = 1;
    
    // Check if file exists and generate new name if it does
    while (fs.existsSync(path.join(uploadDir, fileName + extension))) {
      fileName = `${originalName.name}_${counter}`;
      counter++;
    }
    
    cb(null, fileName + extension);
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 1024 * 1024 * 1024 * 10 // 10GB limit
  }
});

// Track active jobs
const jobs = new Map();
let isProcessing = false;

// Helper function to get file stats
const getFileStats = (dir, filename) => {
  const filePath = path.join(dir, filename);
  const stats = fs.statSync(filePath);
  return {
    filename,
    size: stats.size,
    created: stats.birthtime,
    modified: stats.mtime,
    extension: path.extname(filename).toLowerCase(),
    path: filePath
  };
};

// List files in uploads directory
app.get('/uploads', (req, res) => {
  try {
    const { search, extension } = req.query;
    const files = fs.readdirSync(uploadDir);
    
    let filteredFiles = files;
    
    // Filter by search term
    if (search) {
      const searchLower = search.toLowerCase();
      filteredFiles = filteredFiles.filter(file => 
        file.toLowerCase().includes(searchLower)
      );
    }
    
    // Filter by extension
    if (extension) {
      const extLower = extension.toLowerCase().startsWith('.') ? 
        extension.toLowerCase() : 
        '.' + extension.toLowerCase();
      filteredFiles = filteredFiles.filter(file => 
        path.extname(file).toLowerCase() === extLower
      );
    }

    // Get detailed stats for each file
    const filesWithStats = filteredFiles.map(filename => 
      getFileStats(uploadDir, filename)
    );
    
    // Sort by newest first
    filesWithStats.sort((a, b) => b.created - a.created);
    
    res.json({
      total: filesWithStats.length,
      files: filesWithStats
    });
  } catch (error) {
    console.error('List uploads error:', error);
    res.status(500).json({ error: 'Failed to list uploads' });
  }
});

// List files in outputs directory
app.get('/outputs', (req, res) => {
  try {
    const { search, extension } = req.query;
    const files = fs.readdirSync(outputDir);
    
    let filteredFiles = files;
    
    // Filter by search term
    if (search) {
      const searchLower = search.toLowerCase();
      filteredFiles = filteredFiles.filter(file => 
        file.toLowerCase().includes(searchLower)
      );
    }
    
    // Filter by extension
    if (extension) {
      const extLower = extension.toLowerCase().startsWith('.') ? 
        extension.toLowerCase() : 
        '.' + extension.toLowerCase();
      filteredFiles = filteredFiles.filter(file => 
        path.extname(file).toLowerCase() === extLower
      );
    }
    
    // Get detailed stats for each file
    const filesWithStats = filteredFiles.map(filename => 
      getFileStats(outputDir, filename)
    );
    
    // Sort by newest first
    filesWithStats.sort((a, b) => b.created - a.created);
    
    res.json({
      total: filesWithStats.length,
      files: filesWithStats
    });
  } catch (error) {
    console.error('List outputs error:', error);
    res.status(500).json({ error: 'Failed to list outputs' });
  }
});

// Delete file from uploads
app.delete('/uploads', (req, res) => {
  try {
    const { filename } = req.body;
    
    if (!filename) {
      return res.status(400).json({ error: 'Filename is required in request body' });
    }
    
    const filePath = path.join('./uploads/', filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Check if file is being used in an active job
    for (const [jobId, job] of jobs.entries()) {
      if (job.status === 'processing') {
        const fileInUse = Object.values(job.fileMap).some(path => path === filePath);
        if (fileInUse) {
          return res.status(409).json({ 
            error: 'File is currently being used in job ' + jobId 
          });
        }
      }
    }
    
    // Delete the file
    fs.unlinkSync(filePath);
    res.json({ 
      message: 'File deleted successfully',
      filename: filename
    });
  } catch (error) {
    console.error('Delete upload error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Delete file from outputs
app.delete('/outputs', (req, res) => {
  try {
    const { filename } = req.body;
    
    if (!filename) {
      return res.status(400).json({ error: 'Filename is required in request body' });
    }
    
    const filePath = path.join('./outputs/', filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Check if file is being used in an active job
    for (const job of jobs.values()) {
      if (job.status === 'processing' && job.outputPath === filePath) {
        return res.status(409).json({ 
          error: 'File is currently being generated' 
        });
      }
    }
    
    // Delete the file
    fs.unlinkSync(filePath);
    res.json({ 
      message: 'File deleted successfully',
      filename: filename
    });
  } catch (error) {
    console.error('Delete output error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Upload endpoint
app.post("/upload", upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    res.json({
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Upload failed" });
  }
});

// Render endpoint
app.post("/render", async (req, res) => {
  try {
    const { resolution, quality, extension, timeline, subtitles } = req.body;

    // Validate timeline
    if (!timeline || !Array.isArray(timeline) || timeline.length === 0) {
      return res.status(400).json({ error: "Invalid timeline" });
    }

    // Validate and map files
    const fileMap = {};
    for (const item of timeline) {
      // Skip file validation for text items
      if (item.type === "text") {
        if (!item.text) {
          return res.status(400).json({
            error: "Text items must have a 'text' property",
            item: item
          });
        }
        continue;
      }

      // Validate non-text items
      if (!item.filename) {
        return res.status(400).json({
          error: "Non-text items must have a 'filename' property",
          item: item
        });
      }

      const filePath = path.join(uploadDir, item.filename);
      if (!fs.existsSync(filePath)) {
        return res.status(400).json({ 
          error: `File not found: ${item.filename}`,
          item: item
        });
      }
      fileMap[item.filename] = filePath;
    }

    // Create job
    const jobId = uuidv4();
    let renderResult;
    try {
      renderResult = renderJob({
        instructions: { resolution, quality, extension, timeline, subtitles, scaling: req.body.scaling },
        fileMap,
        outputDir: outputDir
      });
    } catch (error) {
      console.error("Render initialization error:", error);
      return res.status(500).json({ error: "Failed to initialize render job" });
    }

    const { command, promise } = renderResult;

    // Store job
    const job = {
      command,
      promise,
      status: "processing",
      progress: 0,
      startTime: Date.now()
    };
    jobs.set(jobId, job);

    // Handle progress updates
    if (command) {
      command.on("status", (status) => {
        const job = jobs.get(jobId);
        if (job) {
          job.progress = status.progress;
          job.status = status.progress >= 100 ? "finished" : "processing";
        }
      });
    }

    // Handle completion
    if (promise) {
      promise
        .then((outputPath) => {
          const job = jobs.get(jobId);
          if (job) {
            job.status = "finished";
            job.outputPath = outputPath;
          }
        })
        .catch((error) => {
          console.error("Render error:", error);
          const job = jobs.get(jobId);
          if (job) {
            job.status = "failed";
            job.error = error.message;
          }
        });
    }

    res.json({
      jobId,
      status: "processing"
    });
  } catch (error) {
    console.error("Render error:", error);
    res.status(500).json({ error: "Render failed" });
  }
});

// Status endpoint
app.get("/status/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }

  res.json({
    status: job.status,
    progress: job.progress,
    error: job.error,
    duration: Date.now() - job.startTime
  });
});

// Download endpoint
app.get("/download/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job || !job.outputPath) {
    return res.status(404).json({ error: "Output not found" });
  }

  res.download(job.outputPath);
});

// Download output file directly by filename
app.get("/outputs/:filename", (req, res) => {
  const filePath = path.join(outputDir, req.params.filename);
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }

  res.download(filePath);
});

app.listen(PORT, () => {
  console.log(`FFmux server listening on http://localhost:${PORT}`);
}); 