# Tesseract — click-through demo

A password-vault demo for showing how Tesseract works, using **fake data only**. Live at https://tesseract-lime.vercel.app.

- The vault is encrypted in the browser (PBKDF2-SHA256, 600,000 iterations → AES-GCM-256) and kept in `localStorage`. The master password is never stored, and the vault is never sent to the server.
- Import reads `.xlsx`, `.csv` and `.docx` in the browser (SheetJS, mammoth). With an Anthropic API key saved on `/admin`, the extracted text goes to `/api/read`, which asks Claude for structured logins. Without a key, a simulated reader matches column headers and text patterns.
- `/larkspur/login` and `/larkspur/signup` are an invented store showing what the browser extension will do.
- No database, no environment variables.

Sample files live in `public/samples/`.

```bash
npm install
npm run dev
```
