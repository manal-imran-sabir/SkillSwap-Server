const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticateToken, requireOwnerOrAdmin } = require('../middleware/auth');

const router = express.Router();

// Validation rules
const updateProfileValidation = [
  body('name').optional().trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('bio').optional().trim().isLength({ max: 500 }).withMessage('Bio must be less than 500 characters'),
  body('location').optional().trim().isLength({ max: 100 }).withMessage('Location must be less than 100 characters'),
  body('website').optional().isURL().withMessage('Website must be a valid URL')
];

// GET /api/users/:id - Get user profile with ratings
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get user profile
    const userResult = await query(`
      SELECT 
        u.id, u.name, u.email, u.bio, u.location, u.website, u.avatar_url, u.created_at,
        COALESCE(AVG(r.rating), 0) as average_rating,
        COUNT(r.id) as total_ratings
      FROM users u
      LEFT JOIN ratings r ON u.id = r.rated_user_id
      WHERE u.id = $1 AND u.active = true
      GROUP BY u.id, u.name, u.email, u.bio, u.location, u.website, u.avatar_url, u.created_at
    `, [id]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: {
          message: 'User not found',
          status: 404
        }
      });
    }

    const user = userResult.rows[0];

    // Get user's skills
    const skillsResult = await query(`
      SELECT id, title, category, created_at
      FROM skills
      WHERE created_by = $1 AND active = true
      ORDER BY created_at DESC
      LIMIT 10
    `, [id]);

    // Get recent ratings
    const ratingsResult = await query(`
      SELECT 
        r.id, r.rating, r.comment, r.created_at,
        u.name as reviewer_name
      FROM ratings r
      JOIN users u ON r.reviewer_id = u.id
      WHERE r.rated_user_id = $1
      ORDER BY r.created_at DESC
      LIMIT 5
    `, [id]);

    res.json({
      user: {
        ...user,
        average_rating: parseFloat(user.average_rating).toFixed(1),
        total_ratings: parseInt(user.total_ratings)
      },
      skills: skillsResult.rows,
      recent_ratings: ratingsResult.rows
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      error: {
        message: 'Failed to fetch user profile',
        status: 500
      }
    });
  }
});

// PUT /api/users/:id - Update user profile
router.put('/:id', authenticateToken, requireOwnerOrAdmin(), updateProfileValidation, async (req, res) => {
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

    const { id } = req.params;
    const { name, bio, location, website, avatar_url } = req.body;

    // Update user profile
    const result = await query(`
      UPDATE users 
      SET 
        name = COALESCE($1, name),
        bio = COALESCE($2, bio),
        location = COALESCE($3, location),
        website = COALESCE($4, website),
        avatar_url = COALESCE($5, avatar_url),
        updated_at = NOW()
      WHERE id = $6 AND active = true
      RETURNING id, name, email, bio, location, website, avatar_url, updated_at
    `, [name, bio, location, website, avatar_url, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: {
          message: 'User not found',
          status: 404
        }
      });
    }

    res.json({
      message: 'Profile updated successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      error: {
        message: 'Failed to update profile',
        status: 500
      }
    });
  }
});

// DELETE /api/users/:id - Delete user (admin only)
router.delete('/:id', authenticateToken, requireOwnerOrAdmin(), async (req, res) => {
  try {
    const { id } = req.params;

    // Soft delete user (set active = false)
    const result = await query(`
      UPDATE users 
      SET active = false, updated_at = NOW()
      WHERE id = $1 AND active = true
      RETURNING id, name, email
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: {
          message: 'User not found',
          status: 404
        }
      });
    }

    res.json({
      message: 'User deleted successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      error: {
        message: 'Failed to delete user',
        status: 500
      }
    });
  }
});

module.exports = router;