;
import { Op } from 'sequelize';
import { Skill, User } from '../models';
import { AuthRequest } from '../middlewares/auth';
import { z } from 'zod';

// Validation schemas
const createSkillSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(1),
  category: z.string().min(1).max(50),
  skillLevel: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
  skillType: z.enum(['offering', 'seeking']),
  timeCommitment: z.string().optional(),
  location: z.string().optional(),
});

const updateSkillSchema = createSkillSchema.partial();

export const getAllSkills = async (req, res, next) => {
  try {
    const { category, skillType, skillLevel, search } = req.query;
    
    const whereClause = {
      isActive: true
    };

    if (category) whereClause.category = category;
    if (skillType) whereClause.skillType = skillType;
    if (skillLevel) whereClause.skillLevel = skillLevel;
    if (search) {
      whereClause[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const skills = await Skill.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'firstName', 'lastName', 'averageRating', 'totalRatings']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json({
      skills,
      total: skills.length
    });
  } catch (error) {
    next(error);
  }
};

export const getSkillById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const skill = await Skill.findByPk(id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'firstName', 'lastName', 'bio', 'location', 'averageRating', 'totalRatings']
        }
      ]
    });

    if (!skill) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    res.json(skill);
  } catch (error) {
    next(error);
  }
};

export const createSkill = async (req, res, next) => {
  try {
    const validatedData = createSkillSchema.parse(req.body);
    
    const skill = await Skill.create({
      ...validatedData,
      userId: req.user.id,
    });

    const skillWithUser = await Skill.findByPk(skill.id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'firstName', 'lastName', 'averageRating', 'totalRatings']
        }
      ]
    });

    res.status(201).json({
      message: 'Skill created successfully',
      skill: skillWithUser
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.errors 
      });
    }
    next(error);
  }
};

export const updateSkill = async (req, res, next) => {
  try {
    const { id } = req.params;
    const validatedData = updateSkillSchema.parse(req.body);

    const skill = await Skill.findByPk(id);

    if (!skill) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    // Check if user owns the skill
    if (skill.userId !== req.user.id) {
      return res.status(403).json({ error: 'You can only update your own skills' });
    }

    await skill.update(validatedData);

    const updatedSkill = await Skill.findByPk(id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'firstName', 'lastName', 'averageRating', 'totalRatings']
        }
      ]
    });

    res.json({
      message: 'Skill updated successfully',
      skill: updatedSkill
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.errors 
      });
    }
    next(error);
  }
};

export const deleteSkill = async (req, res, next) => {
  try {
    const { id } = req.params;

    const skill = await Skill.findByPk(id);

    if (!skill) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    // Check if user owns the skill
    if (skill.userId !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own skills' });
    }

    await skill.destroy();

    res.json({
      message: 'Skill deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};
