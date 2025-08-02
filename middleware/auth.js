const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

// JWT Authentication Middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        error: {
          message: 'Access token required',
          status: 401
        }
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const result = await query(
      'SELECT id, email, name, role, created_at FROM users WHERE id = $1 AND active = true',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: {
          message: 'Invalid token - user not found',
          status: 401
        }
      });
    }

    // Add user to request object
    req.user = result.rows[0];
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: {
          message: 'Invalid token',
          status: 401
        }
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: {
          message: 'Token expired',
          status: 401
        }
      });
    }
    
    console.error('Auth middleware error:', error);
    res.status(500).json({
      error: {
        message: 'Authentication error',
        status: 500
      }
    });
  }
};

// Admin Authorization Middleware
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: {
        message: 'Admin access required',
        status: 403
      }
    });
  }
  next();
};

//  Admin Middleware
const requireOwnerOrAdmin = (resourceIdParam = 'id') => {
  return (req, res, next) => {
    const resourceId = req.params[resourceIdParam];
    
    if (req.user.role === 'admin' || req.user.id == resourceId) {
      next();
    } else {
      res.status(403).json({
        error: {
          message: 'Access denied - insufficient permissions',
          status: 403
        }
      });
    }
  };
};

module.exports = {
  authenticateToken,
  requireAdmin,
  requireOwnerOrAdmin
};