module.exports = {
  apps: [
    {
      name: "arthurg-website",
      script: "api/index.js",
      cwd: __dirname,
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        STORAGE_CAPACITY_MB: 10240,
        MAX_UPLOAD_FILE_SIZE_MB: 2048,
        UPLOAD_CHUNK_SIZE_MB: 8,
        NEOXR_APIKEY: "yokheimoet",
        PDF_CONVERTER_API_KEY: "yokheimoet",
        IMGBB_API_KEY: "f6f51ae27d6509e9a555a312d14ae3d7",
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
        STORAGE_CAPACITY_MB: 10240,
        MAX_UPLOAD_FILE_SIZE_MB: 2048,
        UPLOAD_CHUNK_SIZE_MB: 8,
        NEOXR_APIKEY: "yokheimoet",
        PDF_CONVERTER_API_KEY: "yokheimoet",
        IMGBB_API_KEY: "f6f51ae27d6509e9a555a312d14ae3d7",
      }
    }
  ]
};
