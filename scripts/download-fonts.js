import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FONT_DIR = path.join(__dirname, '..', 'fonts');

// Create fonts directory if it doesn't exist
if (!fs.existsSync(FONT_DIR)) {
  fs.mkdirSync(FONT_DIR);
}

// Font files to download from Google Fonts
const FONTS = [
  {
    name: 'Roboto-Regular.ttf',
    url: 'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Me5Q.ttf'
  },
  {
    name: 'Roboto-Bold.ttf',
    url: 'https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlvAw.ttf'
  },
  {
    name: 'Roboto-Medium.ttf',
    url: 'https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmEU9vAw.ttf'
  },
  {
    name: 'Roboto-Black.ttf',
    url: 'https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmYUtvAw.ttf'
  }
];

// Download a font file
function downloadFont(font) {
  const filePath = path.join(FONT_DIR, font.name);
  
  // Skip if file already exists
  if (fs.existsSync(filePath)) {
    console.log(`${font.name} already exists, skipping...`);
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    https.get(font.url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${font.name}: ${response.statusCode}`));
        return;
      }

      const file = fs.createWriteStream(filePath);
      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log(`Downloaded ${font.name}`);
        resolve();
      });

      file.on('error', (err) => {
        fs.unlink(filePath, () => {});
        reject(err);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

// Download all fonts
Promise.all(FONTS.map(downloadFont))
  .then(() => {
    console.log('All fonts downloaded successfully!');
  })
  .catch((error) => {
    console.error('Error downloading fonts:', error);
    process.exit(1);
  }); 