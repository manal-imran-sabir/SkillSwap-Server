
import { Rating, User } from '../models';
import { AuthRequest } from '../middlewares/auth.js';
import { z } from 'zod';
import sequelize from '../config/database.js';

// Validation schema
const createRatingSchema = z.object({
  ratedUserId: z.number().int().positive(),
  skillId: z.number().int().positive().optional(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

export const createRating = async (req, res, next) => {
  try {
    const validatedData = createRatingSchema.parse(req.body);
    
    // Check if user is trying to rate themselves
    if (validatedData.ratedUserId === req.user.id) {
      return res.status(400).json({ error: 'You cannot rate yourself' });
    }

    // Check if user already rated this person
    const existingRating = await Rating.findOne({
      where: {
        raterId: req.user.id,
        ratedUserId: validatedData.ratedUserId,
        ...(validatedData.skillId && { skillId: validatedData.skillId })
      }
    });

    if (existingRating) {
      return res.status(400).json({ error: 'You have already rated this user for this skill' });
    }

    // Create the rating
    const rating = await Rating.create({
      ...validatedData,
      raterId: req.user.id,
    });

    // Update user's average rating
    await updateUserAverageRating(validatedData.ratedUserId);

    const ratingWithDetails = await Rating.findByPk(rating.id, {
      include: [
        {
          model: User,
          as: 'rater',
          attributes: ['id', 'username', 'firstName', 'lastName']
        },
        {
          model: User,
          as: 'ratedUser',
          attributes: ['id', 'username', 'firstName', 'lastName']
        }
      ]
    });

    res.status(201).json({
      message: 'Rating created successfully',
      rating: ratingWithDetails
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

export const getUserRatings = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const ratings = await Rating.findAll({
      where: {
        ratedUserId: userId
      },
      include: [
        {
          model: User,
          as: 'rater',
          attributes: ['id', 'username', 'firstName', 'lastName']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json({
      ratings,
      total: ratings.length
    });
  } catch (error) {
    next(error);
  }
};

// Helper function to update user's average rating
const updateUserAverageRating = async (userId) => {
  const result = await Rating.findAll({
    where: { ratedUserId: userId },
    attributes: [
      [sequelize.fn('AVG', sequelize.col('rating')), 'averageRating'],
      [sequelize.fn('COUNT', sequelize.col('rating')), 'totalRatings']
    ],
    raw: true
  });

  if (result.length > 0) {
    const { averageRating, totalRatings } = result[0];
    
    await User.update(
      {
        averageRating: parseFloat(averageRating).toFixed(2),
        totalRatings: parseInt(totalRatings)
      },
      {
        where: { id: userId }
      }
    );
  }
};
