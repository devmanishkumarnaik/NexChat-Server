import jwt from "jsonwebtoken";
import { ErrorHandler } from "../utils/utility.js";
import { adminSecretKey } from "../app.js";
import { TryCatch } from "./error.js";
import { APP_TOKEN } from "../constants/config.js";
import { User } from "../models/user.js";

const isAuthenticated = TryCatch((req, res, next) => {
  const token = req.cookies[APP_TOKEN];

  if (!token)
    return next(new ErrorHandler("Please login to access this route", 401));

  const decodedData = jwt.verify(token, process.env.JWT_SECRET);

  req.user = decodedData._id;
  next();
});

const adminOnly = (req, res, next) => {
  const token = req.cookies["ChatApp2.0-admin"];

  if (!token)
    return next(new ErrorHandler("Only Admin can access this route", 401));

  const secretKey = jwt.verify(token, process.env.JWT_SECRET);

  const isMatched = secretKey === adminSecretKey;

  if (!isMatched)
    return next(new ErrorHandler("Only Admin can access this route", 401));

  next();
};

const socketAuthenticator = async (err, socket, next) =>{
  try {
    // Handle existing errors first
    if (err) {
      console.error("Socket authentication error:", err);
      return next(err);
    }

    const authToken = socket.request.cookies[APP_TOKEN];

    // No token found - user not authenticated
    if (!authToken) {
      console.warn(`Socket connection attempt without auth token: ${socket.id}`);
      return next(new ErrorHandler("Authentication required", 401));
    }

    try {
      const decodedData = jwt.verify(authToken, process.env.JWT_SECRET);
      
      // Invalid token format
      if (!decodedData || !decodedData._id) {
        console.warn(`Socket connection with invalid token format: ${socket.id}`);
        return next(new ErrorHandler("Invalid authentication token", 401));
      }

      const user = await User.findById(decodedData._id);

      // User no longer exists in database
      if (!user) {
        console.warn(`Socket connection with non-existent user ID: ${decodedData._id}`);
        return next(new ErrorHandler("User not found", 401));
      }

      // Store user object in socket for later use
      socket.user = user;
      return next();
      
    } catch (tokenError) {
      // Token verification failed (expired, malformed, etc.)
      if (tokenError.name === 'TokenExpiredError') {
        console.warn(`Socket connection with expired token: ${socket.id}`);
        return next(new ErrorHandler("Authentication token expired", 401));
      } else {
        console.warn(`Socket connection with invalid token: ${socket.id}`, tokenError.message);
        return next(new ErrorHandler("Invalid authentication token", 401));
      }
    }
  } catch (error) {
    // Catch any other unexpected errors
    console.error("Unexpected error in socket authentication:", error);
    return next(new ErrorHandler("Authentication error", 500));
  }
};

export { isAuthenticated, adminOnly, socketAuthenticator };
