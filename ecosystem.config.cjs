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
        NEOXR_APIKEY: "yokheimoet",
        PDF_CONVERTER_API_KEY: "yokheimoet",
        IMGBB_API_KEY: "yokheimoet"
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
        STORAGE_CAPACITY_MB: 10240,
        NEOXR_APIKEY: "yokheimoet",
        PDF_CONVERTER_API_KEY: "yokheimoet",
        IMGBB_API_KEY: "yokheimoet"
      }
    }
  ]
};