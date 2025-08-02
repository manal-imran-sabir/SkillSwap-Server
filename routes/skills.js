const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticateToken, requireOwnerOrAdmin } = require('../middleware/auth');

const router = express.Router();

// Validation rules
const skillValidation = [
  body('title').trim().isLength({ min: 3, max: 100 }).withMessage('Title must be between 3-100 characters'),
  body('description').trim().isLength({ min: 10, max: 1000 }).withMessage('Description must be between 10-1000 characters'),
  body('category').trim().isLength({ min: 2, max: 50 }).withMessage('Category must be between 2-50 characters'),
  body('tags').optional().isArray().withMessage('Tags must be an array'),
  body('image_url').optional().isURL().withMessage('Image URL must be valid')
];

// GET /api/skills - Get all skills with filtering
router.get('/', async (req, res) => {
  try {
    const { 
      category, 
      search, 
      page = 1, 
      limit = 20, 
      sort = 'created_at',
      order = 'DESC' 
    } = req.query;

    const offset = (page - 1) * limit;
    let queryText = `
      SELECT 
        s.id, s.title, s.description, s.category, s.tags, s.image_url, s.created_at,
        u.name as creator_name, u.id as creator_id,
        COALESCE(AVG(r.rating), 0) as average_rating,
        COUNT(r.id) as rating_count
      FROM skills s
      JOIN users u ON s.created_by = u.id
      LEFT JOIN ratings r ON u.id = r.rated_user_id
      WHERE s.active = true AND u.active = true
    `;

    const queryParams = [];
    let paramCount = 0;

    // Add category filter
    if (category) {
      paramCount++;
      queryText += ` AND s.category ILIKE $${paramCount}`;
      queryParams.push(`%${category}%`);
    }

    // Add search filter
    if (search) {
      paramCount++;
      queryText += ` AND (s.title ILIKE $${paramCount} OR s.description ILIKE $${paramCount} OR s.category ILIKE $${paramCount})`;
      queryParams.push(`%${search}%`);
    }

    queryText += ` GROUP BY s.id, u.name, u.id`;

    // Add sorting
    const validSortFields = ['created_at', 'title', 'category'];
    const validOrder = ['ASC', 'DESC'];
    const sortField = validSortFields.includes(sort) ? sort : 'created_at';
    const sortOrder = validOrder.includes(order.toUpperCase()) ? order.toUpperCase() : 'DESC';
    
    queryText += ` ORDER BY s.${sortField} ${sortOrder}`;

    // Add pagination
    paramCount++;
    queryText += ` LIMIT $${paramCount}`;
    queryParams.push(limit);

    paramCount++;
    queryText += ` OFFSET $${paramCount}`;
    queryParams.push(offset);

    const result = await query(queryText, queryParams);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(s.id) as total
      FROM skills s
      JOIN users u ON s.created_by = u.id
      WHERE s.active = true AND u.active = true
    `;

    const countParams = [];
    let countParamCount = 0;

    if (category) {
      countParamCount++;
      countQuery += ` AND s.category ILIKE $${countParamCount}`;
      countParams.push(`%${category}%`);
    }

    if (search) {
      countParamCount++;
      countQuery += ` AND (s.title ILIKE $${countParamCount} OR s.description ILIKE $${countParamCount} OR s.category ILIKE $${countParamCount})`;
      countParams.push(`%${search}%`);
    }

    const countResult = await query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      skills: result.rows.map(skill => ({
        ...skill,
        average_rating: parseFloat(skill.average_rating).toFixed(1),
        rating_count: parseInt(skill.rating_count)
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get skills error:', error);
    res.status(500).json({
      error: {
        message: 'Failed to fetch skills',
        status: 500
      }
    });
  }
});

// GET /api/skills/:id - Get single skill
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(`
      SELECT 
        s.id, s.title, s.description, s.category, s.tags, s.image_url, s.created_at, s.updated_at,
        u.name as creator_name, u.id as creator_id, u.avatar_url as creator_avatar,
        COALESCE(AVG(r.rating), 0) as creator_rating,
        COUNT(r.id) as creator_rating_count
      FROM skills s
      JOIN users u ON s.created_by = u.id
      LEFT JOIN ratings r ON u.id = r.rated_user_id
      WHERE s.id = $1 AND s.active = true AND u.active = true
      GROUP BY s.id, u.name, u.id, u.avatar_url
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: {
          message: 'Skill not found',
          status: 404
        }
      });
    }

    const skill = result.rows[0];

    res.json({
      ...skill,
      creator_rating: parseFloat(skill.creator_rating).toFixed(1),
      creator_rating_count: parseInt(skill.creator_rating_count)
    });
  } catch (error) {
    console.error('Get skill error:', error);
    res.status(500).json({
      error: {
        message: 'Failed to fetch skill',
        status: 500
      }
    });
  }
});

// POST /api/skills - Create new skill
router.post('/', authenticateToken, skillValidation, async (req, res) => {
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

    const { title, description, category, tags = [], image_url } = req.body;

    const result = await query(`
      INSERT INTO skills (title, description, category, tags, image_url, created_by, active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW())
      RETURNING id, title, description, category, tags, image_url, created_at
    `, [title, description, category, JSON.stringify(tags), image_url, req.user.id]);

    const newSkill = result.rows[0];

    res.status(201).json({
      message: 'Skill created successfully',
      skill: {
        ...newSkill,
        creator_name: req.user.name,
        creator_id: req.user.id
      }
    });
  } catch (error) {
    console.error('Create skill error:', error);
    res.status(500).json({
      error: {
        message: 'Failed to create skill',
        status: 500
      }
    });
  }
});

// PUT /api/skills/:id - Update skill
router.put('/:id', authenticateToken, skillValidation, async (req, res) => {
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
    const { title, description, category, tags = [], image_url } = req.body;

    // Check if skill exists and user has permission
    const existingSkill = await query(
      'SELECT created_by FROM skills WHERE id = $1 AND active = true',
      [id]
    );

    if (existingSkill.rows.length === 0) {
      return res.status(404).json({
        error: {
          message: 'Skill not found',
          status: 404
        }
      });
    }

    // Check ownership or admin role
    if (req.user.role !== 'admin' && existingSkill.rows[0].created_by !== req.user.id) {
      return res.status(403).json({
        error: {
          message: 'Access denied - you can only edit your own skills',
          status: 403
        }
      });
    }

    const result = await query(`
      UPDATE skills 
      SET 
        title = $1,
        description = $2,
        category = $3,
        tags = $4,
        image_url = $5,
        updated_at = NOW()
      WHERE id = $6 AND active = true
      RETURNING id, title, description, category, tags, image_url, updated_at
    `, [title, description, category, JSON.stringify(tags), image_url, id]);

    res.json({
      message: 'Skill updated successfully',
      skill: result.rows[0]
    });
  } catch (error) {
    console.error('Update skill error:', error);
    res.status(500).json({
      error: {
        message: 'Failed to update skill',
        status: 500
      }
    });
  }
});

// DELETE /api/skills/:id - Delete skill
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if skill exists and user has permission
    const existingSkill = await query(
      'SELECT created_by FROM skills WHERE id = $1 AND active = true',
      [id]
    );

    if (existingSkill.rows.length === 0) {
      return res.status(404).json({
        error: {
          message: 'Skill not found',
          status: 404
        }
      });
    }

    // Check ownership or admin role
    if (req.user.role !== 'admin' && existingSkill.rows[0].created_by !== req.user.id) {
      return res.status(403).json({
        error: {
          message: 'Access denied - you can only delete your own skills',
          status: 403
        }
      });
    }

    // Soft delete skill
    const result = await query(`
      UPDATE skills 
      SET active = false, updated_at = NOW()
      WHERE id = $1
      RETURNING id, title
    `, [id]);

    res.json({
      message: 'Skill deleted successfully',
      skill: result.rows[0]
    });
  } catch (error) {
    console.error('Delete skill error:', error);
    res.status(500).json({
      error: {
        message: 'Failed to delete skill',
        status: 500
      }
    });
  }
});

module.exports = router;
