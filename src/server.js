import "./config/env.js";
import { connectDB } from "./config/db.js";
import app from "./app.js";

const PORT = process.env.PORT || 4000;

const start = async () => {
  await connectDB(); // 현재는 no-op
  app.listen(PORT, () => console.log(`[server] http://localhost:${PORT}`));
};

start();
