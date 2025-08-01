import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { syncDatabase } from "./models/index.js";
import errorHandler from "./middlewares/errorHandler.js";
import  createServer  from 'express';


function notFound(req, res, next) {
  res.status(404).json({ error: "Route not found" });
}


// Import routes
import authRoutes from "./routes/auth.js";
import skillsRoutes from "./routes/skills.js";
import usersRoutes from "./routes/users.js";
import ratingsRoutes from "./routes/ratings.js";

const app = express();
 createServer(app) ;

  // Security middleware
  app.use(helmet());
  
  // CORS configuration
  app.use(cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:8080",
    credentials: true
  }));

  // Logging middleware
  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('combined'));
  }

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Health check endpoint
  app.get("/api/ping", (_req, res) => {
    res.json({ 
      message: "SkillSwap API is running",
      status: "healthy",
      timestamp: new Date().toISOString()
    });
  });

  // API routes
  app.use("/api/auth", authRoutes);
  app.use("/api/skills", skillsRoutes);
  app.use("/api/users", usersRoutes);
  app.use("/api/ratings", ratingsRoutes);


  // Error handling middleware
  app.use(errorHandler);

  // Initialize database
  syncDatabase().catch(console.error);

  app.listen(process.env.PORT || 3000, () => {
  console.log(`Server is running on port http://localhost:${process.env.PORT || 3000}`);
});
 
