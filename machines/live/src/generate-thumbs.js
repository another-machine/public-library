const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const mediaDir = path.join(__dirname, "media");
const thumbsDir = path.join(mediaDir, "thumbs");

// Supported image extensions
const imageExtensions = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".tiff",
  ".bmp",
];

async function generateThumbnails() {
  try {
    // Ensure thumbs directory exists
    if (!fs.existsSync(thumbsDir)) {
      fs.mkdirSync(thumbsDir, { recursive: true });
    }

    // Read all files in media directory
    const files = fs.readdirSync(mediaDir);

    // Filter for image files only
    const imageFiles = files.filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return imageExtensions.includes(ext);
    });

    console.log(`Found ${imageFiles.length} image(s) to process`);

    // Process each image
    for (const file of imageFiles) {
      const inputPath = path.join(mediaDir, file);
      const outputName = path.parse(file).name + ".jpg";
      const outputPath = path.join(thumbsDir, outputName);

      console.log(`Processing: ${file}`);

      await sharp(inputPath)
        .resize(500, 500, {
          fit: "cover",
          position: "center",
        })
        .jpeg({
          quality: 85,
          progressive: true,
          mozjpeg: true,
        })
        .toFile(outputPath);

      console.log(`  ✓ Created: ${outputName}`);
    }

    console.log("\nDone! All thumbnails generated.");
  } catch (error) {
    console.error("Error generating thumbnails:", error);
    process.exit(1);
  }
}

generateThumbnails();
