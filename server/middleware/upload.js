const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

// ── Upload directory ──────────────────────────────────────────────────────────
const uploadDir = process.env.UPLOAD_DIR || './uploads';

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ── Store file on disk (never in RAM) ────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  }
});

// ── Only allow .json files ────────────────────────────────────────────────────
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.json') {
    cb(null, true);
  } else {
    cb(new Error(`Only .json files are allowed. Got: ${ext}`), false);
  }
};

// ── Export configured multer instance ────────────────────────────────────────
// fileSize: 2GB limit — handles your 1.3 GB backup.json
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024 // 2 GB
  }
});

module.exports = upload;