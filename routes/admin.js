const express = require('express');
const { query } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Apply admin middleware to all routes
router.use(authenticateToken, requireAdmin);

// GET /api/admin/users - Get all users with pagination
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', status = 'all' } = req.query;
    const offset = (page - 1) * limit;

    let queryText = `
      SELECT 
        u.id, u.name, u.email, u.role, u.active, u.created_at, u.updated_at,
        COUNT(s.id) as skills_count,
        COALESCE(AVG(r.rating), 0) as average_rating,
        COUNT(r.id) as ratings_received
      FROM users u
      LEFT JOIN skills s ON u.id = s.created_by AND s.active = true
      LEFT JOIN ratings r ON u.id = r.rated_user_id
      WHERE 1=1
    `;

    const queryParams = [];
    let paramCount = 0;

    // Add search filter
    if (search) {
      paramCount++;
      queryText += ` AND (u.name ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`;
      queryParams.push(`%${search}%`);
    }

    // Add status filter
    if (status !== 'all') {
      paramCount++;
      queryText += ` AND u.active = $${paramCount}`;
      queryParams.push(status === 'active');
    }

    queryText += ` GROUP BY u.id ORDER BY u.created_at DESC`;

    // Add pagination
    paramCount++;
    queryText += ` LIMIT $${paramCount}`;
    queryParams.push(limit);

    paramCount++;
    queryText += ` OFFSET $${paramCount}`;
    queryParams.push(offset);

    const result = await query(queryText, queryParams);

    // Get total count
    let countQuery = 'SELECT COUNT(id) as total FROM users WHERE 1=1';
    const countParams = [];
    let countParamCount = 0;

    if (search) {
      countParamCount++;
      countQuery += ` AND (name ILIKE $${countParamCount} OR email ILIKE $${countParamCount})`;
      countParams.push(`%${search}%`);
    }

    if (status !== 'all') {
      countParamCount++;
      countQuery += ` AND active = $${countParamCount}`;
      countParams.push(status === 'active');
    }

    const countResult = await query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      users: result.rows.map(user => ({
        ...user,
        skills_count: parseInt(user.skills_count),
        average_rating: parseFloat(user.average_rating).toFixed(1),
        ratings_received: parseInt(user.ratings_received)
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Admin get users error:', error);
    res.status(500).json({
      error: {
        message: 'Failed to fetch users',
        status: 500
      }
    });
  }
});

// GET /api/admin/stats - Get platform statistics
router.get('/stats', async (req, res) => {
  try {
    // Get user statistics
    const userStats = await query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN active = true THEN 1 END) as active_users,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as new_users_30_days
      FROM users
    `);

    // Get skill statistics
    const skillStats = await query(`
      SELECT 
        COUNT(*) as total_skills,
        COUNT(CASE WHEN active = true THEN 1 END) as active_skills,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as new_skills_30_days
      FROM skills
    `);

    // Get rating statistics
    const ratingStats = await query(`
      SELECT 
        COUNT(*) as total_ratings,
        AVG(rating) as average_rating,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as new_ratings_30_days
      FROM ratings
    `);

    // Get popular categories
    const categoryStats = await query(`
      SELECT 
        category,
        COUNT(*) as skill_count
      FROM skills
      WHERE active = true
      GROUP BY category
      ORDER BY skill_count DESC
      LIMIT 10
    `);

    res.json({
      users: {
        total: parseInt(userStats.rows[0].total_users),
        active: parseInt(userStats.rows[0].active_users),
        new_this_month: parseInt(userStats.rows[0].new_users_30_days)
      },
      skills: {
        total: parseInt(skillStats.rows[0].total_skills),
        active: parseInt(skillStats.rows[0].active_skills),
        new_this_month: parseInt(skillStats.rows[0].new_skills_30_days)
      },
      ratings: {
        total: parseInt(ratingStats.rows[0].total_ratings),
        average: parseFloat(ratingStats.rows[0].average_rating || 0).toFixed(1),
        new_this_month: parseInt(ratingStats.rows[0].new_ratings_30_days)
      },
      popular_categories: categoryStats.rows
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({
      error: {
        message: 'Failed to fetch statistics',
        status: 500
      }
    });
  }
});

// PUT /api/admin/users/:id/toggle-status - Toggle user active status
router.put('/users/:id/toggle-status', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(`
      UPDATE users 
      SET active = NOT active, updated_at = NOW()
      WHERE id = $1
      RETURNING id, name, email, active
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: {
          message: 'User not found',
          status: 404
        }
      });
    }

    const user = result.rows[0];

    res.json({
      message: `User ${user.active ? 'activated' : 'deactivated'} successfully`,
      user
    });
  } catch (error) {
    console.error('Admin toggle user status error:', error);
    res.status(500).json({
      error: {
        message: 'Failed to toggle user status',
        status: 500
      }
    });
  }
});

module.exports = router;