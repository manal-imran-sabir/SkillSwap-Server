const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Validation rules
const ratingValidation = [
  body('rated_user_id').isInt({ min: 1 }).withMessage('Valid user ID is required'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('comment').optional().trim().isLength({ max: 500 }).withMessage('Comment must be less than 500 characters')
];

// POST /api/ratings - Add rating to a user
router.post('/', authenticateToken, ratingValidation, async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          message: 'Validation failed',
          details: errors.array(),
          status: 400
        }
      });
    }

    const { rated_user_id, rating, comment } = req.body;

    // Check if user is trying to rate themselves
    if (req.user.id == rated_user_id) {
      return res.status(400).json({
        error: {
          message: 'You cannot rate yourself',
          status: 400
        }
      });
    }

    // Check if rated user exists
    const userCheck = await query(
      'SELECT id FROM users WHERE id = $1 AND active = true',
      [rated_user_id]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        error: {
          message: 'User to be rated not found',
          status: 404
        }
      });
    }

    // Check if user has already rated this user
    const existingRating = await query(
      'SELECT id FROM ratings WHERE reviewer_id = $1 AND rated_user_id = $2',
      [req.user.id, rated_user_id]
    );

    if (existingRating.rows.length > 0) {
      return res.status(409).json({
        error: {
          message: 'You have already rated this user',
          status: 409
        }
      });
    }

    // Create rating
    const result = await query(`
      INSERT INTO ratings (reviewer_id, rated_user_id, rating, comment, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING id, rating, comment, created_at
    `, [req.user.id, rated_user_id, rating, comment]);

    const newRating = result.rows[0];

    res.status(201).json({
      message: 'Rating added successfully',
      rating: {
        ...newRating,
        reviewer_name: req.user.name,
        reviewer_id: req.user.id
      }
    });
  } catch (error) {
    console.error('Create rating error:', error);
    res.status(500).json({
      error: {
        message: 'Failed to add rating',
        status: 500
      }
    });
  }
});

// GET /api/ratings/:userId - Get all ratings for a user
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const offset = (page - 1) * limit;

    // Check if user exists
    const userCheck = await query(
      'SELECT name FROM users WHERE id = $1 AND active = true',
      [userId]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        error: {
          message: 'User not found',
          status: 404
        }
      });
    }

    // Get ratings with pagination
    const ratingsResult = await query(`
      SELECT 
        r.id, r.rating, r.comment, r.created_at,
        u.name as reviewer_name, u.avatar_url as reviewer_avatar
      FROM ratings r
      JOIN users u ON r.reviewer_id = u.id
      WHERE r.rated_user_id = $1
      ORDER BY r.created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);

    // Get total count and average rating
    const statsResult = await query(`
      SELECT 
        COUNT(id) as total_ratings,
        AVG(rating) as average_rating,
        COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star,
        COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star,
        COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star,
        COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star,
        COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star
      FROM ratings
      WHERE rated_user_id = $1
    `, [userId]);

    const stats = statsResult.rows[0];

    res.json({
      user_name: userCheck.rows[0].name,
      ratings: ratingsResult.rows,
      stats: {
        total_ratings: parseInt(stats.total_ratings),
        average_rating: parseFloat(stats.average_rating || 0).toFixed(1),
        rating_distribution: {
          5: parseInt(stats.five_star),
          4: parseInt(stats.four_star),
          3: parseInt(stats.three_star),
          2: parseInt(stats.two_star),
          1: parseInt(stats.one_star)
        }
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(stats.total_ratings),
        totalPages: Math.ceil(stats.total_ratings / limit)
      }
    });
  } catch (error) {
    console.error('Get ratings error:', error);
    res.status(500).json({
      error: {
        message: 'Failed to fetch ratings',
        status: 500
      }
    });
  }
});

// DELETE /api/ratings/:id - Delete rating (admin or reviewer only)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if rating exists and user has permission
    const existingRating = await query(
      'SELECT reviewer_id FROM ratings WHERE id = $1',
      [id]
    );

    if (existingRating.rows.length === 0) {
      return res.status(404).json({
        error: {
          message: 'Rating not found',
          status: 404
        }
      });
    }

    // Check if user is the reviewer or admin
    if (req.user.role !== 'admin' && existingRating.rows[0].reviewer_id !== req.user.id) {
      return res.status(403).json({
        error: {
          message: 'Access denied - you can only delete your own ratings',
          status: 403
        }
      });
    }

    // Delete rating
    await query('DELETE FROM ratings WHERE id = $1', [id]);

    res.json({
      message: 'Rating deleted successfully'
    });
  } catch (error) {
    console.error('Delete rating error:', error);
    res.status(500).json({
      error: {
        message: 'Failed to delete rating',
        status: 500
      }
    });
  }
});

module.exports = router;