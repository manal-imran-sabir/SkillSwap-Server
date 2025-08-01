
import * as models from '../models/index.js';
import { Op } from 'sequelize';

export const getAllUsers = async (req, res, next) => {
  try {
    const { search } = req.query;
    
    const whereClause = {};

    if (search) {
      whereClause[Op.or] = [
        { username: { [Op.iLike]: `%${search}%` } },
        { firstName: { [Op.iLike]: `%${search}%` } },
        { lastName: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const users = await User.findAll({
      where: whereClause,
      attributes: { exclude: ['password'] },
      include: [
        {
          model: Skill,
          as: 'skills',
          where: { isActive: true },
          required: false,
          attributes: ['id', 'title', 'category', 'skillType', 'skillLevel']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json({
      users,
      total: users.length
    });
  } catch (error) {
    next(error);
  }
};

export const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id, {
      attributes: { exclude: ['password'] },
      include: [
        {
          model: Skill,
          as: 'skills',
          where: { isActive: true },
          required: false
        },
        {
          model: Rating,
          as: 'receivedRatings',
          include: [
            {
              model: User,
              as: 'rater',
              attributes: ['id', 'username', 'firstName', 'lastName']
            }
          ]
        }
      ]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    next(error);
  }
}
export default {
  getAllUsers,
  getUserById
}